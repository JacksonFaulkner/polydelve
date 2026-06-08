#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"

echo "==> Reading terraform outputs ..."
S3_BUCKET=$(terraform -chdir=terraform output -raw frontend_bucket)
CF_DIST_ID=$(terraform -chdir=terraform output -raw cloudfront_distribution_id)

echo "==> Building frontend ..."
cd frontend
VITE_API_URL=https://polydelve.com/api npm run build
cd ..

echo "==> Syncing to s3://$S3_BUCKET ..."
aws s3 sync frontend/dist/ "s3://$S3_BUCKET" \
  --delete \
  --region "$AWS_REGION"

echo "==> Invalidating CloudFront distribution $CF_DIST_ID ..."
aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths "/*" \
  --output text \
  --query "Invalidation.Id"

echo "==> Done."
