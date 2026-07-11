#!/usr/bin/env bash
# Deploys this repo to the production server over Tailscale.
#
# MUST be run from WSL ("Ubuntu" distro) — the Windows host has no route to
# the Tailscale network, only WSL does (it's the machine with the Tailscale
# client). From Windows PowerShell, invoke it like:
#
#   wsl -d Ubuntu -- bash -lc "cd /mnt/c/path/to/n8n-dashboard && ./deploy-prod.sh"
#
# SECURITY: this script deliberately never contains the server's IP,
# username, or any credential — it only ever refers to an SSH host alias
# (see HOST_ALIAS below). That alias must be pre-configured once, locally,
# in the WSL user's own ~/.ssh/config (NOT part of this repo), e.g.:
#
#   Host n8n-dashboard-prod
#       HostName <tailscale-ip-or-magicdns-name>
#       User <ssh-user>
#       IdentityFile ~/.ssh/<your-key>
#       IdentitiesOnly yes
#
# That way the real connection details never need to appear in the repo,
# in chat logs, or in anything that might get committed/shared.
#
# Usage:
#   ./deploy-prod.sh                 # rebuild & restart backend + frontend (default)
#   ./deploy-prod.sh backend         # rebuild & restart backend only
#   ./deploy-prod.sh frontend        # rebuild & restart frontend only
#
# Env overrides (optional):
#   N8N_DEPLOY_HOST=my-alias         # use a different SSH alias
#   N8N_DEPLOY_REMOTE_DIR=~/other    # use a different remote directory

set -euo pipefail

HOST_ALIAS="${N8N_DEPLOY_HOST:-n8n-dashboard-prod}"
REMOTE_DIR="${N8N_DEPLOY_REMOTE_DIR:-~/n8n-dashboard}"
SERVICES="${1:-backend frontend}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v ssh >/dev/null 2>&1; then
  echo "Error: ssh not found. Run this script from WSL, not native Windows." >&2
  exit 1
fi

echo "Checking connection to '$HOST_ALIAS'..."
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$HOST_ALIAS" true 2>/dev/null; then
  echo "Error: could not reach '$HOST_ALIAS' over SSH." >&2
  echo "Configure a matching Host entry in ~/.ssh/config (see comments at the top of this script)." >&2
  exit 1
fi

TMP_TAR="$(mktemp /tmp/n8n-dashboard-deploy-XXXXXX.tar.gz)"
trap 'rm -f "$TMP_TAR"' EXIT

# .env* is intentionally excluded: the server's own .env holds
# production-specific values (URLs, secrets) that must never be overwritten
# by whatever is in the local working copy.
echo "Packaging repository..."
tar -czf "$TMP_TAR" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='backend/node_modules' \
  --exclude='build' \
  --exclude='.env*' \
  .

REMOTE_TMP="/tmp/$(basename "$TMP_TAR")"
echo "Uploading to $HOST_ALIAS..."
scp -q "$TMP_TAR" "$HOST_ALIAS:$REMOTE_TMP"

echo "Extracting and rebuilding ($SERVICES)..."
ssh "$HOST_ALIAS" "mkdir -p $REMOTE_DIR && tar -xzf $REMOTE_TMP -C $REMOTE_DIR && rm -f $REMOTE_TMP && cd $REMOTE_DIR && docker compose up -d --build $SERVICES"

echo "Verifying container health..."
ssh "$HOST_ALIAS" "cd $REMOTE_DIR && docker compose ps"

echo "Deploy complete."
