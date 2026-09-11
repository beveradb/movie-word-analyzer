#!/usr/bin/env bash
# Sync data/out/ to the moviewords-data R2 bucket via rclone's S3 backend.
# Requires: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${CLOUDFLARE_ACCOUNT_ID:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}"
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
rclone sync data/out/ r2:moviewords-data/ --progress --checksum
echo "Synced $(du -sh data/out | cut -f1) to r2:moviewords-data"
