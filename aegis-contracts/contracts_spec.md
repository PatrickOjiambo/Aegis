# Aegis — Smart Contract Specification

**Target:** Casper Network · **Framework:** Odra v2.6 (Rust/WASM) · **Scope:** Buildathon MVP

This document specifies two contracts to build now — **EscrowVault** and **ReputationRegistry** — plus a third, **ArbiterStake**, that is *designed but deferred* (build only as a stretch goal). The EscrowVault is written with "appeal seams" so the stretch contract slots in without a rewrite.

> Hand this whole file to the coding agent. It assumes Odra v2.6 conventions: `use odra::prelude::*;`, modules via `#[odra::module]`, storage via `Var` / `Mapping` / `List`, custom types via `#[odra::odra_type]`, errors via `#[odra::odra_error]`, events via `#[odra::event]`, native CSPR via `#[odra(payable)]` + `self.env().transfer_tokens(...)`. Verify exact signatures against https://odra.dev/llms.txt before finalizing.

---

## 0. Conventions & shared concepts

- **Money:** escrowed value is native CSPR, type `odra::casper_types::U512`. (For the demo, CSPR stands in for "stablecoin paid via x402.")
- **Identity:** participants are `odra::Address`.
- **Terms:** the full agreed terms live OFF-chain (JSON). On-chain we store only `terms_hash: [u8; 32]` (a 32-byte digest). The arbiter recomputes the hash off-chain and compares before trusting any terms. **Never store full terms on-chain.**
- **Evidence:** likewise referenced by hash, not stored. Each evidence item is a `[u8; 32]` content hash (+ an off-chain URI the contract does not need to know about).
- **Time:** use `self.env().get_block_time()` (`u64`, ms) for all deadlines/windows.
- **Verdicts move money; nothing else may.** Only a settlement call can transfer escrowed funds out.

---

## 1. Contract A — `EscrowVault` (BUILD NOW)

Holds funds for one-to-many independent deals, embeds the terms hash, runs the deal state machine, and exposes the single settlement entry point the arbiter calls. The "terms contract" you considered is folded in here as the `terms_hash` field.

### 1.1 Enums & custom types

```rust
#[odra::odra_type]
pub enum EscrowState {
    Pending = 1,    // funds deposited, awaiting fulfilment / review
    Fulfilled = 2,  // seller marked delivered; review window running
    Disputed = 3,   // a party raised a dispute; awaiting arbiter
    Released = 4,    // terminal: paid to seller
    Refunded = 5,    // terminal: returned to buyer
    Split = 6,       // terminal: divided buyer/seller
}

#[odra::odra_type]
pub enum Verdict {
    Release = 1,     // 100% to seller
    Refund = 2,      // 100% to buyer
    Split = 3,       // partial (see split_bps)
}

#[odra::odra_type]
pub struct Deal {
    pub buyer: Address,
    pub seller: Address,
    pub amount: U512,            // total escrowed
    pub terms_hash: [u8; 32],    // fingerprint of off-chain agreed terms
    pub state: EscrowState,
    pub created_at: u64,
    pub review_deadline: u64,    // after this, an un-disputed Fulfilled deal can auto-release
    pub evidence_deadline: u64,  // after a dispute, evidence cut-off (0 until disputed)
    // ----- appeal seams (set on settlement; unused in MVP) -----
    pub settled_at: u64,         // 0 until a verdict is applied
    pub appeal_deadline: u64,    // 0 in MVP; populated when ArbiterStake is added
    pub arbiter: Option<Address>,// who ruled (None until settled)
}
```

### 1.2 Storage layout

```rust
#[odra::module(
    errors = EscrowError,
    events = [DealOpened, Fulfilled, Disputed, EvidenceSubmitted, Settled]
)]
pub struct EscrowVault {
    next_id: Var<u64>,                       // monotonic deal id counter
    deals: Mapping<u64, Deal>,               // id -> Deal
    evidence: Mapping<u64, List<[u8; 32]>>,  // id -> evidence hashes (both parties)
    reputation: Var<Address>,                // address of ReputationRegistry (cross-call)
    authorized_arbiter: Var<Address>,        // MVP: single allowed arbiter (see §1.5)
    review_window_ms: Var<u64>,              // config, e.g. 3 days
    evidence_window_ms: Var<u64>,            // config, e.g. 1 day
}
```

### 1.3 Constructor

```rust
pub fn init(
    &mut self,
    reputation: Address,
    authorized_arbiter: Address,
    review_window_ms: u64,
    evidence_window_ms: u64,
)
```
Sets config, `next_id = 0`. (For MVP, `authorized_arbiter` is set once here; ArbiterStake replaces this check later.)

### 1.4 Entry points (functions)

