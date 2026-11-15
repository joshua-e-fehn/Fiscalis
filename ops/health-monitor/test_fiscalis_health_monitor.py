"""python3 -m unittest discover -s ops/health-monitor (no dependencies)."""

import base64
import datetime
import hashlib
import importlib.util
import io
import json
import pathlib
import subprocess
import tempfile
import unittest
import unittest.mock
import urllib.error
import urllib.request

_spec = importlib.util.spec_from_file_location(
    "monitor", pathlib.Path(__file__).with_name("fiscalis-health-monitor.py")
)
monitor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(monitor)

H = 3600.0


def report(ok, checks):
    return json.dumps({"ok": ok, "critical": not ok, "checks": checks}).encode()


def check(name, ok=False, severity=None, age=None, threshold=600, detail=None):
    out = {"name": name, "ok": ok, "ageSeconds": age, "threshold": threshold}
    if severity:
        out["severity"] = severity
    if detail:
        out["detail"] = detail
    return out


def failing(*names_and_severity):
    return [monitor.failing_check(n, s) for n, s in names_and_severity]


CRIT = ("metal-price-ticks", "critical")
WARN = ("fx-rates", "warning")


class ParseReport(unittest.TestCase):
    def test_healthy(self):
        poll = monitor.parse_report(200, report(True, [check("fx-rates", ok=True)]))
        self.assertEqual(poll, {"ok": True, "failing": [], "detail": "healthy"})

    def test_failing_checks_carry_severity_and_are_shape_checked(self):
        poll = monitor.parse_report(503, report(False, [
            check("metal-price-ticks", severity="critical", age=900),
            check("<!channel>", threshold=60),
            check("archive-audit", severity="warning"),  # a body cannot claim a pseudo-check
            check("provider-sync", ok=True),
            check("metal-price-coverage", severity="warning", threshold=1380, detail="2026-11-14: 1200 rows"),
            check("new-check"),
        ]))  # fmt: skip
        by_name = {c["name"]: c for c in poll["failing"]}
        self.assertEqual(sorted(by_name), ["metal-price-coverage", "metal-price-ticks", "new-check", "unknown"])
        self.assertEqual(by_name["metal-price-ticks"]["severity"], "critical")
        self.assertEqual(by_name["metal-price-coverage"]["severity"], "warning")
        self.assertEqual(by_name["new-check"]["severity"], "critical")  # unknown, no severity
        self.assertEqual(by_name["unknown"]["severity"], "critical")

    def test_known_checks_without_severity_use_the_table(self):
        poll = monitor.parse_report(503, report(False, [check("provider-sync"), check("metal-price-archive")]))
        self.assertEqual({c["name"]: c["severity"] for c in poll["failing"]},
                         {"provider-sync": "warning", "metal-price-archive": "critical"})  # fmt: skip

    def test_pseudo_checks(self):
        names = lambda p: [c["name"] for c in p["failing"]]  # noqa: E731
        self.assertEqual(names(monitor.parse_report(502, b"<html>bad gateway</html>")), ["unreachable"])
        self.assertEqual(names(monitor.parse_report(503, b"<html>")), ["unreachable"])
        self.assertEqual(names(monitor.parse_report(200, b'{"hello": 1}')), ["invalid"])
        self.assertEqual(names(monitor.parse_report(503, report(True, []))), ["invalid"])
        for poll in (monitor.parse_report(502, b""), monitor.parse_report(200, b"[]")):
            self.assertEqual(poll["failing"][0]["severity"], "critical")

    def test_no_answer_is_unreachable(self):
        def opener(request, timeout):
            raise urllib.error.URLError("down")

        poll = monitor.observe("https://x.convex.site/health/deep", opener)
        self.assertEqual([c["name"] for c in poll["failing"]], ["unreachable"])


