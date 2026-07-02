#!/usr/bin/env bash
# Stops and removes all containers (data in postgres_data volume is preserved).
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

docker compose down
