//! # EscrowVault — Aegis Contract A
//!
//! Holds native CSPR for one-to-many independent deals, embeds the off-chain
//! terms via a `terms_hash`, runs the deal state machine, and exposes the
//! single settlement entry point ([`EscrowVault::settle`]) the arbiter calls.
//!
//! ## Money invariant
//! Escrowed value is native CSPR ([`U512`]). Funds leave the vault only through
//! a settlement path: [`EscrowVault::settle`] (arbiter verdict),
//! [`EscrowVault::claim_release`] (happy-path auto-release), or
//! [`EscrowVault::timeout_refund`] (liveness safety valve). Nothing else moves
//! money.
//!
//! ## Terms & evidence
//! The full agreed terms live OFF-chain (JSON). On-chain we keep only a
//! 32-byte digest (`terms_hash`). Evidence is likewise referenced by content
//! hash, never stored in full.
//!
//! ## Appeal seams (MVP vs. stretch)
//! The [`Deal`] struct carries `settled_at`, `appeal_deadline` and `arbiter`
//! fields and the [`EscrowVault::settle`] guard is isolated in
//! [`EscrowVault::assert_arbiter`] so the stretch `ArbiterStake` contract can be
//! wired in by changing only the guard — the `settle` body stays identical.

use crate::reputation::ReputationRegistryContractRef;
use odra::casper_types::U512;
use odra::prelude::*;
use odra::ContractRef;

/// After a dispute, if no arbiter settles within `evidence_deadline + GRACE`,
/// anyone may trigger [`EscrowVault::timeout_refund`] so funds never lock
/// forever. 7 days in milliseconds.
const TIMEOUT_GRACE_MS: u64 = 7 * 24 * 60 * 60 * 1000;

/// Lifecycle of an escrowed deal.
#[odra::odra_type]
pub enum EscrowState {
    /// Funds deposited, awaiting fulfilment / review.
    Pending = 1,
    /// Seller marked delivered; review window running.
    Fulfilled = 2,
    /// A party raised a dispute; awaiting arbiter.
    Disputed = 3,
    /// Terminal: paid to seller.
    Released = 4,
    /// Terminal: returned to buyer.
    Refunded = 5,
    /// Terminal: divided between buyer and seller.
    Split = 6,
}

/// An arbiter's ruling.
#[odra::odra_type]
pub enum Verdict {
    /// 100% to seller.
    Release = 1,
    /// 100% to buyer.
    Refund = 2,
    /// Partial split (see `split_bps`).
    Split = 3,
}

/// A single escrow agreement between a buyer and a seller.
#[odra::odra_type]
pub struct Deal {
    pub buyer: Address,
    pub seller: Address,
    /// Total CSPR escrowed.
    pub amount: U512,
    /// Fingerprint of the off-chain agreed terms.
    pub terms_hash: [u8; 32],
    pub state: EscrowState,
    pub created_at: u64,
    /// After this, an un-disputed `Fulfilled` deal can auto-release.
    pub review_deadline: u64,
    /// After a dispute, the evidence cut-off (0 until disputed).
    pub evidence_deadline: u64,
    // ----- appeal seams (set on settlement; unused in MVP) -----
    /// 0 until a verdict is applied.
    pub settled_at: u64,
    /// 0 in the MVP; populated when `ArbiterStake` is added.
    pub appeal_deadline: u64,
    /// Who ruled (`None` until settled).
    pub arbiter: Option<Address>,
}

// ------------------------------------------------------------------------
// Events
// ------------------------------------------------------------------------

#[odra::event]
pub struct DealOpened {
    pub id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub amount: U512,
    pub terms_hash: [u8; 32],
}

#[odra::event]
pub struct Fulfilled {
    pub id: u64,
    pub evidence_hash: [u8; 32],
}

#[odra::event]
pub struct Disputed {
    pub id: u64,
    pub by: Address,
    pub evidence_deadline: u64,
}

