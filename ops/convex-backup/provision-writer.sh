#!/usr/bin/env bash
# Create the backup's write-only IAM user and its access key (ENG-220), on the MacBook.
#
#   bash ops/convex-backup/provision-writer.sh            # create user, policy, key; store the key
#   bash ops/convex-backup/provision-writer.sh --dry-run  # print what it would do
#
# Uses the SSO admin profile `fiscalis` (account 866827143157). The user
# `fiscalis-convex-backup-writer` gets one inline policy: s3:PutObject on
# backups/* of the backup bucket and s3:ListBucket on it. No Get, no Delete,
# no retention or version calls, so a stolen key can add backups but not read,
# shorten or remove one.
#
# The new key goes to the Mya vault as its own item "Fiscalis Convex backup
# writer - AWS" (mya-op, from a 0600 JSON template that is shredded) and to
# ~/.config/fiscalis/convex-backup-writer.env (0600) for the VPS install. The
# secret is never printed or passed on a command line. Refuses to run if the
# user already has a key: rotate by deleting the old key first (README).
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-fiscalis}" AWS_REGION=eu-central-1
ACCOUNT=866827143157
BUCKET="fiscalis-convex-backups-$ACCOUNT"
USER_NAME=fiscalis-convex-backup-writer
ITEM_TITLE="Fiscalis Convex backup writer - AWS"
OUT="$HOME/.config/fiscalis/convex-backup-writer.env"
MYA_OP="${MYA_OP:-$HOME/.local/bin/mya-op}"
DRY_RUN=0
[[ "${1:-}" == --dry-run ]] && DRY_RUN=1

say() { printf '[provision-writer] %s\n' "$*"; }
POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {"Sid": "PutBackups", "Effect": "Allow", "Action": "s3:PutObject",
     "Resource": "arn:aws:s3:::$BUCKET/backups/*"},
    {"Sid": "ListBucket", "Effect": "Allow", "Action": "s3:ListBucket",
     "Resource": "arn:aws:s3:::$BUCKET"}
  ]
}
JSON
)
if ((DRY_RUN)); then
  say "would create IAM user $USER_NAME in $ACCOUNT with inline policy convex-backup-put:"
  printf '%s\n' "$POLICY"
  say "would create one access key, store it in the Mya vault as '$ITEM_TITLE' and in $OUT (0600)"
  exit 0
fi

[[ "$(aws sts get-caller-identity --query Account --output text)" == "$ACCOUNT" ]] ||
  { say "profile $AWS_PROFILE is not account $ACCOUNT"; exit 1; }
aws s3api head-bucket --bucket "$BUCKET" || { say "bucket $BUCKET is missing (README, 'AWS')"; exit 1; }
"$MYA_OP" vault get Mya >/dev/null || { say "mya-op cannot reach the Mya vault"; exit 1; }
if "$MYA_OP" item get "$ITEM_TITLE" --vault Mya >/dev/null 2>&1; then
  say "the vault already has '$ITEM_TITLE': not creating a second key"; exit 1
fi

aws iam get-user --user-name "$USER_NAME" >/dev/null 2>&1 ||
  aws iam create-user --user-name "$USER_NAME" --tags Key=purpose,Value=fiscalis-convex-backup Key=ticket,Value=ENG-220 >/dev/null
aws iam put-user-policy --user-name "$USER_NAME" --policy-name convex-backup-put --policy-document "$POLICY"
[[ "$(aws iam list-access-keys --user-name "$USER_NAME" --query 'length(AccessKeyMetadata)')" == 0 ]] ||
  { say "$USER_NAME already has an access key: delete it first to rotate"; exit 1; }

umask 077
work="$(mktemp -d)"
trap 'rm -P -f "$work"/* 2>/dev/null; rm -rf "$work"' EXIT
aws iam create-access-key --user-name "$USER_NAME" --output json >"$work/key.json"
python3 -I - "$work/key.json" "$work/item.json" "$OUT.new" "$BUCKET" "$ITEM_TITLE" <<'PY'
import json, sys
key = json.load(open(sys.argv[1]))["AccessKey"]
item = {
    "title": sys.argv[5], "category": "API_CREDENTIAL",
    "fields": [
        {"id": "username", "type": "STRING", "label": "access key id", "value": key["AccessKeyId"]},
        {"id": "credential", "type": "CONCEALED", "label": "secret access key", "value": key["SecretAccessKey"]},
        {"id": "bucket", "type": "STRING", "label": "bucket", "value": sys.argv[4]},
        {"id": "notesPlain", "type": "STRING", "purpose": "NOTES", "label": "notesPlain",
         "value": "IAM user fiscalis-convex-backup-writer (account 866827143157). s3:PutObject on backups/* "
                  "and s3:ListBucket only. Used by fiscalis-convex-backup.service on the Mya VPS "
                  "(/etc/fiscalis-convex-backup/writer.env). Fiscalis repo ops/convex-backup, ENG-220."},
    ],
}
json.dump(item, open(sys.argv[2], "w"))
with open(sys.argv[3], "w") as out:
    out.write(f"FISCALIS_CONVEX_BACKUP_ACCESS_KEY_ID={key['AccessKeyId']}\n")
    out.write(f"FISCALIS_CONVEX_BACKUP_SECRET_ACCESS_KEY={key['SecretAccessKey']}\n")
    out.write(f"FISCALIS_CONVEX_BACKUP_BUCKET={sys.argv[4]}\n")
PY
"$MYA_OP" item create --vault Mya --template "$work/item.json" >/dev/null
chmod 600 "$OUT.new" && mv -f "$OUT.new" "$OUT"
say "created the key of $USER_NAME; stored in the Mya vault ('$ITEM_TITLE') and $OUT (0600)"
say "next: install on the VPS (README, 'Install'), then delete $OUT"
