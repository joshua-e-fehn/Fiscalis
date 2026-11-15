#!/usr/bin/env bash
# Install or update the Fiscalis weekly Convex prod backup on the Mya VPS (ENG-220).
#
#   bash install.sh --convex-env /root/fiscalis-setup/convex.env --writer-env /root/fiscalis-setup/writer.env
#   bash install.sh --dry-run        # say what would change, change nothing
#   bash install.sh --test-alert     # also post a [TEST] Slack message through the real unit
#   bash install.sh                  # update script/toolchain/units, keep the installed keys
#
# Idempotent; run as root. Needs the health monitor installed first
# (ops/health-monitor): the backup imports its signing and Slack code and
# reads its /etc/fiscalis-health-monitor/monitor.env for Slack.
#
# Installs, all root-owned:
#   /usr/local/lib/fiscalis-convex-backup/   the script, node (official tarball,
#       SHA-256 pinned below) and the Convex CLI (`npm ci --ignore-scripts`
#       from package-lock.json, the version frontend/ resolves)
#   /etc/fiscalis-convex-backup/convex.env   CONVEX_DEPLOY_KEY=prod:handsome-gecko-941|…
#   /etc/fiscalis-convex-backup/writer.env   FISCALIS_CONVEX_BACKUP_ACCESS_KEY_ID,
#       FISCALIS_CONVEX_BACKUP_SECRET_ACCESS_KEY, FISCALIS_CONVEX_BACKUP_BUCKET
#   /etc/systemd/system/fiscalis-convex-backup.{service,timer}
# The key files are copied from 0600 root files given with --convex-env and
# --writer-env (only the named keys), else kept. No value is ever printed.
set -euo pipefail

NODE_VERSION=v22.23.5
NODE_SHA256=cdeb8670a0c81f51b4dc4ac61919f9b1ad917b304bf8221eb939570663d240f8 # node-v22.23.5-linux-x64.tar.xz
LIB_DIR=/usr/local/lib/fiscalis-convex-backup
ETC_DIR=/etc/fiscalis-convex-backup
UNIT_DIR=/etc/systemd/system
MONITOR_LIB=/usr/local/lib/fiscalis-health-monitor/fiscalis-health-monitor.py
MONITOR_ENV=/etc/fiscalis-health-monitor/monitor.env
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=0
TEST_ALERT=0
CONVEX_SRC=""
WRITER_SRC=""
while (($#)); do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --test-alert) TEST_ALERT=1 ;;
    --convex-env) CONVEX_SRC="${2:?--convex-env needs a file}"; shift ;;
    --writer-env) WRITER_SRC="${2:?--writer-env needs a file}"; shift ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '[fiscalis-convex-backup] %s\n' "$*"; }
run() { if ((DRY_RUN)); then say "would run: $*"; else "$@"; fi; }
lines() { grep -E "^[[:space:]]*(export[[:space:]]+)?($1)[[:space:]]*=" "$2" || true; }
has() { grep -Eq "^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*=[[:space:]]*[^[:space:]]" "$2"; }
root_only() { # root_only <file>: a regular 0600 root file
  [[ -f "$1" && ! -L "$1" ]] || { say "$1 is not a regular file"; exit 1; }
  [[ "$(stat -c %a "$1")" == 600 && "$(stat -c %u "$1")" == 0 ]] || { say "$1 must be mode 0600 and owned by root"; exit 1; }
}
write_secret() { # write_secret <target> <description>; content on stdin
  if ((DRY_RUN)); then cat >/dev/null; say "would write $1 (0600 root: $2)"; return; fi
  local tmp
  tmp="$(mktemp "$ETC_DIR/.env.XXXXXX")"
  chmod 0600 "$tmp"
  cat >"$tmp"
  mv -f "$tmp" "$1"
  say "wrote $1 (0600 root: $2)"
}

[[ $EUID -eq 0 ]] || { say "run as root"; exit 1; }
[[ "$(uname -m)" == x86_64 ]] || { say "only linux-x64 is pinned (NODE_SHA256); not installing"; exit 1; }
[[ -r "$MONITOR_LIB" && -r "$MONITOR_ENV" ]] ||
  { say "the health monitor is not installed ($MONITOR_LIB, $MONITOR_ENV): install ops/health-monitor first"; exit 1; }

# --- keys ------------------------------------------------------------------------
WRITER_KEYS="FISCALIS_CONVEX_BACKUP_ACCESS_KEY_ID|FISCALIS_CONVEX_BACKUP_SECRET_ACCESS_KEY|FISCALIS_CONVEX_BACKUP_BUCKET"
if [[ -n "$CONVEX_SRC" ]]; then
  root_only "$CONVEX_SRC"
  grep -Eq '^[[:space:]]*CONVEX_DEPLOY_KEY[[:space:]]*=[[:space:]]*"?prod:handsome-gecko-941\|' "$CONVEX_SRC" ||
    { say "$CONVEX_SRC holds no CONVEX_DEPLOY_KEY=prod:handsome-gecko-941|… line; not installing"; exit 1; }
