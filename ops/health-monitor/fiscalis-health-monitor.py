#!/usr/bin/python3
"""Fiscalis uptime monitor (ENG-223): GET /health/deep, Slack on state change.

Runs every five minutes on the Mya VPS (fiscalis-health-monitor.timer). Each
run fetches the production Convex deployment's ``/health/deep``
(frontend/convex/http.ts): 200 with ``{"ok": true}`` is healthy; a 503, any
other status, an unparsable body or no answer at all is failing. A new state
is announced in Mya's Slack home channel only once it has been seen on
``CONFIRM_RUNS`` consecutive runs, so one network blip neither alerts nor
"recovers". Nothing is posted while the state stays the same.

- **Slack**: Mya's bot (``SLACK_BOT_TOKEN``) posts to ``SLACK_HOME_CHANNEL``,
  read from the systemd credential ``slack-env`` (a 0600 copy of those two
  lines of Mya's env file that install.sh writes). No other secret is used.
- **State**: ``/var/lib/fiscalis-health-monitor/state.json``. A post that
  fails is retried on the next run (the announced state only moves once
  Slack accepted the message).
- The message carries only check names and ages from the endpoint, which
  holds no user data; names are shape-checked and numbers formatted here,
  so the endpoint cannot inject Slack markup.

``--dry-run`` fetches and prints the decision without posting or saving.
Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Mapping

HEALTH_URL = os.environ.get(
    "FISCALIS_HEALTH_URL", "https://handsome-gecko-941.convex.site/health/deep"
)
STATE_DIR = pathlib.Path(
    os.environ.get("FISCALIS_HEALTH_STATE_DIR", "/var/lib/fiscalis-health-monitor")
)
CONFIRM_RUNS = int(os.environ.get("FISCALIS_HEALTH_CONFIRM_RUNS", "2"))
HTTP_TIMEOUT = 20
SLACK_API = "https://slack.com/api"
CHECK_NAME = re.compile(r"^[a-z0-9-]{1,40}$")


# --- observe ----------------------------------------------------------------------------


def observe(url: str = HEALTH_URL) -> dict[str, Any]:
    """One poll: ``{"ok": bool, "failing": [...], "detail": str}``."""
    request = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": "fiscalis-health-monitor"}
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    except (urllib.error.URLError, OSError) as error:
        return {"ok": False, "failing": [], "detail": f"unreachable ({type(error).__name__})"}
    return parse_report(status, raw)


def parse_report(status: int, raw: bytes) -> dict[str, Any]:
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        body = None
    if not isinstance(body, dict) or not isinstance(body.get("checks"), list):
        return {"ok": False, "failing": [], "detail": f"HTTP {int(status)}, no health report"}
    failing = []
    for check in body["checks"]:
        if not isinstance(check, dict) or check.get("ok") is True:
            continue
        name = str(check.get("name", ""))
        failing.append(
            {
                "name": name if CHECK_NAME.match(name) else "unknown",
                "ageSeconds": _number(check.get("ageSeconds")),
                "threshold": _number(check.get("threshold")),
            }
        )
    ok = status == 200 and body.get("ok") is True and not failing
    detail = "healthy" if ok else f"HTTP {int(status)}"
    if not ok and not failing:
        detail += ", no failing check named"
    return {"ok": ok, "failing": failing, "detail": detail}


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


# --- decide -----------------------------------------------------------------------------


def step(state: Mapping[str, Any], ok: bool, now: float, confirm: int = CONFIRM_RUNS) -> tuple[dict, str | None]:
    """The next state and what to announce: "fail", "recovered" or None.

    ``announced`` is the state Slack last heard of (healthy when there is no
    state yet); ``candidate``/``streak`` count consecutive runs of the
    observed state. The announcement is returned, not applied: the caller
    sets ``announced`` once the post succeeded.
    """
    observed = "ok" if ok else "fail"
    new = dict(state)
    new.setdefault("announced", "ok")
    new.setdefault("announced_since", now)
    if new.get("candidate") == observed:
        new["streak"] = int(new.get("streak", 0)) + 1
    else:
        new["candidate"], new["streak"], new["candidate_since"] = observed, 1, now
    new["checked_at"] = now
    if observed != new["announced"] and new["streak"] >= max(1, confirm):
        return new, "fail" if observed == "fail" else "recovered"
    return new, None


def duration(seconds: float | None) -> str:
    if seconds is None:
        return "none yet"
    seconds = max(0, int(seconds))
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 172800:
        return f"{seconds // 3600}h{(seconds % 3600) // 60:02d}m"
    return f"{seconds // 86400}d"


def message(kind: str, poll: Mapping[str, Any], state: Mapping[str, Any], now: float) -> str:
    if kind == "recovered":
        down = now - float(state.get("announced_since", now))
        return f":white_check_mark: Fiscalis health recovered after {duration(down)} (/health/deep ok)."
    lines = [f":rotating_light: Fiscalis health failing: {poll['detail']}"]
    for check in poll["failing"]:
        lines.append(
            f"- {check['name']}: age {duration(check['ageSeconds'])}, max {duration(check['threshold'])}"
        )
    lines.append(f"<{HEALTH_URL}|/health/deep>")
    return "\n".join(lines)


# --- send -------------------------------------------------------------------------------


def read_env(path: pathlib.Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        match = re.match(r"^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$", line)
        if match:
            values[match.group(1)] = match.group(2).strip("'\"")
    return values


def slack_post(settings: Mapping[str, str], text: str) -> None:
    token, channel = settings.get("SLACK_BOT_TOKEN"), settings.get("SLACK_HOME_CHANNEL")
    if not token or not channel:
        raise RuntimeError("slack-env names no SLACK_BOT_TOKEN or SLACK_HOME_CHANNEL")
    request = urllib.request.Request(
        f"{SLACK_API}/chat.postMessage",
        data=json.dumps(
            {"channel": channel, "text": text, "unfurl_links": False, "unfurl_media": False}
        ).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
        answer = json.loads(response.read().decode("utf-8"))
    if not isinstance(answer, dict) or not answer.get("ok"):
        code = answer.get("error", "no answer") if isinstance(answer, dict) else "no answer"
        raise RuntimeError(f"slack {str(code)[:40]}")


# --- main -------------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="poll and print, post and save nothing")
    args = parser.parse_args(argv)

    state_file = STATE_DIR / "state.json"
    try:
        state = json.loads(state_file.read_text())
    except (OSError, ValueError):
        state = {}
    now = time.time()
    poll = observe()
    new, kind = step(state, poll["ok"], now)
    new["last"] = poll

    if kind and not args.dry_run:
        try:
            creds = pathlib.Path(os.environ.get("CREDENTIALS_DIRECTORY", "/nonexistent"))
            slack_post(read_env(creds / "slack-env"), message(kind, poll, new, now))
            new["announced"] = new["candidate"]
            new["announced_since"] = new["candidate_since"]
            new.pop("notify_error", None)
        except Exception as error:  # retried next run; never print the token
            new["notify_error"] = f"{type(error).__name__}: {error}"[:120]

    print(json.dumps({"decision": kind, "dry_run": args.dry_run, **new}))
    if not args.dry_run:
        STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
        tmp = state_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(new, indent=2) + "\n")
        tmp.replace(state_file)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