#[odra::event]
pub struct EvidenceSubmitted {
    pub id: u64,
    pub by: Address,
    pub evidence_hash: [u8; 32],
}

#[odra::event]
pub struct Settled {
    pub id: u64,
    pub verdict: Verdict,
    pub split_bps: u32,
    pub rationale_hash: [u8; 32],
    pub arbiter: Address,
}

// ------------------------------------------------------------------------
// Errors
// ------------------------------------------------------------------------

#[odra::odra_error]
pub enum EscrowError {
    NotBuyer = 101,
    NotSeller = 102,
    NotParty = 103,
    NotAuthorizedArbiter = 104,
    WrongState = 105,
    NotDisputed = 106,
    /// Tried to settle before `evidence_deadline`.
    EvidenceWindowOpen = 107,
    /// Tried to submit evidence after `evidence_deadline`.
    EvidenceWindowClosed = 108,
    /// Tried to auto-release before `review_deadline`.
    ReviewWindowOpen = 109,
    /// `split_bps` > 10000.
    BadSplit = 110,
    /// `open_deal` with no attached value.
    ZeroAmount = 111,
    DealNotFound = 112,
}

// ------------------------------------------------------------------------
// Module
// ------------------------------------------------------------------------

#[odra::module(
    errors = EscrowError,
    events = [DealOpened, Fulfilled, Disputed, EvidenceSubmitted, Settled]
)]
pub struct EscrowVault {
    /// Monotonic deal id counter.
    next_id: Var<u64>,
    /// id -> Deal.
    deals: Mapping<u64, Deal>,
    /// (id, index) -> evidence hash contributed by either party.
    ///
    /// Odra's `List` is not a `Module`, so it cannot be nested directly inside a
    /// `Mapping`. We model the per-deal append-only list with a flat
    /// `(id, index)` keyed mapping plus an `evidence_len` counter — equivalent
    /// to the `Mapping<u64, List<[u8; 32]>>` in the spec.
    evidence: Mapping<(u64, u32), [u8; 32]>,
    /// id -> number of evidence items recorded.
    evidence_len: Mapping<u64, u32>,
    /// Address of the `ReputationRegistry` (cross-call target).
    reputation: Var<Address>,
    /// MVP: the single address allowed to call `settle` (see access control).
    authorized_arbiter: Var<Address>,
    /// Review window length in ms (e.g. 3 days).
    review_window_ms: Var<u64>,
    /// Evidence window length in ms (e.g. 1 day).
    evidence_window_ms: Var<u64>,
}

#[odra::module]
impl EscrowVault {
    /// Configures the vault. `next_id` starts at 0.
    ///
    /// For the MVP `authorized_arbiter` is fixed here; the stretch
    /// `ArbiterStake` contract replaces the guard, not this constructor.
    pub fn init(
        &mut self,
        reputation: Address,
        authorized_arbiter: Address,
        review_window_ms: u64,
        evidence_window_ms: u64,
    ) {
        self.next_id.set(0);
        self.reputation.set(reputation);
        self.authorized_arbiter.set(authorized_arbiter);
        self.review_window_ms.set(review_window_ms);
        self.evidence_window_ms.set(evidence_window_ms);
    }

    // --------------------------------------------------------------------
    // Deal lifecycle
    // --------------------------------------------------------------------

    /// Opens a new deal funded by the attached CSPR. Caller is the buyer.
    /// State → `Pending`. Returns the new deal id.
    #[odra(payable)]
    pub fn open_deal(&mut self, seller: Address, terms_hash: [u8; 32]) -> u64 {
        let amount = self.env().attached_value();
        if amount.is_zero() {
            self.env().revert(EscrowError::ZeroAmount);
        }

        let buyer = self.env().caller();
        let now = self.env().get_block_time();
        let id = self.next_id.get_or_default();

        let deal = Deal {
            buyer,
            seller,
            amount,
            terms_hash,
            state: EscrowState::Pending,
            created_at: now,
            review_deadline: now + self.review_window_ms.get_or_default(),
            evidence_deadline: 0,
            settled_at: 0,
            appeal_deadline: 0,
            arbiter: None,
        };

        self.deals.set(&id, deal);
        self.next_id.set(id + 1);

        self.env().emit_event(DealOpened {
            id,
            buyer,
            seller,
            amount,
            terms_hash,
        });

        id
    }

