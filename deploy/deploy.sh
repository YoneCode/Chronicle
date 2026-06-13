#!/usr/bin/env bash
# Deploy ChronicleOmega to GenLayer Testnet Bradbury (chain 4221).
#
# Prerequisites:
#   1. `npm i -g genlayer` (CLI installed).
#   2. Copy .env.example -> .env and fill ACCOUNT_PRIVATE_KEY, CONTEXT_URL,
#      TOLERANCE_BPS, KEYSTORE_PASSWORD.
#   3. Fund the account at https://testnet-faucet.genlayer.foundation/
#
# This script never prints the private key.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

set -a; . ./.env; set +a
export PATH="$HOME/.npm-global/bin:$PATH"

: "${ACCOUNT_PRIVATE_KEY:?set ACCOUNT_PRIVATE_KEY in .env}"
: "${CONTEXT_URL:?set CONTEXT_URL in .env}"
: "${TOLERANCE_BPS:?set TOLERANCE_BPS in .env}"
PW="${KEYSTORE_PASSWORD:-chronicle_local}"

echo "==> Selecting network testnet-bradbury"
genlayer network set testnet-bradbury

echo "==> Importing deployer account (idempotent)"
genlayer account import --name chronicle --private-key "$ACCOUNT_PRIVATE_KEY" --password "$PW" 2>/dev/null \
  || echo "    (account already imported)"
genlayer account use chronicle

echo "==> Account status"
genlayer account || true

echo "==> Deploying ChronicleOmega(context_url, tolerance_bps=$TOLERANCE_BPS)"
echo "$PW" | genlayer deploy --contract contracts/chronicle_omega.py --args "$CONTEXT_URL" "$TOLERANCE_BPS"

echo
echo "==> Deploy submitted. Copy the deployed address into .env as CONTRACT_ADDRESS"
echo "    and into frontend/.env as VITE_CONTRACT_ADDRESS, then verify on:"
echo "    https://explorer-bradbury.genlayer.com"
