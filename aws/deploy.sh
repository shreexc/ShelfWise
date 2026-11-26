#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "=========================================================="
echo "Starting Library System deployment: $(date)"
echo "=========================================================="

df -h /

echo "Fetching latest code..."
git fetch origin main
git reset --hard origin/main

if [[ ! -f .env ]]; then
  echo "No root .env found. Starting requires JWT_SECRET and email secrets."
fi

echo "Pulling MongoDB image..."
docker compose pull mongo || true

echo "Building and recreating containers..."
docker compose up -d --build --remove-orphans

echo "Pruning unused Docker resources..."
docker image prune -f

echo "Container status:"
docker compose ps

echo "=========================================================="
echo "Deployment complete. Application is served on port 80."
echo "=========================================================="
