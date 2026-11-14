#!/bin/sh
# Vercel production build: deploy Convex, then build the app.
#
# Two merges landing close together can make the second `convex deploy` fail
# with "RaceDetected: ... was created by a concurrent push" (HTTP 409). That
# failure is transient, so retry up to MAX_RETRIES more times with a backoff,
# but only when the output contains RaceDetected. Any other failure exits
# immediately with the deploy's own exit code. Output is streamed as it comes.
#
# Never add `set -x` here: the environment holds CONVEX_DEPLOY_KEY.
set -u

MAX_RETRIES=2
# Seconds to wait before retry n is BACKOFF_BASE * n (30s, then 60s).
BACKOFF_BASE="${VERCEL_BUILD_BACKOFF_BASE:-30}"

tmp_dir="$(mktemp -d)" || exit 1
trap 'rm -rf "$tmp_dir"' EXIT
log="$tmp_dir/deploy.log"
rc_file="$tmp_dir/rc"

attempt=0
while :; do
  # POSIX sh has no pipefail: capture the deploy's exit code via a file while
  # tee streams its output to the build log and to $log for inspection.
  { bunx convex deploy --cmd 'bun run build' 2>&1; echo "$?" >"$rc_file"; } | tee "$log"
  rc="$(cat "$rc_file")"

  [ "$rc" -eq 0 ] && exit 0

  if [ "$attempt" -ge "$MAX_RETRIES" ] || ! grep -q 'RaceDetected' "$log"; then
    exit "$rc"
  fi

  attempt=$((attempt + 1))
  delay=$((BACKOFF_BASE * attempt))
  echo "vercel-build: concurrent Convex push detected (exit $rc); retry $attempt/$MAX_RETRIES in ${delay}s" >&2
  sleep "$delay"
done
