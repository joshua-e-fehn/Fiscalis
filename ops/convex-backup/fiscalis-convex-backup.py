#!/usr/bin/python3
"""Fiscalis weekly Convex prod backup: ``convex export`` to S3, Slack on failure.

Runs on the Mya VPS, started by ``fiscalis-convex-backup.timer`` (Sundays
03:15 UTC). See README.md in this directory for install, operation and the
restore procedure (docs/ROLLBACK.md).

1. ``convex export --env-file <prod key> --path <work>/YYYY-MM-DD.zip`` with
   the pinned CLI and node in ``/usr/local/lib/fiscalis-convex-backup``. The
   deploy key is read by the CLI from its systemd credential; it never enters
   the environment or a command line.
2. The ZIP is read back whole: every member's CRC, ``_tables/documents.jsonl``
   present, at least one document. The per-table counts go to the journal.
3. A single SigV4-signed ``PUT`` to ``s3://<bucket>/backups/YYYY-MM-DD.zip``
   with ``x-amz-checksum-sha256`` (S3 rejects a body that does not match; the
   bucket has Object Lock, which needs a checksum). The writer key may only
   ``PutObject`` under ``backups/`` and ``ListBucket``: it cannot read or
   delete a backup.
4. The local ZIP is deleted whatever happened.

Any failure posts to Mya's Slack home channel with the fiscalis-health-monitor's
own ``slack_post`` (same bot, same ``monitor.env``), and exits non-zero.

``--dry-run`` checks the configuration and the toolchain, exports nothing and
sends nothing. ``--test-alert`` posts one ``[TEST]`` message to Slack.
Standard library only; the signing and Slack code are imported from the
installed health monitor so there is one implementation of each.
"""

from __future__ import annotations

import argparse
import base64
import datetime
import hashlib
import http.client
import importlib.util
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from typing import Any, Callable, Mapping

MONITOR_LIB = os.environ.get(
    "FISCALIS_HEALTH_MONITOR_LIB",
    "/usr/local/lib/fiscalis-health-monitor/fiscalis-health-monitor.py",
)
TOOLS = pathlib.Path(os.environ.get("FISCALIS_BACKUP_TOOLS", "/usr/local/lib/fiscalis-convex-backup"))
#: The one deployment this job may export. A key for any other is refused.
DEPLOYMENT = "handsome-gecko-941"
PREFIX = "backups"
WRITER_KEYS = (
    "FISCALIS_CONVEX_BACKUP_ACCESS_KEY_ID",
    "FISCALIS_CONVEX_BACKUP_SECRET_ACCESS_KEY",
    "FISCALIS_CONVEX_BACKUP_BUCKET",
)
SLACK_KEYS = ("SLACK_BOT_TOKEN", "SLACK_HOME_CHANNEL")
EXPORT_TIMEOUT = 3600
PUT_TIMEOUT = 600
#: A single PUT takes up to 5 GiB; well below that, so a large export fails loudly.
MAX_BYTES = 4 * 1024**3
_BUCKET = re.compile(r"fiscalis-convex-backups-\d{12}")

Opener = Callable[..., Any]
Runner = Callable[..., subprocess.CompletedProcess]


