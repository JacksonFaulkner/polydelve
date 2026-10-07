#!/usr/bin/env bash
# Upload rendered docs demos (docs/animation/out/docs) to the assets bucket.
# Run only after `npm run demos` succeeds; a failed run leaves the old clips live.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/docs/animation/out/docs"
BUCKET="${ASSETS_BUCKET:-polydelve-assets}"
aws s3 sync "$DIR" "s3://$BUCKET/demos" \
  --exclude "*" --include "*.mp4" --include "*.png" --exclude "*FAILED*" \
  --cache-control "max-age=300,public"
echo "uploaded to s3://$BUCKET/demos"