    /// Seller marks the deal delivered and attaches a first evidence hash.
    /// Only valid in `Pending`. State → `Fulfilled`.
    pub fn mark_fulfilled(&mut self, id: u64, evidence_hash: [u8; 32]) {
        let mut deal = self.read_deal(id);
        if self.env().caller() != deal.seller {
            self.env().revert(EscrowError::NotSeller);
        }
        if !matches!(deal.state, EscrowState::Pending) {
            self.env().revert(EscrowError::WrongState);
        }

        deal.state = EscrowState::Fulfilled;
        self.deals.set(&id, deal);
        self.push_evidence(id, evidence_hash);

        self.env().emit_event(Fulfilled { id, evidence_hash });
    }

    /// Either party raises a dispute. Allowed in `Pending` or `Fulfilled`,
    /// before release. State → `Disputed`; starts the evidence window.
    pub fn raise_dispute(&mut self, id: u64) {
        let mut deal = self.read_deal(id);
        let caller = self.env().caller();
        if caller != deal.buyer && caller != deal.seller {
            self.env().revert(EscrowError::NotParty);
        }
        if !matches!(deal.state, EscrowState::Pending | EscrowState::Fulfilled) {
            self.env().revert(EscrowError::WrongState);
        }

        let now = self.env().get_block_time();
        let evidence_deadline = now + self.evidence_window_ms.get_or_default();
        deal.state = EscrowState::Disputed;
        deal.evidence_deadline = evidence_deadline;
        self.deals.set(&id, deal);

        self.env().emit_event(Disputed {
            id,
            by: caller,
            evidence_deadline,
        });
    }

    /// Either party appends an evidence hash. Only in `Disputed`, before the
    /// `evidence_deadline`.
    pub fn submit_evidence(&mut self, id: u64, evidence_hash: [u8; 32]) {
        let deal = self.read_deal(id);
        let caller = self.env().caller();
        if caller != deal.buyer && caller != deal.seller {
            self.env().revert(EscrowError::NotParty);
        }
        if !matches!(deal.state, EscrowState::Disputed) {
            self.env().revert(EscrowError::NotDisputed);
        }
        if self.env().get_block_time() > deal.evidence_deadline {
            self.env().revert(EscrowError::EvidenceWindowClosed);
        }

        self.push_evidence(id, evidence_hash);

        self.env().emit_event(EvidenceSubmitted {
            id,
            by: caller,
            evidence_hash,
        });
    }

    /// Happy-path auto-release. Anyone may call once a `Fulfilled` deal passes
    /// its `review_deadline` without dispute. Pays the seller; state →
    /// `Released`.
    pub fn claim_release(&mut self, id: u64) {
        let mut deal = self.read_deal(id);
        if !matches!(deal.state, EscrowState::Fulfilled) {
            self.env().revert(EscrowError::WrongState);
        }
        if self.env().get_block_time() <= deal.review_deadline {
            self.env().revert(EscrowError::ReviewWindowOpen);
        }

        // Effects before interaction (checks-effects-interactions).
        let seller = deal.seller;
        let amount = deal.amount;
        deal.state = EscrowState::Released;
        deal.settled_at = self.env().get_block_time();
        self.deals.set(&id, deal);

        self.env().transfer_tokens(&seller, &amount);

        // No arbiter ruled; mark the vault itself as the settling party in the
        // audit event. Auto-release does not touch reputation (no dispute).
        self.env().emit_event(Settled {
            id,
            verdict: Verdict::Release,
            split_bps: 0,
            rationale_hash: [0u8; 32],
            arbiter: self.env().self_address(),
        });
    }

