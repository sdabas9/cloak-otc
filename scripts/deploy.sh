#!/bin/bash
set -e

# Configuration -- update these for your deployment
TELOS_API="${TELOS_API:-https://mainnet.telos.net}"
CONTRACT_ACCOUNT="${CONTRACT_ACCOUNT:-your_account}"
BUILD_DIR="$(dirname "$0")/../build"

echo "Deploying otccloak to $CONTRACT_ACCOUNT on $TELOS_API"
echo "Build dir: $BUILD_DIR"

# Deploy contract
cleos -u "$TELOS_API" set contract "$CONTRACT_ACCOUNT" "$BUILD_DIR" \
  otccloak.wasm otccloak.abi \
  -p "$CONTRACT_ACCOUNT@active"

echo "Contract deployed. Setting up eosio.code permission..."

# Add eosio.code permission so the contract can send inline transfers
# Get the current public key for the account
CURRENT_KEY=$(cleos -u "$TELOS_API" get account "$CONTRACT_ACCOUNT" -j | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['permissions'][0]['required_auth']['keys'][0]['key'])")

cleos -u "$TELOS_API" set account permission "$CONTRACT_ACCOUNT" active \
  "{\"threshold\":1,\"keys\":[{\"key\":\"$CURRENT_KEY\",\"weight\":1}],\"accounts\":[{\"permission\":{\"actor\":\"$CONTRACT_ACCOUNT\",\"permission\":\"eosio.code\"},\"weight\":1}]}" \
  owner -p "$CONTRACT_ACCOUNT@owner"

echo "Done. Setting initial config (0.5% fee, not paused)..."

cleos -u "$TELOS_API" push action "$CONTRACT_ACCOUNT" setconfig '[50, false]' \
  -p "$CONTRACT_ACCOUNT@active"

echo "Deployment complete!"
