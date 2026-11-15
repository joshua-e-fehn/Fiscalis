"""python3 -m unittest discover -s ops/convex-backup (no dependencies)."""

import base64
import hashlib
import importlib.util
import io
import json
import pathlib
import subprocess
import tempfile
import unittest
import urllib.error
import zipfile

HERE = pathlib.Path(__file__).parent


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


hm = _load("monitor", HERE.parent / "health-monitor" / "fiscalis-health-monitor.py")
backup = _load("backup", HERE / "fiscalis-convex-backup.py")

PROD_KEY = "CONVEX_DEPLOY_KEY=prod:handsome-gecko-941|secretpart\n"
WRITER = (
    "FISCALIS_CONVEX_BACKUP_ACCESS_KEY_ID=AKIATEST\n"
    "FISCALIS_CONVEX_BACKUP_SECRET_ACCESS_KEY=supersecret\n"
    "FISCALIS_CONVEX_BACKUP_BUCKET=fiscalis-convex-backups-866827143157\n"
)
SLACK = "SLACK_BOT_TOKEN=xoxb-test\nSLACK_HOME_CHANNEL=C123\n"
CLOCK = lambda: 1794703500.0  # noqa: E731 - 2026-11-15 00:45 UTC


def snapshot(path, tables):
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("README.md", "snapshot")
        archive.writestr("_tables/documents.jsonl", "".join(json.dumps({"name": t}) + "\n" for t in tables))
        for table, n in tables.items():
            archive.writestr(f"{table}/documents.jsonl", "".join(json.dumps({"_id": i}) + "\n" for i in range(n)))


class Response(io.BytesIO):
    def __init__(self, status=200, headers=None, body=b""):
        super().__init__(body)
        self.status, self.headers = status, headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class Opener:
    """Records requests; answers S3 PUTs from `puts` and Slack with ok."""

    def __init__(self, puts=None):
        self.puts, self.requests, self.slack = list(puts or []), [], []

    def __call__(self, request, timeout=None):
        if "slack.com" in request.full_url:
            self.slack.append(json.loads(request.data)["text"])
            return Response(body=b'{"ok": true}')
        body = request.data.read()
        self.requests.append((request, body))
        answer = self.puts.pop(0) if self.puts else 200
        if isinstance(answer, int) and answer >= 300:
            raise urllib.error.HTTPError(request.full_url, answer, "err", {}, io.BytesIO(b"<Code>AccessDenied</Code>"))
        checksum = base64.b64encode(hashlib.sha256(body).digest()).decode()
        return Response(headers={"x-amz-checksum-sha256": checksum, "x-amz-version-id": "v1"})


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        (self.dir / "convex.env").write_text(PROD_KEY)
        (self.dir / "writer.env").write_text(WRITER)
        (self.dir / "monitor.env").write_text(SLACK)
        self.environ = {
            "FISCALIS_CONVEX_ENV": str(self.dir / "convex.env"),
            "FISCALIS_WRITER_ENV": str(self.dir / "writer.env"),
            "FISCALIS_HEALTH_ENV": str(self.dir / "monitor.env"),
            "FISCALIS_BACKUP_WORK": str(self.dir / "cache"),
        }
        self.commands = []

    def runner(self, tables):
        def run(command, **kwargs):
            self.commands.append((command, kwargs))
            snapshot(command[command.index("--path") + 1], tables)
            return subprocess.CompletedProcess(command, 0, "Downloaded snapshot export\n", "")
        return run

    def main(self, opener, runner, *argv):
        return backup.main(list(argv), environ=self.environ, hm=hm, opener=opener, runner=runner,
                           clock=CLOCK, sleep=lambda s: None)  # fmt: skip


class BackupTest(Base):
    def test_backup_uploads_verified_zip_and_deletes_it(self):
        opener = Opener()
        self.assertEqual(self.main(opener, self.runner({"loans": 3, "fxRates": 5})), 0)
        (request, body), = opener.requests
        self.assertEqual(request.get_method(), "PUT")
        self.assertTrue(request.full_url.endswith(
            "/fiscalis-convex-backups-866827143157/backups/2026-11-15.zip"))
        self.assertEqual(request.get_header("X-amz-content-sha256"), hashlib.sha256(body).hexdigest())
        self.assertEqual(request.get_header("X-amz-checksum-sha256"),
                         base64.b64encode(hashlib.sha256(body).digest()).decode())
        self.assertIn("Credential=AKIATEST/20261115/eu-central-1/s3/aws4_request",
                      request.get_header("Authorization"))
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            self.assertEqual(archive.read("loans/documents.jsonl").count(b"\n"), 3)
        self.assertFalse((self.dir / "cache" / "work").exists())
        self.assertEqual(opener.slack, [])
        command, kwargs = self.commands[0]
        self.assertEqual(command[2:5], ["export", "--env-file", str(self.dir / "convex.env")])
        self.assertNotIn("secretpart", json.dumps([command, kwargs["env"]]))

    def test_other_deployment_key_is_refused_and_alerted(self):
        (self.dir / "convex.env").write_text("CONVEX_DEPLOY_KEY=dev:blessed-ermine-693|x\n")
        opener = Opener()
        self.assertEqual(self.main(opener, self.runner({"loans": 1})), 1)
        self.assertEqual(self.commands, [])
        self.assertEqual(len(opener.slack), 1)
        self.assertIn("refusing", opener.slack[0])

    def test_empty_export_fails_without_upload(self):
        opener = Opener()
        self.assertEqual(self.main(opener, self.runner({"loans": 0})), 1)
        self.assertEqual(opener.requests, [])
        self.assertIn("no document", opener.slack[0])
        self.assertFalse((self.dir / "cache" / "work").exists())

    def test_put_retries_5xx_then_fails_on_4xx(self):
        opener = Opener(puts=[500, 403])
        self.assertEqual(self.main(opener, self.runner({"loans": 1})), 1)
        self.assertEqual(len(opener.requests), 2)
        self.assertIn("S3 PUT HTTP 403 AccessDenied", opener.slack[0])
        self.assertNotIn("supersecret", opener.slack[0])

    def test_export_failure_alerts(self):
        def failing(command, **kwargs):
            return subprocess.CompletedProcess(command, 1, "", "Error: 401 Unauthorized\n")
        opener = Opener()
        self.assertEqual(self.main(opener, failing), 1)
        self.assertIn("convex export failed (exit 1)", opener.slack[0])

    def test_dry_run_sends_nothing(self):
        opener = Opener()
        tools, backup.TOOLS = backup.TOOLS, self.dir  # no toolchain here: the dry run reports it
        self.addCleanup(setattr, backup, "TOOLS", tools)
        self.assertEqual(self.main(opener, self.runner({"loans": 1}), "--dry-run"), 1)
        self.assertEqual((opener.requests, opener.slack, self.commands), ([], [], []))

    def test_test_alert(self):
        opener = Opener()
        self.assertEqual(self.main(opener, self.runner({}), "--test-alert"), 0)
        self.assertTrue(opener.slack[0].startswith("[TEST]"))


if __name__ == "__main__":
    unittest.main()
