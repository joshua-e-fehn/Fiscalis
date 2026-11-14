"""python3 -m unittest discover -s ops/health-monitor (no dependencies)."""

import importlib.util
import json
import pathlib
import unittest

_spec = importlib.util.spec_from_file_location(
    "monitor", pathlib.Path(__file__).with_name("fiscalis-health-monitor.py")
)
monitor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(monitor)


def report(ok, checks):
    return json.dumps({"ok": ok, "checks": checks}).encode()


class ParseReport(unittest.TestCase):
    def test_healthy(self):
        poll = monitor.parse_report(200, report(True, [{"name": "fx-rates", "ok": True}]))
        self.assertEqual(poll, {"ok": True, "failing": [], "detail": "healthy"})

    def test_failing_checks_are_listed_and_shape_checked(self):
        poll = monitor.parse_report(
            503,
            report(
                False,
                [
                    {"name": "metal-price-ticks", "ok": False, "ageSeconds": 900, "threshold": 600},
                    {"name": "<!channel>", "ok": False, "ageSeconds": None, "threshold": 60},
                    {"name": "provider-sync", "ok": True, "skipped": True},
                ],
            ),
        )
        self.assertFalse(poll["ok"])
        self.assertEqual([c["name"] for c in poll["failing"]], ["metal-price-ticks", "unknown"])
        self.assertIsNone(poll["failing"][1]["ageSeconds"])

    def test_garbage_or_wrong_status_is_failing(self):
        self.assertFalse(monitor.parse_report(502, b"<html>bad gateway</html>")["ok"])
        self.assertFalse(monitor.parse_report(500, report(True, []))["ok"])


class Step(unittest.TestCase):
    def run_polls(self, polls, confirm=2):
        state, kinds = {}, []
        for i, ok in enumerate(polls):
            state, kind = monitor.step(state, ok, float(i), confirm)
            if kind:  # as main() does after a successful post
                state["announced"] = state["candidate"]
                state["announced_since"] = state["candidate_since"]
            kinds.append(kind)
        return kinds

    def test_quiet_while_healthy(self):
        self.assertEqual(self.run_polls([True] * 5), [None] * 5)

    def test_one_blip_is_not_announced(self):
        self.assertEqual(self.run_polls([True, False, True, True]), [None] * 4)

    def test_announces_each_change_once(self):
        kinds = self.run_polls([True, False, False, False, True, True, True])
        self.assertEqual(kinds, [None, None, "fail", None, None, "recovered", None])

    def test_failed_post_is_retried(self):
        state, kind = monitor.step({}, False, 0.0)
        state, kind = monitor.step(state, False, 1.0)
        self.assertEqual(kind, "fail")
        # post failed: announced unchanged, so the next run announces again
        state, kind = monitor.step(state, False, 2.0)
        self.assertEqual(kind, "fail")


class Message(unittest.TestCase):
    def test_fail_message_lists_checks(self):
        poll = {"ok": False, "detail": "HTTP 503", "failing": [
            {"name": "fx-rates", "ageSeconds": 36000.0, "threshold": 28800.0}]}
        text = monitor.message("fail", poll, {}, 0.0)
        self.assertIn("fx-rates: age 10h00m, max 8h00m", text)

    def test_recovered_message_has_downtime(self):
        text = monitor.message("recovered", {}, {"announced_since": 0.0}, 1800.0)
        self.assertIn("after 30m", text)


if __name__ == "__main__":
    unittest.main()
