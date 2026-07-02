#!/usr/bin/env bash
# Builds and starts all containers (postgres, backend, frontend) in the background.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

docker compose up -d --build
echo ""
echo "Dashboard:  http://localhost:3000"
echo "Backend:    http://localhost:4000/api/health"
echo ""
echo "Logs: ./docker-logs.sh [service]"
