# aegis_contracts

Smart contracts for **Aegis** — an on-chain escrow + arbitration + reputation
system for the Casper Network, built with the [Odra](https://odra.dev) framework
(v2.7).

This crate ships two contracts for the buildathon MVP:

| Contract | File | Role |
|---|---|---|
| **EscrowVault** | [`src/escrow.rs`](src/escrow.rs) | Holds native CSPR per deal, runs the deal state machine, exposes the arbiter's settlement entry point. |
| **ReputationRegistry** | [`src/reputation.rs`](src/reputation.rs) | Standalone, publicly-readable trust ledger written only by authorized contracts. |

A third contract, `ArbiterStake`, is **designed but deferred** (stretch goal) —
the EscrowVault carries "appeal seams" (`settled_at`, `appeal_deadline`,
`arbiter` fields and an isolated `assert_arbiter` guard) so it can be added
later without rewriting `settle`.

---

## Design at a glance

- **Money:** escrowed value is native CSPR (`U512`). Funds leave the vault only
  through a settlement path — `settle`, `claim_release`, or `timeout_refund`.
- **Terms & evidence are off-chain.** Only 32-byte content hashes
  (`terms_hash`, evidence hashes, `rationale_hash`) are stored on-chain.
- **Time** uses `env().get_block_time()` (ms) for all deadlines/windows.

---

## EscrowVault

### Constructor

```rust
init(reputation: Address, authorized_arbiter: Address,
     review_window_ms: u64, evidence_window_ms: u64)
```

### Entry points

| Function | Caller | Effect |
|---|---|---|
| `open_deal(seller, terms_hash) -> u64` **(payable)** | buyer | Creates a `Pending` deal funded by the attached CSPR. Sets `review_deadline`. Returns deal id. |
| `mark_fulfilled(id, evidence_hash)` | seller | `Pending` → `Fulfilled`; records first evidence. |
| `raise_dispute(id)` | buyer or seller | `Pending`/`Fulfilled` → `Disputed`; opens the evidence window. |
| `submit_evidence(id, evidence_hash)` | buyer or seller | `Disputed`, before `evidence_deadline`; appends an evidence hash. |
| `claim_release(id)` | anyone | Happy-path auto-release: `Fulfilled` + past `review_deadline` → pays seller, `Released`. |
| `settle(id, verdict, split_bps, rationale_hash)` | authorized arbiter | `Disputed` + evidence window closed → applies verdict, moves funds, writes reputation, `Released`/`Refunded`/`Split`. |
| `timeout_refund(id)` | anyone | Liveness valve: `Disputed` past `evidence_deadline + 7d` → refunds buyer, `Refunded`. |

**Read-only:** `get_deal(id)`, `get_state(id)`, `evidence_count(id)`,
`get_evidence(id, idx)`.

### Verdicts (`settle`)

- `Release` → 100% to seller
- `Refund` → 100% to buyer
- `Split` → `seller_cut = amount * split_bps / 10000` (basis points, 0–10000),
  remainder to buyer.

### Access control

MVP: `settle` requires `caller == authorized_arbiter`. The guard is isolated in
the private `assert_arbiter` helper — the stretch `ArbiterStake` integration
swaps it for `ArbiterStake.is_bonded(caller)` and leaves the `settle` body
untouched.

---

## ReputationRegistry

A trust ledger of plain, transparent counters (`Score { deals, positive,
disputes, overturned }`). Writeable only by registered writers (the
EscrowVault), readable by anyone.

### Constructor & admin

```rust
init()                       // deployer becomes owner
add_writer(writer: Address)      // owner only
remove_writer(writer: Address)   // owner only
```

### Entry points

| Function | Caller | Effect |
|---|---|---|
| `record_settlement(deal_id, buyer, seller, arbiter, verdict)` | writer | Bumps `deals`/`disputes` for both parties, credits `positive` to the favoured party, records arbiter activity. |
| `record_overturn(arbiter)` | writer | Bumps `arbiter.overturned` (appeal flow — stubbed for MVP). |
| `get_score(addr) -> Score` | anyone | Public read (zeroed `Score` for unknown addresses). |
| `is_writer(addr) -> bool` | anyone | Whether `addr` may write. |

> Only the disputed-settlement path (`settle`) records reputation. Happy-path
> `claim_release` deliberately leaves the ledger untouched (no dispute occurred).

---

## Deploy order

1. Deploy `ReputationRegistry` (no dependencies).
2. Deploy `EscrowVault`, passing the registry address into `init`.
3. `ReputationRegistry.add_writer(<escrow address>)` so the vault may write.

---

## Build & test

Install [cargo-odra](https://github.com/odradev/cargo-odra), then:

```sh
cargo odra test            # OdraVM unit tests (fast)
cargo odra test -b casper  # against real wasm + Casper backend
cargo odra build -b casper # produce wasm in ./wasm
```

Plain `cargo test` also runs the full OdraVM suite (16 tests covering the
happy path, dispute→settle for all three verdicts, split validation,
timeout-refund liveness, and access-control reverts).