class Decide(unittest.TestCase):
    """evaluate() + deliver() over a sequence of polls, one per 5 minutes."""

    def setUp(self):
        self.state, self.sent, self.down = {}, [], set()

    def send(self, channel, text):
        if channel in self.down:
            raise monitor.NotifyError(f"{channel} down")
        self.sent.append((channel, text))

    def run_poll(self, fails, t, confirm=2):
        self.state, due = monitor.evaluate(self.state, fails, t, confirm, 3 * H)
        results = monitor.deliver(self.state, due, self.send, t)
        return due, results

    def channels_sent(self):
        out = [c for c, _ in self.sent]
        self.sent.clear()
        return out

    def test_quiet_while_healthy(self):
        for i in range(5):
            self.assertEqual(self.run_poll([], i * 300.0)[0], {})

    def test_one_blip_is_not_announced(self):
        self.run_poll([], 0)
        self.run_poll(failing(CRIT), 300)
        self.run_poll([], 600)
        self.run_poll([], 900)
        self.assertEqual(self.sent, [])

    def test_critical_goes_to_both_and_recovery_too(self):
        self.run_poll(failing(CRIT), 0)
        self.assertEqual(self.sent, [])
        self.run_poll(failing(CRIT), 300)
        self.assertEqual([c for c, _ in self.sent], ["slack", "whatsapp"])
        self.assertTrue(all("*EMERGENCY*" in text for _, text in self.sent))
        self.assertIn("Newly failing:\n- metal-price-ticks (critical)", self.sent[1][1])
        self.sent.clear()
        self.run_poll(failing(CRIT), 600)
        self.assertEqual(self.sent, [])  # still the same set: quiet
        self.run_poll([], 900)
        self.run_poll([], 1200)
        self.assertEqual([c for c, _ in self.sent], ["slack", "whatsapp"])
        self.assertIn("recovered after", self.sent[0][1])
        self.assertIn("Recovered: metal-price-ticks", self.sent[0][1])

    def test_warning_only_goes_to_slack(self):
        self.run_poll(failing(WARN), 0)
        self.run_poll(failing(WARN), 300)
        self.assertEqual(self.channels_sent(), ["slack"])
        self.run_poll([], 600)
        self.run_poll([], 900)
        self.assertEqual(self.channels_sent(), ["slack"])

    def test_set_changes_name_new_recovered_and_still(self):
        self.run_poll(failing(WARN), 0)
        self.run_poll(failing(WARN), 300)
        self.channels_sent()
        self.run_poll(failing(WARN, CRIT), 600)
        self.run_poll(failing(WARN, CRIT), 900)
        texts = dict(self.sent)
        self.channels_sent()
        self.assertEqual(sorted(texts), ["slack", "whatsapp"])
        self.assertIn("Newly failing:\n- metal-price-ticks", texts["slack"])
        self.assertIn("Still failing:\n- fx-rates (warning)", texts["slack"])
        # WhatsApp was kept in step silently, so it also sees fx-rates as "still"
        self.assertIn("Still failing:\n- fx-rates", texts["whatsapp"])
        self.run_poll(failing(WARN), 1200)
        self.run_poll(failing(WARN), 1500)
        texts = dict(self.sent)
        self.assertEqual(sorted(texts), ["slack", "whatsapp"])  # recovery from critical: both
        self.assertIn("critical failure recovered, warnings remain", texts["whatsapp"])
        self.assertIn("Recovered: metal-price-ticks", texts["whatsapp"])

    def test_confirmation_runs_apply_to_the_set(self):
        self.run_poll(failing(WARN), 0, confirm=3)
        self.run_poll(failing(WARN), 300, confirm=3)
        self.assertEqual(self.sent, [])
        self.run_poll(failing(WARN), 600, confirm=3)
        self.assertEqual(self.channels_sent(), ["slack"])

    def assert_emergency_within(self, polls, runs=40):
        """`polls(i)` is run i's failing checks; the critical must reach both channels."""
        for i in range(runs):
            self.run_poll(polls(i), i * 300.0)
        whatsapp = [t for c, t in self.sent if c == "whatsapp"]
        self.assertTrue(whatsapp, "no WhatsApp emergency")
        self.assertIn("*EMERGENCY*", whatsapp[0])
        self.assertIn("metal-price-ticks (critical)", whatsapp[0])
        self.assertIn("metal-price-ticks", self.state["confirmed"]["set"])

    def test_a_flapping_warning_does_not_hide_a_constant_critical(self):
        self.assert_emergency_within(lambda i: failing(CRIT, WARN) if i % 2 else failing(CRIT))
        self.assertEqual(self.state["channels"]["whatsapp"]["set"], self.state["confirmed"]["set"])

    def test_alternating_timeouts_do_not_hide_a_constant_critical(self):
        self.assert_emergency_within(lambda i: failing(("unreachable", "critical")) if i % 2 else failing(CRIT))
        # a timeout neither fails nor clears ticks: no recovery is announced in between
        self.assertFalse([t for _, t in self.sent if "Recovered: metal-price-ticks" in t])

    def test_an_intermittent_critical_is_confirmed(self):
        self.assert_emergency_within(lambda i: failing(CRIT) if i % 2 else [])
        changes = [t for c, t in self.sent if c == "whatsapp" and "(reminder)" not in t]
        self.assertEqual(len(changes), 1)  # announced once, not on every flap

    def test_a_timeout_does_not_clear_a_confirmed_critical(self):
        self.run_poll(failing(CRIT), 0)
        self.run_poll(failing(CRIT), 300)
        self.channels_sent()
        for i in range(2, 6):
            self.run_poll(failing(("unreachable", "critical")), i * 300.0)
        self.assertIn("metal-price-ticks", self.state["confirmed"]["set"])
        self.assertFalse([t for _, t in self.sent if "Recovered: metal-price-ticks" in t])

    def test_reminders_while_critical(self):
        self.run_poll(failing(CRIT), 0)
        self.run_poll(failing(CRIT), 300)
        self.channels_sent()
        self.run_poll(failing(CRIT), 300 + 3 * H - 1)
        self.assertEqual(self.sent, [])
        self.run_poll(failing(CRIT), 300 + 3 * H)
        self.assertTrue(all("(reminder)" in t for _, t in self.sent))
        self.assertEqual(self.channels_sent(), ["slack", "whatsapp"])
        self.run_poll(failing(CRIT), 300 + 4 * H)
        self.assertEqual(self.sent, [])
        self.run_poll(failing(CRIT), 300 + 6 * H)
        self.assertEqual(self.channels_sent(), ["slack", "whatsapp"])

    def test_no_reminders_for_warnings(self):
        self.run_poll(failing(WARN), 0)
        self.run_poll(failing(WARN), 300)
        self.channels_sent()
        self.run_poll(failing(WARN), 10 * H)
        self.assertEqual(self.sent, [])

    def test_partial_delivery_is_retried_on_the_failed_channel_only(self):
        self.down = {"whatsapp"}
        self.run_poll(failing(CRIT), 0)
        _, results = self.run_poll(failing(CRIT), 300)
        self.assertEqual(results, {"slack": "sent", "whatsapp": "whatsapp down"})
        self.assertEqual(self.channels_sent(), ["slack"])
        _, results = self.run_poll(failing(CRIT), 600)
        self.assertEqual(results, {"whatsapp": "whatsapp down"})
        self.assertEqual(self.sent, [])  # slack not sent twice
        self.down = set()
        _, results = self.run_poll(failing(CRIT), 900)
        self.assertEqual(results, {"whatsapp": "sent"})
        self.assertIn("*EMERGENCY*", self.sent[0][1])
        self.channels_sent()
        self.run_poll(failing(CRIT), 1200)
        self.assertEqual(self.sent, [])

    def test_messages_use_human_units_and_escape_detail(self):
        conf = {"set": ["fx-rates", "metal-price-coverage", "unreachable"], "since": 0, "checks": {
            "fx-rates": monitor.failing_check("fx-rates", "warning", 36000.0, 28800.0),
            "metal-price-coverage": monitor.failing_check(
                "metal-price-coverage", "warning", None, 1380.0, "2026-11-14: 1200 rows <!channel>"),
            "unreachable": monitor.failing_check("unreachable", detail="no answer (URLError)"),
        }}  # fmt: skip
        text = monitor.compose("change", monitor.empty_told(), conf, 0.0, slack=True)
        self.assertIn("- fx-rates (warning): age 10h00m, max 8h00m", text)
        self.assertIn("- metal-price-coverage (warning): 2026-11-14: 1200 rows &lt;!channel&gt; (min 1380 rows)", text)
        self.assertIn("- unreachable (critical): no answer (URLError)", text)
        self.assertNotIn("<!channel>", text)


