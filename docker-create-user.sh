#!/usr/bin/env bash
# Creates a dashboard user inside the running backend container.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

docker compose exec backend npm run create-user
