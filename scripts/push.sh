#!/usr/bin/env bash
set -euo pipefail

REGION=ap-southeast-2
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
TAG=$(git rev-parse --short HEAD)

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY

for pair in frontend:frontend catalog-service:catalog inventory-service:inventory order-service:orders; do
  dir=${pair%%:*}
  repo=${pair##*:}
  DOCKER_BUILDKIT=0 docker build --platform linux/amd64 -t $REGISTRY/shoplite/$repo:$TAG ./$dir
  docker push $REGISTRY/shoplite/$repo:$TAG
done

echo "Pushed all images with tag $TAG"