    /// Arbiter applies a verdict and moves the money. The core of Aegis.
    /// Only in `Disputed`, once the evidence window has closed.
    pub fn settle(&mut self, id: u64, verdict: Verdict, split_bps: u32, rationale_hash: [u8; 32]) {
        let mut deal = self.read_deal(id);
        let caller = self.env().caller();
        let now = self.env().get_block_time();

        if !matches!(deal.state, EscrowState::Disputed) {
            self.env().revert(EscrowError::NotDisputed);
        }
        if now < deal.evidence_deadline {
            self.env().revert(EscrowError::EvidenceWindowOpen);
        }
        // Isolated guard — swap to `ArbiterStake.is_bonded(caller)` later.
        self.assert_arbiter(caller);
        // Validate the split up front so effects are not partially applied.
        if matches!(verdict, Verdict::Split) && split_bps > 10000 {
            self.env().revert(EscrowError::BadSplit);
        }

        let buyer = deal.buyer;
        let seller = deal.seller;
        let amount = deal.amount;

        // Effects: persist the terminal state before any transfer.
        deal.state = match verdict {
            Verdict::Release => EscrowState::Released,
            Verdict::Refund => EscrowState::Refunded,
            Verdict::Split => EscrowState::Split,
        };
        deal.arbiter = Some(caller);
        deal.settled_at = now;
        // Appeal seam: appeal_deadline stays 0 in the MVP.
        self.deals.set(&id, deal);

        // Interactions: move the money per verdict.
        match verdict {
            Verdict::Release => self.env().transfer_tokens(&seller, &amount),
            Verdict::Refund => self.env().transfer_tokens(&buyer, &amount),
            Verdict::Split => {
                let seller_cut = amount * U512::from(split_bps) / U512::from(10000u32);
                let buyer_cut = amount - seller_cut;
                self.env().transfer_tokens(&seller, &seller_cut);
                self.env().transfer_tokens(&buyer, &buyer_cut);
            }
        }

        // Cross-call: write the outcome to the reputation ledger.
        let reputation = self.reputation.get().unwrap();
        ReputationRegistryContractRef::new(self.env(), reputation)
            .record_settlement(id, buyer, seller, caller, verdict.clone());

        self.env().emit_event(Settled {
            id,
            verdict,
            split_bps,
            rationale_hash,
            arbiter: caller,
        });
    }

    /// Liveness safety valve: if a `Disputed` deal is never settled within the
    /// hard cap (`evidence_deadline + TIMEOUT_GRACE_MS`), anyone may refund the
    /// buyer so funds never lock forever. State → `Refunded`.
    pub fn timeout_refund(&mut self, id: u64) {
        let mut deal = self.read_deal(id);
        if !matches!(deal.state, EscrowState::Disputed) {
            self.env().revert(EscrowError::NotDisputed);
        }
        let now = self.env().get_block_time();
        if now < deal.evidence_deadline + TIMEOUT_GRACE_MS {
            // Hard cap not reached yet — the arbiter may still rule.
            self.env().revert(EscrowError::EvidenceWindowOpen);
        }

        let buyer = deal.buyer;
        let amount = deal.amount;
        deal.state = EscrowState::Refunded;
        deal.settled_at = now;
        self.deals.set(&id, deal);

        self.env().transfer_tokens(&buyer, &amount);

        self.env().emit_event(Settled {
            id,
            verdict: Verdict::Refund,
            split_bps: 0,
            rationale_hash: [0u8; 32],
            arbiter: self.env().self_address(),
        });
    }

    // --------------------------------------------------------------------
    // Read-only getters
    // --------------------------------------------------------------------

