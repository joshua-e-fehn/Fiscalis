#!/usr/bin/env bash
# Install or update the Fiscalis /health/deep monitor on the Mya VPS (ENG-223).
#
#   sudo bash ops/health-monitor/install.sh            # install / update, start the timer
#   sudo bash ops/health-monitor/install.sh --dry-run  # say what would change, change nothing
#
# Idempotent. Copies the script to /usr/local/lib/fiscalis-health-monitor/,
# the units to /etc/systemd/system/, and writes
# /etc/fiscalis-health-monitor/slack.env (0600 root) with SLACK_BOT_TOKEN and
# SLACK_HOME_CHANNEL from Mya's env file and nothing else: the existing Mya
# bot, no new Slack app or token. Re-run after Mya's token changes.
set -euo pipefail

MYA_ENV="${MYA_ENV:-/docker/hermes-agent-vspa/data/.env}"
LIB_DIR=/usr/local/lib/fiscalis-health-monitor
ETC_DIR=/etc/fiscalis-health-monitor
UNIT_DIR=/etc/systemd/system
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

say() { printf '[fiscalis-health-monitor] %s\n' "$*"; }
run() { if (( DRY_RUN )); then say "would run: $*"; else "$@"; fi; }

[[ $EUID -eq 0 ]] || { say "run as root"; exit 1; }
[[ -r "$MYA_ENV" ]] || { say "$MYA_ENV is not readable: no Slack credentials"; exit 1; }

keys="$(grep -cE '^[[:space:]]*(export[[:space:]]+)?(SLACK_BOT_TOKEN|SLACK_HOME_CHANNEL)[[:space:]]*=' "$MYA_ENV" || true)"
if [[ "$keys" -lt 2 ]]; then
  say "$MYA_ENV lacks SLACK_BOT_TOKEN or SLACK_HOME_CHANNEL; not installing"
  exit 1
fi

run install -d -m 0755 -o root -g root "$LIB_DIR"
run install -m 0755 -o root -g root "$SRC/fiscalis-health-monitor.py" "$LIB_DIR/"
run install -m 0644 -o root -g root "$SRC/fiscalis-health-monitor.service" "$UNIT_DIR/"
run install -m 0644 -o root -g root "$SRC/fiscalis-health-monitor.timer" "$UNIT_DIR/"
run install -d -m 0750 -o root -g root "$ETC_DIR"
if (( DRY_RUN )); then
  say "would write $ETC_DIR/slack.env (0600 root) from $MYA_ENV"
else
  tmp="$(mktemp "$ETC_DIR/.slack.env.XXXXXX")"
  grep -E '^[[:space:]]*(export[[:space:]]+)?(SLACK_BOT_TOKEN|SLACK_HOME_CHANNEL)[[:space:]]*=' "$MYA_ENV" >"$tmp"
  chmod 0600 "$tmp"
  mv -f "$tmp" "$ETC_DIR/slack.env"
  say "wrote $ETC_DIR/slack.env (the Slack token and home channel only)"
fi

run systemctl daemon-reload
run systemctl enable --now fiscalis-health-monitor.timer
say "poll now (prints the decision, posts nothing):"
run /usr/bin/python3 -I "$LIB_DIR/fiscalis-health-monitor.py" --dry-run
