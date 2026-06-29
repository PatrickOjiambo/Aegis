#!/usr/bin/env bash
# Aegis — install ReputationRegistry (Contract B) on Casper testnet and call
# add_writer(). Two real on-chain transactions. Run after funding the deployer
# (arbiter) via the faucet.
#
# Notes for Casper 2.0 (protocol 2.2.x):
#   * pricing-mode must be `classic` with --standard-payment (fixed is rejected).
#   * Contract wasm must be MVP — see .cargo/config.toml — and have the
#     DataCount section stripped (wasm-opt --mvp-features), else the EE rejects
#     it with "Sections out of order".
#   * Odra install needs the odra_cfg_* runtime args supplied below.
set -euo pipefail

NODE=${CASPER_NODE_RPC_URL:-https://node.testnet.casper.network/rpc}
CHAIN=${CASPER_NETWORK_NAME:-casper-test}
KEY=${1:-../server/keys/arbiter/secret_key.pem}
DIR="$(cd "$(dirname "$0")" && pwd)"
WASM="$DIR/wasm/ReputationRegistry.wasm"

txn_hash() { python3 -c "import sys,json;print(json.load(sys.stdin)['result']['transaction_hash']['Version1'])"; }

wait_exec() {
  local txn=$1
  until casper-client get-transaction --node-address "$NODE" "$txn" 2>/dev/null | grep -q execution_info; do sleep 10; done
  sleep 15
  casper-client get-transaction --node-address "$NODE" "$txn" 2>/dev/null \
    | python3 -c "import sys,json;er=json.load(sys.stdin)['result']['execution_info'].get('execution_result') or {};v=er.get('Version2',er);print('  error:',v.get('error_message'),'cost:',v.get('cost'))"
}

echo "== 1/2 Installing ReputationRegistry.wasm =="
TXN=$(casper-client put-transaction session \
  --node-address "$NODE" --chain-name "$CHAIN" \
  --secret-key "$KEY" --install-upgrade \
  --transaction-runtime "vm-casper-v1" --wasm-path "$WASM" \
  --gas-price-tolerance 1 --pricing-mode classic --standard-payment true \
  --payment-amount 300000000000 --session-entry-point call \
  --session-arg "odra_cfg_package_hash_key_name:string='ReputationRegistry_package_hash'" \
  --session-arg "odra_cfg_allow_key_override:bool='true'" \
  --session-arg "odra_cfg_is_upgradable:bool='false'" \
  --session-arg "odra_cfg_is_upgrade:bool='false'" | txn_hash)
echo "  install txn: $TXN"
echo "  https://testnet.cspr.live/transaction/$TXN"
wait_exec "$TXN"

PKG=$(casper-client get-entity --node-address "$NODE" --public-key "$(dirname "$KEY")/public_key_hex" 2>/dev/null \
  | sed 's/^response[^{]*//' \
  | python3 -c "import sys,json;nks=json.load(sys.stdin)['result']['entity']['Account']['named_keys'];print(next(n['key'] for n in nks if n['name']=='ReputationRegistry_package_hash'))")
echo "  package: $PKG"

echo "== 2/2 add_writer(buyer) =="
BUYER=${BUYER_ACCOUNT_HASH:-account-hash-a20395f426cab1939b7a13a216e8a8c85763058efd242f27159e902ea7c2bc05}
TXN2=$(casper-client put-transaction package \
  --node-address "$NODE" --chain-name "$CHAIN" --secret-key "$KEY" \
  --package-address "${PKG/hash-/package-}" \
  --transaction-runtime "vm-casper-v1" --session-entry-point add_writer \
  --gas-price-tolerance 1 --pricing-mode classic --standard-payment true \
  --payment-amount 5000000000 \
  --session-arg "writer:key='$BUYER'" | txn_hash)
echo "  add_writer txn: $TXN2"
echo "  https://testnet.cspr.live/transaction/$TXN2"
wait_exec "$TXN2"