class StateCompat(unittest.TestCase):
    V1_FAIL = {
        "announced": "fail", "announced_since": 1000.0, "candidate": "fail", "streak": 8,
        "candidate_since": 1000.0, "checked_at": 2000.0,
        "last": {"ok": False, "detail": "HTTP 503", "failing": [
            {"name": "metal-price-archive", "ageSeconds": None, "threshold": 90000.0},
            {"name": "provider-sync", "ageSeconds": None, "threshold": 93600.0}]},
    }  # fmt: skip

    def test_v1_failing_state_migrates_without_resending_to_slack(self):
        state = monitor.load_state(self.V1_FAIL, 2300.0)
        self.assertEqual(state["channels"]["slack"]["set"], ["metal-price-archive", "provider-sync"])
        fails = [monitor.failing_check("metal-price-archive", "critical", None, 90000.0),
                 monitor.failing_check("provider-sync", "warning", None, 93600.0)]  # fmt: skip
        state, due = monitor.evaluate(state, fails, 2300.0, 2, 3 * H)
        self.assertEqual(due, {"whatsapp": "change"})  # Slack knew; WhatsApp hears the emergency
        state, due = monitor.evaluate(state, fails, 2600.0, 2, 3 * H)
        self.assertEqual(due, {"whatsapp": "change"})

    def test_v1_ok_and_garbage_states_load(self):
        state = monitor.load_state({"announced": "ok", "announced_since": 5.0, "last": {}}, 10.0)
        self.assertEqual(state["confirmed"]["set"], [])
        self.assertEqual(monitor.evaluate(state, [], 10.0)[1], {})
        self.assertEqual(monitor.load_state(None, 1.0), {"version": 2})
        self.assertEqual(monitor.load_state([1, 2], 1.0), {"version": 2})
        self.assertEqual(monitor.load_state({"announced": "fail"}, 1.0)["confirmed"]["set"], ["unreachable"])