elif [[ ! -r "$ETC_DIR/convex.env" ]]; then
  say "no Convex key: pass --convex-env FILE (README, 'Install'); not installing"; exit 1
fi
if [[ -n "$WRITER_SRC" ]]; then
  root_only "$WRITER_SRC"
  for key in ${WRITER_KEYS//|/ }; do
    has "$key" "$WRITER_SRC" || { say "$WRITER_SRC lacks $key; not installing"; exit 1; }
  done
elif [[ ! -r "$ETC_DIR/writer.env" ]]; then
  say "no S3 writer key: pass --writer-env FILE (README, 'Install'); not installing"; exit 1
fi

# --- toolchain -------------------------------------------------------------------
run install -d -m 0755 -o root -g root "$LIB_DIR"
if [[ "$("$LIB_DIR/node/bin/node" --version 2>/dev/null || true)" != "$NODE_VERSION" ]]; then
  if ((DRY_RUN)); then
    say "would download node $NODE_VERSION (sha256 $NODE_SHA256) into $LIB_DIR/node"
  else
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    tarball="node-$NODE_VERSION-linux-x64.tar.xz"
    curl -fsSL --proto '=https' -o "$tmp/$tarball" "https://nodejs.org/dist/$NODE_VERSION/$tarball"
    printf '%s  %s\n' "$NODE_SHA256" "$tmp/$tarball" | sha256sum -c --quiet - ||
      { say "node tarball checksum mismatch; not installing"; exit 1; }
    mkdir "$tmp/node"
    tar -xJf "$tmp/$tarball" -C "$tmp/node" --strip-components=1 --no-same-owner
    rm -rf "$LIB_DIR/node.new" && mv "$tmp/node" "$LIB_DIR/node.new"
    rm -rf "$LIB_DIR/node" && mv "$LIB_DIR/node.new" "$LIB_DIR/node"
    chown -R root:root "$LIB_DIR/node"
    say "installed node $NODE_VERSION"
  fi
fi
if ! cmp -s "$SRC/package-lock.json" "$LIB_DIR/package-lock.json" || [[ ! -f "$LIB_DIR/node_modules/convex/bin/main.js" ]]; then
  run install -m 0644 -o root -g root "$SRC/package.json" "$SRC/package-lock.json" "$LIB_DIR/"
  if ((DRY_RUN)); then
    say "would run npm ci --ignore-scripts --omit=dev in $LIB_DIR"
  else
    (cd "$LIB_DIR" && PATH="$LIB_DIR/node/bin:$PATH" HOME="$(mktemp -d)" npm ci --ignore-scripts --omit=dev --no-audit --no-fund --no-update-notifier --loglevel=error)
    chown -R root:root "$LIB_DIR/node_modules"
    say "installed the Convex CLI $(PATH="$LIB_DIR/node/bin:$PATH" node "$LIB_DIR/node_modules/convex/bin/main.js" --version)"
  fi
fi
run install -m 0644 -o root -g root "$SRC/fiscalis-convex-backup.py" "$LIB_DIR/"
for unit in fiscalis-convex-backup.service fiscalis-convex-backup.timer; do
  run install -m 0644 -o root -g root "$SRC/$unit" "$UNIT_DIR/"
done

# --- key files -------------------------------------------------------------------
run install -d -m 0750 -o root -g root "$ETC_DIR"
if [[ -n "$CONVEX_SRC" ]]; then
  lines CONVEX_DEPLOY_KEY "$CONVEX_SRC" | tail -n 1 | write_secret "$ETC_DIR/convex.env" "the prod Convex deploy key"
fi
if [[ -n "$WRITER_SRC" ]]; then
  lines "$WRITER_KEYS" "$WRITER_SRC" | write_secret "$ETC_DIR/writer.env" "the write-only S3 backup key"
fi

run systemctl daemon-reload
run systemctl enable --now fiscalis-convex-backup.timer
say "check (exports and sends nothing):"
if ((DRY_RUN)); then
  say "would run the backup script with --dry-run under systemd-run"
else
  systemd-run --quiet --wait --pipe --collect -p DynamicUser=yes -p UMask=0077 \
    -p LoadCredential=convex-env:"$ETC_DIR/convex.env" -p LoadCredential=writer-env:"$ETC_DIR/writer.env" \
    -p LoadCredential=monitor-env:"$MONITOR_ENV" \
    /usr/bin/python3 -I "$LIB_DIR/fiscalis-convex-backup.py" --dry-run
fi
if ((TEST_ALERT)) && ! ((DRY_RUN)); then
  systemd-run --quiet --wait --pipe --collect -p DynamicUser=yes -p LoadCredential=monitor-env:"$MONITOR_ENV" \
    /usr/bin/python3 -I "$LIB_DIR/fiscalis-convex-backup.py" --test-alert ||
    { say "TEST ALERT FAILED: a failed backup would go unnoticed"; exit 1; }
  say "test alert posted: check Slack"
fi
say "next: systemctl start fiscalis-convex-backup.service (the first real backup; README 'Operate')"
