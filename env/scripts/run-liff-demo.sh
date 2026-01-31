#!/usr/bin/env bash
set -euo pipefail

# Run the LIFF demo environment (Vite + mock API) using docker compose.
#
# Usage:
#   ./env/scripts/run-liff-demo.sh
#
# Then expose http://localhost:5173 via ngrok/cloudflared and set the HTTPS URL
# as the LIFF Endpoint URL in LINE Developers.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[zgovend] starting LIFF demo env (docker compose)"
docker compose -f env/docker/liff-demo/docker-compose.yml up --build