# --- audit -----------------------------------------------------------------------------------

PREFIX = "metal-prices"
BUCKET = "fiscalis-price-archive-866827143157"
YESTERDAY = datetime.date(2024, 7, 12)
DAYS = [datetime.date(2024, 7, 9) + datetime.timedelta(days=i) for i in range(4)]


def blob(day):
    return f"gz-{day}".encode()


class FakeS3:
    def __init__(self, days=DAYS, checksums=True):
        self.objects = {monitor.day_key(PREFIX, str(d)): blob(d) for d in days}
        self.checksums = checksums

    def head(self, key):
        if key not in self.objects:
            return 404, {}
        data = self.objects[key]
        headers = {"Content-Length": str(len(data))}
        if self.checksums:
            headers["x-amz-checksum-sha256"] = base64.b64encode(hashlib.sha256(data).digest()).decode()
        return 200, headers

    def list(self, prefix):
        return [(k, len(v)) for k, v in sorted(self.objects.items()) if k.startswith(prefix)]


def ledger(days=DAYS[-2:]):
    return {"archiveEnabled": True, "prefix": PREFIX, "bucket": BUCKET, "days": [
        {"day": str(d), "key": monitor.day_key(PREFIX, str(d)), "rows": 1440,
         "bytes": len(blob(d)), "sha256": hashlib.sha256(blob(d)).hexdigest()}
        for d in sorted(days, reverse=True)]}  # fmt: skip


class Audit(unittest.TestCase):
    def test_pass(self):
        problems, stats = monitor.audit_archive(ledger(), FakeS3(), BUCKET, YESTERDAY)
        self.assertEqual(problems, [])
        self.assertEqual(stats, {"ledger_days": 2, "objects": 4, "expected_days": 4})

    def test_checksum_mismatch(self):
        s3 = FakeS3()
        s3.objects[monitor.day_key(PREFIX, "2024-07-12")] = b"gz-2024-07-1X"  # same length, other bytes
        problems, _ = monitor.audit_archive(ledger(), s3, BUCKET, YESTERDAY)
        self.assertEqual(problems, ["2024-07-12: SHA-256 differs from the ledger"])

    def test_size_mismatch_and_missing_checksum(self):
        problems, _ = monitor.audit_archive(ledger(), FakeS3(checksums=False), BUCKET, YESTERDAY)
        self.assertIn("2024-07-11: S3 object has no SHA-256 checksum", problems)
        s3 = FakeS3()
        s3.objects[monitor.day_key(PREFIX, "2024-07-11")] = b"x"
        problems, _ = monitor.audit_archive(ledger(), s3, BUCKET, YESTERDAY)
        self.assertIn("2024-07-11: size 1 B, ledger 13 B", problems)

    def test_missing_days(self):
        s3 = FakeS3(days=[DAYS[0], DAYS[3]])
        problems, _ = monitor.audit_archive(ledger(days=[DAYS[3]]), s3, BUCKET, YESTERDAY)
        self.assertEqual(problems, ["2 day(s) missing in S3: 2024-07-10..2024-07-11"])
        problems, _ = monitor.audit_archive(ledger(), FakeS3(days=DAYS[:3]), BUCKET, YESTERDAY)
        self.assertIn("2024-07-12: in the ledger but not in S3", problems)
        self.assertIn("1 day(s) missing in S3: 2024-07-12", problems)

    def test_ledger_problems(self):
        self.assertEqual(monitor.audit_archive({"nope": 1}, FakeS3(), BUCKET, YESTERDAY)[0], ["ledger: not a ledger"])
        off = {**ledger(), "archiveEnabled": False}
        self.assertEqual(monitor.audit_archive(off, FakeS3(), BUCKET, YESTERDAY)[0],
                         ["ledger: archive disabled on the deployment"])  # fmt: skip
        other = {**ledger(), "bucket": "someone-else"}
        self.assertTrue(monitor.audit_archive(other, FakeS3(), BUCKET, YESTERDAY)[0][0].startswith("ledger bucket"))

    def test_audit_result_feeds_the_failing_set(self):
        now = 10 * H
        state = monitor.record_audit({"audit_watch_since": 0.0},
                                     {"ok": False, "at": now, "detail": "1 problem(s): x", "problems": ["x"]})  # fmt: skip
        self.assertEqual([c["name"] for c in monitor.audit_checks(state, now)], ["archive-audit"])
        state = monitor.record_audit(state, {"ok": True, "at": now + 1, "detail": "", "problems": []})
        self.assertEqual(monitor.audit_checks(state, now + 2), [])
        self.assertEqual(state["audit"]["last_success"], now + 1)

    def test_stale_audit(self):
        state = {"audit_watch_since": 0.0}
        self.assertEqual(monitor.audit_checks(state, 50 * H), [])
        stale = monitor.audit_checks(state, 50 * H + 1)
        self.assertEqual([(c["name"], c["severity"]) for c in stale], [("archive-audit-stale", "critical")])
        state = monitor.record_audit(state, {"ok": True, "at": 49 * H, "detail": "", "problems": []})
        self.assertEqual(monitor.audit_checks(state, 60 * H), [])
        state = monitor.record_audit(state, {"ok": False, "at": 60 * H, "detail": "d", "problems": ["d"]})
        self.assertEqual([c["name"] for c in monitor.audit_checks(state, 100 * H)],
                         ["archive-audit", "archive-audit-stale"])  # fmt: skip

    def test_missing_credentials_fail_the_audit(self):
        result = monitor.run_audit({}, None, 0.0)
        self.assertFalse(result["ok"])
        self.assertIn("credentials", result["problems"][0])


