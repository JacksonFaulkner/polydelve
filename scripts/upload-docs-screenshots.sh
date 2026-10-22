#!/usr/bin/env bash
# Upload docs screenshots to the assets bucket.
#   current UI:  docs/animation/out/docs     -> s3://<bucket>/screenshots
#   history:     docs/animation/out/history  -> s3://<bucket>/screenshots/history
# Generate first: (cd docs/animation && npm run screenshots && npm run history).
# A failed capture exits non-zero before anything is uploaded, so docs keep the last good images.
set -euo pipefail
OUT="$(cd "$(dirname "$0")/.." && pwd)/docs/animation/out"
BUCKET="${ASSETS_BUCKET:-polydelve-assets}"
sync() {
  aws s3 sync "$1" "s3://$BUCKET/$2" \
    --exclude "*" --include "*.png" --exclude "*FAILED*" \
    --cache-control "max-age=300,public"
}
sync "$OUT/docs" screenshots
[ -d "$OUT/history" ] && sync "$OUT/history" screenshots/history
echo "uploaded to s3://$BUCKET/screenshots"