    /// Returns the full deal, reverting if `id` is unknown.
    pub fn get_deal(&self, id: u64) -> Deal {
        self.read_deal(id)
    }

    /// Returns the current state, reverting if `id` is unknown.
    pub fn get_state(&self, id: u64) -> EscrowState {
        self.read_deal(id).state
    }

    /// Number of evidence items recorded for a deal.
    pub fn evidence_count(&self, id: u64) -> u32 {
        self.evidence_len.get(&id).unwrap_or(0)
    }

    /// Evidence hash at `idx`, or all-zero if out of range.
    pub fn get_evidence(&self, id: u64, idx: u32) -> [u8; 32] {
        self.evidence.get(&(id, idx)).unwrap_or([0u8; 32])
    }

    // --------------------------------------------------------------------
    // Internal helpers (not exposed as entry points)
    // --------------------------------------------------------------------

    fn read_deal(&self, id: u64) -> Deal {
        match self.deals.get(&id) {
            Some(deal) => deal,
            None => self.env().revert(EscrowError::DealNotFound),
        }
    }

    /// Appends an evidence hash to the deal's flat append-only list.
    fn push_evidence(&mut self, id: u64, evidence_hash: [u8; 32]) {
        let idx = self.evidence_len.get(&id).unwrap_or(0);
        self.evidence.set(&(id, idx), evidence_hash);
        self.evidence_len.set(&id, idx + 1);
    }