class SigV4(unittest.TestCase):
    """The examples of the AWS docs, "Signature Calculations for the Authorization Header:
    Transferring Payload in a Single Chunk (AWS Signature Version 4)" (Amazon S3)."""

    KEY, SECRET = "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    DATE = "20130524T000000Z"
    HEADERS = {"host": "examplebucket.s3.amazonaws.com", "x-amz-content-sha256": monitor.EMPTY_SHA256,
               "x-amz-date": DATE}  # fmt: skip

    def sign(self, uri, query, headers, secret=SECRET):
        return monitor.sigv4_authorization("GET", uri, query, headers, monitor.EMPTY_SHA256,
                                           self.KEY, secret, "us-east-1", "s3", self.DATE)  # fmt: skip

    def test_get_object(self):
        auth = self.sign("/test.txt", "", {**self.HEADERS, "range": "bytes=0-9"})
        self.assertEqual(auth, (
            "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, "
            "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, "
            "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"))

    def test_list_objects(self):
        query = monitor.canonical_query({"prefix": "J", "max-keys": "2"})
        self.assertEqual(query, "max-keys=2&prefix=J")
        auth = self.sign("/", query, self.HEADERS)
        self.assertTrue(auth.endswith(
            "Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7"))

    def test_a_wrong_key_does_not_match(self):
        auth = self.sign("/test.txt", "", {**self.HEADERS, "range": "bytes=0-9"}, secret="wrong")
        self.assertNotIn("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41", auth)

    def test_query_values_are_encoded(self):
        self.assertEqual(monitor.canonical_query({"prefix": "metal-prices/minute/", "list-type": "2"}),
                         "list-type=2&prefix=metal-prices%2Fminute%2F")  # fmt: skip


# --- main end to end -------------------------------------------------------------------------


class FakeResponse:
    def __init__(self, status, body, headers=None):
        self.status, self._body, self.headers = status, body, headers or {}

    def read(self, *_):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


PING = "https://hc-ping.com/1234abcd-0000-4000-8000-000000000000"