def load_monitor(path: str = MONITOR_LIB):
    """The installed fiscalis-health-monitor module (sigv4, slack_post, read_env)."""
    spec = importlib.util.spec_from_file_location("fiscalis_health_monitor", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot load the health monitor from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Failure(RuntimeError):
    """A step failed; the message is safe to print and to post (no secret in it)."""


def log(text: str) -> None:
    print(f"fiscalis-convex-backup: {text}", file=sys.stderr, flush=True)


def credential(environ: Mapping[str, str], override: str, name: str) -> pathlib.Path:
    """$override, else the systemd credential `name`."""
    if environ.get(override):
        return pathlib.Path(environ[override])
    creds = environ.get("CREDENTIALS_DIRECTORY")
    if not creds:
        raise Failure(f"no credential {name}: run through fiscalis-convex-backup.service")
    return pathlib.Path(creds) / name


def check_deploy_key(hm, path: pathlib.Path) -> None:
    """The key file names prod:handsome-gecko-941; the value is never printed."""
    try:
        key = hm.read_env(path, ("CONVEX_DEPLOY_KEY",)).get("CONVEX_DEPLOY_KEY", "")
    except OSError:
        raise Failure("the Convex key file is not readable") from None
    if not key.startswith(f"prod:{DEPLOYMENT}|"):
        raise Failure(f"the Convex key file holds no prod:{DEPLOYMENT} deploy key; refusing")


def writer_settings(hm, path: pathlib.Path) -> dict[str, str]:
    try:
        settings = hm.read_env(path, WRITER_KEYS)
    except OSError:
        raise Failure("the S3 writer key file is not readable") from None
    missing = [k for k in WRITER_KEYS if not settings.get(k)]
    if missing:
        raise Failure(f"the S3 writer key file lacks {', '.join(missing)}")
    if not _BUCKET.fullmatch(settings["FISCALIS_CONVEX_BACKUP_BUCKET"]):
        raise Failure("FISCALIS_CONVEX_BACKUP_BUCKET is not a fiscalis-convex-backups-<account> bucket")
    return settings


def convex_command() -> list[str]:
    return [str(TOOLS / "node" / "bin" / "node"), str(TOOLS / "node_modules" / "convex" / "bin" / "main.js")]


def export(key_file: pathlib.Path, target: pathlib.Path, runner: Runner) -> None:
    """``convex export`` of prod into `target` (cwd: the pinned CLI's package)."""
    environ = {"PATH": f"{TOOLS / 'node' / 'bin'}:/usr/bin:/bin", "HOME": os.environ.get("HOME", str(target.parent)),
               "CONVEX_TELEMETRY_DISABLED": "1", "NO_COLOR": "1"}  # fmt: skip
    command = [*convex_command(), "export", "--env-file", str(key_file), "--path", str(target)]
    try:
        done = runner(command, cwd=str(TOOLS), env=environ, stdin=subprocess.DEVNULL,
                      capture_output=True, text=True, timeout=EXPORT_TIMEOUT, check=False)  # fmt: skip
    except subprocess.TimeoutExpired:
        raise Failure(f"convex export timed out after {EXPORT_TIMEOUT // 60} min") from None
    except OSError as error:
        raise Failure(f"convex export did not start ({type(error).__name__})") from None
    # The CLI's output names the deployment and the snapshot, never the key.
    for line in (done.stdout + done.stderr).splitlines()[-8:]:
        if line.strip():
            log(f"convex: {line.strip()[:200]}")
    if done.returncode != 0:
        raise Failure(f"convex export failed (exit {done.returncode})")
    if not target.is_file():
        raise Failure("convex export wrote no ZIP")


def verify_zip(path: pathlib.Path) -> dict[str, int]:
    """Documents per table; every member read back (CRC), at least one document."""
    try:
        with zipfile.ZipFile(path) as archive:
            bad = archive.testzip()
            if bad is not None:
                raise Failure(f"the export is corrupt (bad CRC in {bad[:80]})")
            counts: dict[str, int] = {}
            for name in archive.namelist():
                if name.endswith("/documents.jsonl"):
                    with archive.open(name) as member:
                        counts[name[: -len("/documents.jsonl")]] = sum(1 for line in member if line.strip())
    except zipfile.BadZipFile:
        raise Failure("the export is not a ZIP") from None
    if "_tables" not in counts:
        raise Failure("the export has no _tables/documents.jsonl: not a Convex snapshot")
    if sum(n for t, n in counts.items() if not t.endswith("_tables")) == 0:
        raise Failure("the export holds no document at all")
    return counts


def sha256_file(path: pathlib.Path) -> hashlib._Hash:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest


def put_backup(hm, settings: Mapping[str, str], key: str, path: pathlib.Path, opener: Opener,
               clock: Callable[[], float] = time.time, sleep: Callable[[float], None] = time.sleep) -> str:  # fmt: skip
    """One signed PUT of `path` to `key`; returns the object's version id."""
    size = path.stat().st_size
    if size > MAX_BYTES:
        raise Failure(f"the export is {size} bytes, over the single-PUT limit of this job")
    digest = sha256_file(path)
    payload_hash, checksum = digest.hexdigest(), base64.b64encode(digest.digest()).decode()
    bucket = settings["FISCALIS_CONVEX_BACKUP_BUCKET"]
    uri = urllib.parse.quote(f"/{bucket}/{key}", safe="/-_.~")
    for attempt in range(3):
        amz_date = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(clock()))
        headers = {
            "host": hm.S3_HOST, "content-length": str(size), "content-type": "application/zip",
            "x-amz-checksum-sha256": checksum, "x-amz-content-sha256": payload_hash, "x-amz-date": amz_date,
        }  # fmt: skip
        auth = hm.sigv4_authorization(
            "PUT", uri, "", headers, payload_hash, settings["FISCALIS_CONVEX_BACKUP_ACCESS_KEY_ID"],
            settings["FISCALIS_CONVEX_BACKUP_SECRET_ACCESS_KEY"], hm.S3_REGION, "s3", amz_date,
        )  # fmt: skip
        sent = {k: v for k, v in headers.items() if k != "host"}
        try:
            with path.open("rb") as body:
                request = urllib.request.Request(
                    f"https://{hm.S3_HOST}{uri}", data=body, method="PUT",
                    headers={**sent, "Authorization": auth, "User-Agent": "fiscalis-convex-backup"},
                )  # fmt: skip
                with opener(request, timeout=PUT_TIMEOUT) as response:
                    if response.headers.get("x-amz-checksum-sha256", checksum) != checksum:
                        raise Failure("S3 stored a different checksum than was sent")
                    return response.headers.get("x-amz-version-id", "")
        except urllib.error.HTTPError as error:
            code = error.code
            if code < 500 or attempt == 2:
                raise Failure(f"S3 PUT HTTP {code} {s3_error_code(error)}") from None
        except (urllib.error.URLError, http.client.HTTPException, OSError) as error:
            if attempt == 2:
                raise Failure(f"S3 PUT failed ({type(error).__name__})") from None
        sleep(5 * (attempt + 1))
    raise AssertionError("unreachable")


