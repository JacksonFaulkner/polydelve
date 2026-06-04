#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "==> Reading terraform outputs ..."
ECR_URL=$(terraform -chdir=terraform output -raw ecr_repository_url)
CLUSTER=$(terraform -chdir=terraform output -raw ecs_cluster_name 2>/dev/null || echo "polydelve")
SERVICE=$(terraform -chdir=terraform output -raw ecs_service_name 2>/dev/null || echo "polydelve-backend-v2")

FULL_IMAGE="${ECR_URL}:${IMAGE_TAG}"

echo "==> Logging into ECR ..."
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_URL"

echo "==> Building image: $FULL_IMAGE ..."
docker build --platform linux/amd64 -t "$FULL_IMAGE" backend/

echo "==> Pushing image ..."
docker push "$FULL_IMAGE"

echo "==> Forcing new ECS deployment ..."
aws ecs update-service \
  --region "$AWS_REGION" \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --force-new-deployment \
  --output text \
  --query "service.serviceName"

echo "==> Done. New deployment triggered for $SERVICE."