    /// MVP access guard for [`EscrowVault::settle`]. Stretch goal: replace the
    /// body with a cross-call to `ArbiterStake.is_bonded(caller)` — keep the
    /// signature so `settle` itself is untouched.
    fn assert_arbiter(&self, caller: Address) {
        if caller != self.authorized_arbiter.get().unwrap() {
            self.env().revert(EscrowError::NotAuthorizedArbiter);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reputation::{ReputationRegistry, ReputationRegistryHostRef};
    use odra::host::{Deployer, HostEnv, HostRef, NoArgs};

    struct Ctx {
        env: HostEnv,
        escrow: EscrowVaultHostRef,
        registry: ReputationRegistryHostRef,
        buyer: Address,
        seller: Address,
        arbiter: Address,
    }

    const REVIEW_MS: u64 = 3 * 24 * 60 * 60 * 1000; // 3 days
    const EVIDENCE_MS: u64 = 24 * 60 * 60 * 1000; // 1 day
    const AMOUNT: u64 = 1_000_000_000;

    fn setup() -> Ctx {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let buyer = env.get_account(1);
        let seller = env.get_account(2);
        let arbiter = env.get_account(3);

        env.set_caller(owner);
        let mut registry = ReputationRegistry::deploy(&env, NoArgs);
        let escrow = EscrowVault::deploy(
            &env,
            EscrowVaultInitArgs {
                reputation: registry.address(),
                authorized_arbiter: arbiter,
                review_window_ms: REVIEW_MS,
                evidence_window_ms: EVIDENCE_MS,
            },
        );
        // Authorize the vault to write reputation.
        registry.add_writer(escrow.address());

        Ctx {
            env,
            escrow,
            registry,
            buyer,
            seller,
            arbiter,
        }
    }

    fn open(ctx: &mut Ctx) -> u64 {
        ctx.env.set_caller(ctx.buyer);
        ctx.escrow
            .with_tokens(U512::from(AMOUNT))
            .open_deal(ctx.seller, [9u8; 32])
    }

    #[test]
    fn open_deal_records_funds_and_state() {
        let mut ctx = setup();
        let id = open(&mut ctx);

        let deal = ctx.escrow.get_deal(id);
        assert_eq!(deal.buyer, ctx.buyer);
        assert_eq!(deal.seller, ctx.seller);
        assert_eq!(deal.amount, U512::from(AMOUNT));
        assert!(matches!(deal.state, EscrowState::Pending));
        assert_eq!(ctx.env.balance_of(&ctx.escrow.address()), U512::from(AMOUNT));
    }

    #[test]
    fn open_deal_with_zero_value_reverts() {
        let ctx = setup();
        ctx.env.set_caller(ctx.buyer);
        assert_eq!(
            ctx.escrow
                .with_tokens(U512::zero())
                .try_open_deal(ctx.seller, [0u8; 32])
                .unwrap_err(),
            EscrowError::ZeroAmount.into()
        );
    }

    #[test]
    fn happy_path_fulfil_then_auto_release() {
        let mut ctx = setup();
        let id = open(&mut ctx);

        ctx.env.set_caller(ctx.seller);
        ctx.escrow.mark_fulfilled(id, [1u8; 32]);
        assert!(matches!(
            ctx.escrow.get_state(id),
            EscrowState::Fulfilled
        ));
        assert_eq!(ctx.escrow.evidence_count(id), 1);

        // Too early to auto-release.
        assert_eq!(
            ctx.escrow.try_claim_release(id).unwrap_err(),
            EscrowError::ReviewWindowOpen.into()
        );

        let seller_before = ctx.env.balance_of(&ctx.seller);
        ctx.env.advance_block_time(REVIEW_MS + 1);
        // Anyone can trigger the auto-release.
        ctx.escrow.claim_release(id);

        assert!(matches!(ctx.escrow.get_state(id), EscrowState::Released));
        assert_eq!(
            ctx.env.balance_of(&ctx.seller),
            seller_before + U512::from(AMOUNT)
        );
        // Happy path leaves the reputation ledger untouched (no dispute).
        assert_eq!(ctx.registry.get_score(ctx.seller).deals, 0);
    }

    #[test]
    fn only_seller_can_mark_fulfilled() {
        let mut ctx = setup();
        let id = open(&mut ctx);

        ctx.env.set_caller(ctx.buyer);
        assert_eq!(
            ctx.escrow.try_mark_fulfilled(id, [1u8; 32]).unwrap_err(),
            EscrowError::NotSeller.into()
        );
    }

    #[test]
    fn dispute_then_settle_refund() {
        let mut ctx = setup();
        let id = open(&mut ctx);

        // Buyer disputes directly from Pending.
        ctx.env.set_caller(ctx.buyer);
        ctx.escrow.raise_dispute(id);
        assert!(matches!(ctx.escrow.get_state(id), EscrowState::Disputed));

        // Both parties submit evidence.
        ctx.escrow.submit_evidence(id, [2u8; 32]);
        ctx.env.set_caller(ctx.seller);
        ctx.escrow.submit_evidence(id, [3u8; 32]);
        assert_eq!(ctx.escrow.evidence_count(id), 2);

        // Arbiter cannot settle while the evidence window is open.
        ctx.env.set_caller(ctx.arbiter);
        assert_eq!(
            ctx.escrow
                .try_settle(id, Verdict::Refund, 0, [7u8; 32])
                .unwrap_err(),
            EscrowError::EvidenceWindowOpen.into()
        );

        let buyer_before = ctx.env.balance_of(&ctx.buyer);
        ctx.env.advance_block_time(EVIDENCE_MS + 1);

        // Non-arbiter cannot settle.
        ctx.env.set_caller(ctx.buyer);
        assert_eq!(
            ctx.escrow
                .try_settle(id, Verdict::Refund, 0, [7u8; 32])
                .unwrap_err(),
            EscrowError::NotAuthorizedArbiter.into()
        );

        ctx.env.set_caller(ctx.arbiter);
        ctx.escrow.settle(id, Verdict::Refund, 0, [7u8; 32]);

        assert!(matches!(ctx.escrow.get_state(id), EscrowState::Refunded));
        assert_eq!(
            ctx.env.balance_of(&ctx.buyer),
            buyer_before + U512::from(AMOUNT)
        );

        // Reputation updated: buyer favoured, both disputed, arbiter active.
        let buyer_score = ctx.registry.get_score(ctx.buyer);
        assert_eq!(buyer_score.deals, 1);
        assert_eq!(buyer_score.positive, 1);
        assert_eq!(buyer_score.disputes, 1);
        assert_eq!(ctx.registry.get_score(ctx.seller).disputes, 1);
        assert_eq!(ctx.registry.get_score(ctx.arbiter).deals, 1);

        assert!(ctx.env.emitted_event(
            &ctx.escrow.address(),
            Settled {
                id,
                verdict: Verdict::Refund,
                split_bps: 0,
                rationale_hash: [7u8; 32],
                arbiter: ctx.arbiter,
            }
        ));
    }

    #[test]
    fn settle_split_divides_funds() {
        let mut ctx = setup();
        let id = open(&mut ctx);

        ctx.env.set_caller(ctx.seller);
        ctx.escrow.mark_fulfilled(id, [1u8; 32]);
        ctx.escrow.raise_dispute(id);
        ctx.env.advance_block_time(EVIDENCE_MS + 1);

        let buyer_before = ctx.env.balance_of(&ctx.buyer);
        let seller_before = ctx.env.balance_of(&ctx.seller);

        // 70% to seller, 30% to buyer.
        ctx.env.set_caller(ctx.arbiter);
        ctx.escrow.settle(id, Verdict::Split, 7000, [5u8; 32]);

        assert!(matches!(ctx.escrow.get_state(id), EscrowState::Split));
        let seller_cut = U512::from(AMOUNT) * U512::from(7000u32) / U512::from(10000u32);
        let buyer_cut = U512::from(AMOUNT) - seller_cut;
        assert_eq!(ctx.env.balance_of(&ctx.seller), seller_before + seller_cut);
        assert_eq!(ctx.env.balance_of(&ctx.buyer), buyer_before + buyer_cut);
    }

    #[test]
    fn settle_split_rejects_bad_bps() {
        let mut ctx = setup();
        let id = open(&mut ctx);

        ctx.env.set_caller(ctx.buyer);
        ctx.escrow.raise_dispute(id);
        ctx.env.advance_block_time(EVIDENCE_MS + 1);

        ctx.env.set_caller(ctx.arbiter);
        assert_eq!(
            ctx.escrow
                .try_settle(id, Verdict::Split, 10001, [5u8; 32])
                .unwrap_err(),
            EscrowError::BadSplit.into()
        );
    }

    #[test]
    fn timeout_refund_after_grace() {
        let mut ctx = setup();
        let id = open(&mut ctx);

        ctx.env.set_caller(ctx.buyer);
        ctx.escrow.raise_dispute(id);

        // Before the hard cap, the safety valve is closed.
        ctx.env.advance_block_time(EVIDENCE_MS + 1);
        assert_eq!(
            ctx.escrow.try_timeout_refund(id).unwrap_err(),
            EscrowError::EvidenceWindowOpen.into()
        );

        let buyer_before = ctx.env.balance_of(&ctx.buyer);
        ctx.env.advance_block_time(TIMEOUT_GRACE_MS);
        // Anyone can trigger it.
        ctx.env.set_caller(ctx.seller);
        ctx.escrow.timeout_refund(id);

        assert!(matches!(ctx.escrow.get_state(id), EscrowState::Refunded));
        assert_eq!(
            ctx.env.balance_of(&ctx.buyer),
            buyer_before + U512::from(AMOUNT)
        );
    }

    #[test]
    fn cannot_settle_undisputed_deal() {
        let mut ctx = setup();
        let id = open(&mut ctx);

        ctx.env.advance_block_time(EVIDENCE_MS + 1);
        ctx.env.set_caller(ctx.arbiter);
        assert_eq!(
            ctx.escrow
                .try_settle(id, Verdict::Release, 0, [0u8; 32])
                .unwrap_err(),
            EscrowError::NotDisputed.into()
        );
    }
}
