#!/usr/bin/env bash
# Tails logs for all services, or a single one: ./docker-logs.sh backend
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

docker compose logs -f "$@"