def s3_error_code(error: urllib.error.HTTPError) -> str:
    try:
        match = re.search(rb"<Code>([A-Za-z]{1,64})</Code>", error.read(4096) or b"")
    except OSError:
        return ""
    return match.group(1).decode() if match else ""


def alert(hm, environ: Mapping[str, str], text: str, opener: Opener) -> bool:
    """Slack through the health monitor's slack_post; False when it did not go out."""
    try:
        settings = hm.read_env(credential(environ, "FISCALIS_HEALTH_ENV", "monitor-env"), SLACK_KEYS)
        hm.slack_post(settings, text, opener)
        return True
    except (Failure, OSError, hm.NotifyError) as error:
        log(f"slack alert not sent: {error}")
        return False


def run(environ: Mapping[str, str], hm, opener: Opener, runner: Runner, clock: Callable[[], float],
        sleep: Callable[[float], None], dry_run: bool) -> dict[str, Any]:  # fmt: skip
    key_file = credential(environ, "FISCALIS_CONVEX_ENV", "convex-env")
    check_deploy_key(hm, key_file)
    settings = writer_settings(hm, credential(environ, "FISCALIS_WRITER_ENV", "writer-env"))
    day = datetime.datetime.fromtimestamp(clock(), datetime.timezone.utc).date().isoformat()
    key = f"{PREFIX}/{day}.zip"
    if dry_run:
        missing = [p for p in convex_command() if not pathlib.Path(p).is_file()]
        if missing:
            raise Failure(f"toolchain missing: {', '.join(missing)}")
        return {"dry_run": True, "would_upload": f"s3://{settings['FISCALIS_CONVEX_BACKUP_BUCKET']}/{key}"}
    work = pathlib.Path(environ.get("FISCALIS_BACKUP_WORK") or environ.get("CACHE_DIRECTORY") or "/tmp")
    work = work / "work"
    shutil.rmtree(work, ignore_errors=True)  # a previous run's leftovers
    work.mkdir(mode=0o700, parents=True)
    target = work / f"{day}.zip"
    try:
        started = clock()
        export(key_file, target, runner)
        counts = verify_zip(target)
        size = target.stat().st_size
        version = put_backup(hm, settings, key, target, opener, clock, sleep)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return {
        "uploaded": f"s3://{settings['FISCALIS_CONVEX_BACKUP_BUCKET']}/{key}", "version": version,
        "bytes": size, "seconds": round(clock() - started),
        "documents": sum(n for t, n in counts.items() if not t.endswith("_tables")),
        "tables": {t: n for t, n in sorted(counts.items()) if not t.endswith("_tables")},
    }  # fmt: skip


def main(argv: list[str], *, environ: Mapping[str, str] | None = None, hm=None,
         opener: Opener = urllib.request.urlopen, runner: Runner = subprocess.run,
         clock: Callable[[], float] = time.time, sleep: Callable[[float], None] = time.sleep) -> int:  # fmt: skip
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="check config and toolchain; export and send nothing")
    mode.add_argument("--test-alert", action="store_true", help="post one [TEST] message to Slack")
    args = parser.parse_args(argv)
    environ = os.environ if environ is None else environ
    hm = hm or load_monitor()
    if args.test_alert:
        ok = alert(hm, environ, "[TEST] Fiscalis Convex backup: the failure alert reaches this channel.", opener)
        print(json.dumps({"test_alert": "sent" if ok else "failed"}))
        return 0 if ok else 1
    try:
        summary = run(environ, hm, opener, runner, clock, sleep, args.dry_run)
    except Exception as error:  # noqa: BLE001 - every failure alerts; an unexpected one by type only
        if not isinstance(error, Failure):
            error = Failure(f"unexpected {type(error).__name__}")
        log(f"FAILED: {error}")
        if not args.dry_run:
            alert(hm, environ, (
                f":rotating_light: *Fiscalis Convex prod backup FAILED*: {hm.slack_escape(str(error))}\n"
                "Logs: `journalctl -u fiscalis-convex-backup.service -n 50` on the Mya VPS. "
                "Retry: `systemctl start fiscalis-convex-backup.service`."
            ), opener)  # fmt: skip
        return 1
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