class MainHarness(unittest.TestCase):
    """main() against fake Convex, Slack, healthchecks.io and WhatsApp (no tests of its own)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self.tmp.name)
        (self.dir / "monitor.env").write_text(
            f"SLACK_BOT_TOKEN=xoxb-test\nSLACK_HOME_CHANNEL=C123\nWHATSAPP_ALLOWED_USERS=+441234567890\n"
            f"FISCALIS_HC_PING_URL={PING}\n"
        )
        self.env = {"FISCALIS_HEALTH_STATE_DIR": str(self.dir / "state"),
                    "FISCALIS_HEALTH_ENV": str(self.dir / "monitor.env")}  # fmt: skip
        self.requests, self.whatsapp = [], []
        self.health = (503, report(False, [check("metal-price-ticks", severity="critical", age=900)]))
        self.slack_ok, self.whatsapp_ok, self.now = True, True, 1_000_000.0

    def tearDown(self):
        self.tmp.cleanup()

    def opener(self, request, timeout):
        url = request.full_url
        self.requests.append(url)
        if url.startswith("https://slack.com/"):
            return FakeResponse(200, json.dumps({"ok": self.slack_ok}).encode())
        if url.startswith("https://hc-ping.com/"):
            return FakeResponse(200, b"OK")
        status, body = self.health
        if status != 200:
            raise urllib.error.HTTPError(url, status, "x", {}, io.BytesIO(body))
        return FakeResponse(status, body)

    def runner(self, command, input, **_):
        self.whatsapp.append(json.loads(input))
        answer = {"success": self.whatsapp_ok}
        return subprocess.CompletedProcess(command, 0, stdout=json.dumps(answer), stderr="")

    def main(self, *argv):
        self.now += 300
        with unittest.mock.patch("sys.stdout", io.StringIO()), unittest.mock.patch("sys.stderr", io.StringIO()):
            return monitor.main(list(argv), environ=self.env, opener=self.opener, runner=self.runner,
                                clock=lambda: self.now, docker="/usr/bin/docker", sleep=lambda s: None)  # fmt: skip

    def pings(self):
        out = [u[len(PING):] or "ok" for u in self.requests if u.startswith(PING)]
        self.requests.clear()
        return out


class Main(MainHarness):
    def test_emergency_flow_pings_and_retries(self):
        self.assertEqual(self.main(), 0)
        self.assertEqual(self.pings(), ["ok"])
        self.whatsapp_ok = False
        self.assertEqual(self.main(), 1)  # confirmed; WhatsApp failed
        self.assertEqual(self.pings(), ["/fail"])
        self.assertEqual(self.whatsapp[0]["chatId"], "441234567890@s.whatsapp.net")
        self.assertIn("*EMERGENCY*", self.whatsapp[0]["message"])
        self.whatsapp_ok = True
        self.assertEqual(self.main(), 0)
        self.assertEqual(len(self.whatsapp), 2)
        slack_posts = [u for u in self.requests if u.startswith("https://slack.com/")]
        self.assertEqual(slack_posts, [])  # Slack already had it
        self.assertEqual(self.pings(), ["ok"])

    def test_run_error_pings_fail(self):
        (self.dir / "state").mkdir()
        (self.dir / "state" / "state.json").mkdir()  # unreadable as a file, unwritable as one
        self.assertEqual(self.main(), 1)
        self.assertEqual(self.pings(), ["/fail"])

    def test_missing_or_bad_ping_url_is_skipped(self):
        self.health = (200, report(True, []))
        for line in ("", "FISCALIS_HC_PING_URL=https://evil.example/ping\n"):
            (self.dir / "monitor.env").write_text("SLACK_BOT_TOKEN=x\nSLACK_HOME_CHANNEL=C\n" + line)
            self.assertEqual(self.main(), 0)
            self.assertFalse([u for u in self.requests if "ping" in u])

    def test_ping_failure_does_not_crash(self):
        def opener(request, timeout):
            if request.full_url.startswith("https://hc-ping.com/"):
                raise urllib.error.URLError("hc down")
            return self.opener(request, timeout)

        self.health = (200, report(True, []))
        with unittest.mock.patch("sys.stdout", io.StringIO()), unittest.mock.patch("sys.stderr", io.StringIO()):
            self.assertEqual(monitor.main([], environ=self.env, opener=opener, runner=self.runner,
                                          clock=lambda: self.now, docker="/usr/bin/docker"), 0)  # fmt: skip

    def test_v1_state_file_loads(self):
        (self.dir / "state").mkdir()
        (self.dir / "state" / "state.json").write_text(json.dumps(StateCompat.V1_FAIL))
        self.assertEqual(self.main(), 0)
        state = json.loads((self.dir / "state" / "state.json").read_text())
        self.assertEqual(state["version"], 2)

    def test_dry_run_needs_no_credentials_and_writes_nothing(self):
        env = {"FISCALIS_HEALTH_STATE_DIR": str(self.dir / "state")}
        out = io.StringIO()
        with unittest.mock.patch("sys.stdout", out):
            code = monitor.main(["--dry-run"], environ=env, opener=self.opener, runner=self.runner,
                                clock=lambda: self.now, docker=None)  # fmt: skip
        self.assertEqual(code, 0)
        self.assertFalse((self.dir / "state").exists())
        self.assertEqual(self.whatsapp, [])
        self.assertFalse([u for u in self.requests if "slack" in u or "hc-ping" in u])
        self.assertEqual(json.loads(out.getvalue())["failing"], ["metal-price-ticks"])

    def test_test_alert_sends_to_both(self):
        self.assertEqual(self.main("--test-alert"), 0)
        self.assertIn("[TEST]", self.whatsapp[0]["message"])
        self.assertEqual(len([u for u in self.requests if u.startswith("https://slack.com/")]), 1)
        self.whatsapp_ok = False
        self.assertEqual(self.main("--test-alert"), 1)

    def test_test_alert_says_where_its_credentials_came_from(self):
        out = io.StringIO()
        creds = self.dir / "creds"
        creds.mkdir()
        (creds / "monitor-env").write_text((self.dir / "monitor.env").read_text())
        for env, via in ((self.env, "env file"), ({"CREDENTIALS_DIRECTORY": str(creds)}, "systemd credential")):
            out.seek(0), out.truncate()
            with unittest.mock.patch("sys.stdout", out), unittest.mock.patch("sys.stderr", io.StringIO()):
                code = monitor.main(["--test-alert"], environ=env, opener=self.opener, runner=self.runner,
                                    clock=lambda: self.now, docker="/usr/bin/docker")  # fmt: skip
            self.assertEqual((code, json.loads(out.getvalue())["credentials"]), (0, via))

    def test_whatsapp_unconfigured_is_a_delivery_failure(self):
        (self.dir / "monitor.env").write_text("SLACK_BOT_TOKEN=x\nSLACK_HOME_CHANNEL=C\n" f"FISCALIS_HC_PING_URL={PING}\n")
        self.main()
        self.assertEqual(self.main(), 1)
        self.assertEqual(self.pings(), ["ok", "/fail"])

    def test_audit_mode_records_a_failed_audit(self):
        self.health = (200, report(True, []))
        self.assertEqual(self.main("--audit"), 0)  # no audit-env: a failed audit, not yet confirmed
        state = json.loads((self.dir / "state" / "state.json").read_text())
        self.assertFalse(state["audit"]["ok"])
        self.assertEqual(state["counts"], {"archive-audit": {"fails": 1, "oks": 0}})
        self.main()
        self.assertEqual(len(self.whatsapp), 1)
        self.assertIn("archive-audit (critical)", self.whatsapp[0]["message"])


# --- daily sync digest -----------------------------------------------------------------------


DIGEST = {
    "windowStart": 0, "windowEnd": 86_400_000, "runs": 7, "problems": 3, "truncated": False,
    "providers": [
        {"provider": "plaid", "runs": 5, "succeeded": 2, "partial": 1, "failed": 2, "stuck": 0,
         "usersAffected": 2, "scheduledFailed": 1, "lastSuccessAt": 1,
         "topErrorCodes": [{"code": "ITEM_LOGIN_REQUIRED", "count": 2}, {"code": "<!channel>", "count": 1}]},
        {"provider": "bitpanda", "runs": 2, "succeeded": 2, "partial": 0, "failed": 0, "stuck": 0,
         "usersAffected": 0, "scheduledFailed": 0, "lastSuccessAt": 1, "topErrorCodes": []},
        {"provider": "<script>", "runs": 1},
    ],
    "health": {"ok": False, "critical": False, "checks": [
        check("fx-rates", severity="warning", age=9 * 3600, threshold=8 * 3600),
        check("metal-price-ticks", ok=True),
    ]},
}  # fmt: skip


class Digest(unittest.TestCase):
    def test_compose_lists_problems_codes_and_stale_feeds(self):
        text = monitor.compose_digest(DIGEST, 1_000_000.0)
        self.assertIn(":warning: Fiscalis daily sync digest", text)
        self.assertIn("Sync runs: 7, with problems: 3", text)
        self.assertIn("- plaid: 5 runs, 2 ok, 1 partial, 2 failed (1 scheduled); 2 user(s) affected", text)
        self.assertIn("ITEM_LOGIN_REQUIRED x2", text)
        self.assertNotIn("<!channel>", text)  # escaped
        self.assertIn("- bitpanda: 2 runs, all ok", text)
        self.assertNotIn("script", text)  # malformed provider dropped
        self.assertIn("- fx-rates (warning): age 9h00m, max 8h00m", text)

    def test_compose_quiet_day(self):
        quiet = {"runs": 0, "problems": 0, "providers": [], "health": {"ok": True, "checks": []}}
        text = monitor.compose_digest(quiet, 1_000_000.0)
        self.assertTrue(text.startswith(":white_check_mark:"))
        self.assertIn("no provider syncs ran", text)
        self.assertIn("Feeds: all fresh", text)
        self.assertIn("not readable", monitor.compose_digest([], 1_000_000.0))


class DigestMain(MainHarness):
    def setUp(self):
        super().setUp()
        with open(self.dir / "monitor.env", "a") as handle:
            handle.write("FISCALIS_MONITOR_SECRET=" + "s" * 48 + "\n")
        self.digest_status, self.digest_headers, self.slack_texts = 200, [], []

    def opener(self, request, timeout):
        if request.full_url.endswith("/health/sync-digest"):
            self.requests.append(request.full_url)
            self.digest_headers.append(request.get_header("X-fiscalis-monitor-secret"))
            if self.digest_status != 200:
                raise urllib.error.HTTPError(request.full_url, self.digest_status, "x", {}, io.BytesIO(b"{}"))
            return FakeResponse(200, json.dumps(DIGEST).encode())
        if request.full_url.startswith("https://slack.com/"):
            self.slack_texts.append(json.loads(request.data)["text"])
        return super().opener(request, timeout)

    def test_posts_once_per_day_with_the_secret_and_no_ping(self):
        self.assertEqual(self.main("--digest"), 0)
        self.assertEqual(self.digest_headers, ["s" * 48])
        self.assertEqual(len(self.slack_texts), 1)
        self.assertIn("plaid", self.slack_texts[0])
        self.assertNotIn("s" * 48, self.slack_texts[0])
        self.assertEqual(self.main("--digest"), 0)  # same UTC day: skipped
        self.assertEqual(len(self.slack_texts), 1)
        self.assertEqual(self.pings(), [])
        self.assertEqual(self.whatsapp, [])

    def test_unauthorized_digest_is_reported_not_silent(self):
        self.digest_status = 401
        self.assertEqual(self.main("--digest"), 0)
        self.assertIn("unavailable: digest HTTP 401", self.slack_texts[0])

    def test_redirect_is_not_followed_with_the_secret(self):
        handler = monitor._NoRedirect()
        request = urllib.request.Request("https://example.convex.site/health/sync-digest",
                                         headers={"X-Fiscalis-Monitor-Secret": "s" * 48})
        self.assertIsNone(handler.redirect_request(request, None, 302, "Found", {}, "http://evil.example/"))

    def test_failed_slack_post_is_retried_next_run(self):
        self.slack_ok = False
        self.assertEqual(self.main("--digest"), 1)
        self.slack_ok = True
        self.assertEqual(self.main("--digest"), 0)
        self.assertEqual(len(self.slack_texts), 2)

    def test_dry_run_sends_nothing(self):
        self.assertEqual(self.main("--digest", "--dry-run"), 0)
        self.assertEqual(self.slack_texts, [])
        self.assertFalse((self.dir / "state").exists())

    def test_missing_secret(self):
        (self.dir / "monitor.env").write_text("SLACK_BOT_TOKEN=x\nSLACK_HOME_CHANNEL=C\n")
        self.main("--digest")
        self.assertEqual(self.digest_headers, [])
        self.assertIn("no FISCALIS_MONITOR_SECRET", self.slack_texts[0])


class TestUnit(unittest.TestCase):
    """install.sh's fiscalis-health-test.service must run in the monitor unit's sandbox."""

    def test_generated_test_unit_matches_the_monitor_unit(self):
        here = pathlib.Path(__file__).parent
        done = subprocess.run(["bash", str(here / "install.sh"), "--print-test-unit"],
                              capture_output=True, text=True, check=True)  # fmt: skip
        generated = [ln for ln in done.stdout.splitlines() if ln and not ln.startswith("#")]
        source = [ln for ln in (here / "fiscalis-health-monitor.service").read_text().splitlines()
                  if ln and not ln.startswith("#")]  # fmt: skip
        changed = {"Description", "ExecStart", "RuntimeDirectory", "Environment"}
        key = lambda ln: ln.split("=", 1)[0]  # noqa: E731
        self.assertEqual([ln for ln in generated if key(ln) not in changed],
                         [ln for ln in source if key(ln) not in changed])  # fmt: skip
        self.assertIn("ExecStart=/usr/bin/python3 -I /usr/local/lib/fiscalis-health-monitor/"
                      "fiscalis-health-monitor.py --test-alert", generated)  # fmt: skip
        self.assertIn("RuntimeDirectory=fiscalis-health-test", generated)
        self.assertIn("LoadCredential=monitor-env:/etc/fiscalis-health-monitor/monitor.env", generated)
        self.assertNotIn("[Install]", generated)  # started by hand only, never by a timer
        self.assertFalse([ln for ln in generated if "/run/fiscalis-health-monitor" in ln])


if __name__ == "__main__":
    unittest.main()