| Function | Caller | Effect |
|---|---|---|
| `open_deal(seller, terms_hash) -> u64` **`#[odra(payable)]`** | buyer | Creates a `Deal` from attached CSPR (`self.env().attached_value()`). `amount = attached`. State → `Pending`. Sets `review_deadline = now + review_window_ms`. Emits `DealOpened`. Returns deal id. |
| `mark_fulfilled(id, evidence_hash)` | seller of `id` | Only in `Pending`. State → `Fulfilled`. Pushes evidence. Emits `Fulfilled`. |
| `raise_dispute(id)` | buyer **or** seller of `id` | Allowed in `Pending` or `Fulfilled`, before release. State → `Disputed`. Sets `evidence_deadline = now + evidence_window_ms`. Emits `Disputed`. |
| `submit_evidence(id, evidence_hash)` | buyer or seller of `id` | Only in `Disputed`, before `evidence_deadline`. Appends to `evidence[id]`. Emits `EvidenceSubmitted`. |
| `claim_release(id)` | seller (or anyone) | Only in `Fulfilled` and `now > review_deadline` and NOT disputed. Pays seller. State → `Released`. Emits `Settled{Release}`. (Happy-path auto-release.) |
| `settle(id, verdict, split_bps, rationale_hash)` | **authorized arbiter only** | Only in `Disputed` and `now >= evidence_deadline`. Applies verdict, transfers funds, sets `arbiter/settled_at`, writes reputation, emits `Settled`. See §1.6. |
| `timeout_refund(id)` | anyone | Safety valve: if `Disputed` and no settlement within a hard cap (e.g. `evidence_deadline + grace`), refund buyer. State → `Refunded`. (Liveness; funds never lock forever.) |

**Read-only getters:** `get_deal(id) -> Deal`, `get_state(id) -> EscrowState`, `evidence_count(id) -> u32`, `get_evidence(id, idx) -> [u8;32]`.

### 1.5 Access control (MVP vs. stretch)

- MVP: `settle` checks `self.env().caller() == self.authorized_arbiter.get()`. Anything else → revert `NotAuthorizedArbiter`.
- Stretch (ArbiterStake added): replace that check with a cross-call to `ArbiterStake.is_bonded(caller)`. **Keep `settle`'s body identical** so only the guard changes.

### 1.6 `settle` logic (core of Aegis)

```
require state == Disputed                        else revert NotDisputed
require now >= evidence_deadline                 else revert EvidenceWindowOpen
require caller == authorized_arbiter             else revert NotAuthorizedArbiter
match verdict:
  Release -> transfer_tokens(seller, amount); state = Released
  Refund  -> transfer_tokens(buyer,  amount); state = Refunded
  Split   -> require split_bps <= 10000 else revert BadSplit
             seller_cut = amount * split_bps / 10000
             transfer_tokens(seller, seller_cut)
             transfer_tokens(buyer,  amount - seller_cut)
             state = Split
set arbiter = Some(caller); settled_at = now
// appeal seam: appeal_deadline stays 0 in MVP
cross-call reputation.record_settlement(id, buyer, seller, caller, verdict)
emit Settled { id, verdict, split_bps, rationale_hash, arbiter: caller }
```

`split_bps` is basis points (0–10000); ignored unless `verdict == Split`. `rationale_hash` is the `[u8;32]` digest of the arbiter's written reasoning (stored in the event for audit; not in state).

### 1.7 Events

```rust
#[odra::event] pub struct DealOpened { pub id: u64, pub buyer: Address, pub seller: Address, pub amount: U512, pub terms_hash: [u8;32] }
#[odra::event] pub struct Fulfilled { pub id: u64, pub evidence_hash: [u8;32] }
#[odra::event] pub struct Disputed { pub id: u64, pub by: Address, pub evidence_deadline: u64 }
#[odra::event] pub struct EvidenceSubmitted { pub id: u64, pub by: Address, pub evidence_hash: [u8;32] }
#[odra::event] pub struct Settled { pub id: u64, pub verdict: Verdict, pub split_bps: u32, pub rationale_hash: [u8;32], pub arbiter: Address }
```

### 1.8 Errors

```rust
#[odra::odra_error]
pub enum EscrowError {
    NotBuyer = 101,
    NotSeller = 102,
    NotParty = 103,
    NotAuthorizedArbiter = 104,
    WrongState = 105,
    NotDisputed = 106,
    EvidenceWindowOpen = 107,   // tried to settle before evidence_deadline
    EvidenceWindowClosed = 108, // tried to submit after deadline
    ReviewWindowOpen = 109,     // tried to auto-release too early
    BadSplit = 110,             // split_bps > 10000
    ZeroAmount = 111,           // open_deal with no attached value
    DealNotFound = 112,
}
```

---

## 2. Contract B — `ReputationRegistry` (BUILD NOW)

A standalone, **publicly readable** trust ledger. Separate from escrow because a participant's reputation outlives any single deal and is consumed by other agents/dApps independently. Writeable only by registered writers (the EscrowVault), readable by anyone.

### 2.1 Custom type

```rust
#[odra::odra_type]
pub struct Score {
    pub deals: u32,        // total settlements involving this address
    pub positive: u32,     // outcomes counted favourable to this party
    pub disputes: u32,     // times this party was in a disputed deal
    pub overturned: u32,   // (arbiters) verdicts later overturned — 0 in MVP
}
```

### 2.2 Storage

```rust
#[odra::module(errors = ReputationError, events = [SettlementRecorded, Slashed])]
pub struct ReputationRegistry {
    scores: Mapping<Address, Score>,
    writers: Mapping<Address, bool>,   // contracts allowed to write (the EscrowVault)
    owner: Var<Address>,               // can add/remove writers
}
```

### 2.3 Constructor & admin

```rust
pub fn init(&mut self)                       // owner = caller
pub fn add_writer(&mut self, writer: Address)    // owner only
pub fn remove_writer(&mut self, writer: Address) // owner only
```

### 2.4 Entry points

| Function | Caller | Effect |
|---|---|---|
| `record_settlement(deal_id, buyer, seller, arbiter, verdict)` | writer only | Increments `deals` for buyer & seller; bumps `positive` for the favoured party per verdict; bumps `disputes`. Increments `arbiter` activity. Emits `SettlementRecorded`. |
| `record_overturn(arbiter)` | writer only | Increments `arbiter.overturned`. (Called by ArbiterStake/appeal flow later — **stub now, wire later**.) Emits `Slashed`. |
| `get_score(addr) -> Score` | anyone (read) | Public read. |

> Keep scoring logic trivial and transparent for the MVP (counts, not weighted formulas) — NFR: transparency. A fancy weighting can come later off-chain.

### 2.5 Errors

```rust
#[odra::odra_error]
pub enum ReputationError {
    NotWriter = 201,
    NotOwner = 202,
}
```

---

## 3. Contract C — `ArbiterStake` (DESIGN ONLY — STRETCH GOAL)

Do **not** build this for the core demo. Specified so the seams in EscrowVault make sense and so it can be added in week 3 without refactoring.

**Purpose:** arbiters bond CSPR collateral to become eligible to rule; the bond is slashed if an appeal overturns their verdict.

**Sketch:**
```rust
#[odra::module]
pub struct ArbiterStake {
    bonds: Mapping<Address, U512>,
    min_bond: Var<U512>,
    escrow: Var<Address>,        // allowed to trigger slashes
    reputation: Var<Address>,
}
// bond()  #[odra(payable)]      -> records caller's collateral
// unbond(amount)                -> withdraw if not locked
// is_bonded(addr) -> bool       -> EscrowVault.settle guard calls this
// slash(arbiter, beneficiary)   -> escrow/appeal-only; moves bond, calls reputation.record_overturn
```

**Integration when added (3 small changes, no rewrite):**
1. `EscrowVault.settle` guard: swap `caller == authorized_arbiter` for `ArbiterStake.is_bonded(caller)`.
2. `EscrowVault`: on settle, set `appeal_deadline = now + appeal_window`.
3. Add `EscrowVault.appeal(id)` + `resolve_appeal(id, new_verdict)` that re-settles and calls `ArbiterStake.slash(original_arbiter, ...)`.

---

## 4. Build order & deliverables

1. `ReputationRegistry` first (no dependencies). Deploy, test add_writer/record/get.
2. `EscrowVault` second; pass the registry address into `init` and `add_writer(escrow_addr)`.
3. Full happy-path test: `open_deal` → `mark_fulfilled` → (advance time) → `claim_release`; assert seller balance + reputation.
4. Full dispute test: `open_deal` → `raise_dispute` → `submit_evidence` ×2 → (advance to evidence_deadline) → `settle(Refund)`; assert buyer refunded, reputation updated, `Settled` event emitted.
5. Liveness test: `timeout_refund` after the grace cap.
6. (Stretch) `ArbiterStake` + appeal flow.

**Each contract ships with:** the module, its `#[odra::odra_error]` enum, its events, unit tests using `odra_test::env()` (`Deployer`, `set_caller`, `with_tokens`, `balance_of`, `emitted_event`, `try_*` for error assertions), and a short README of entry points.

## 5. Test patterns (Odra v2.6 reminders for the agent)

- Deploy: `let env = odra_test::env(); let mut c = EscrowVault::deploy(&env, EscrowVaultInitArgs{...});`
- Set actor: `env.set_caller(addr);`
- Send value with a call: `c.with_tokens(U512::from(1000)).open_deal(seller, hash);`
- Advance time: use the host env's time advance to cross `review_deadline` / `evidence_deadline`.
- Expect revert: `assert_eq!(c.try_settle(...).unwrap_err(), EscrowError::NotDisputed.into());`
- Assert event: `assert!(env.emitted_event(&c, Settled{...}));`
- Cross-contract: deploy registry, pass its `Address` to escrow `init`; from escrow call via a typed ref/`external_contract` per Odra cross-calls docs.