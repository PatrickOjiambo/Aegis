//! # ReputationRegistry — Aegis Contract B
//!
//! A standalone, publicly-readable trust ledger. It is intentionally separate
//! from [`crate::escrow::EscrowVault`] because a participant's reputation
//! outlives any single deal and may be consumed by other agents / dApps.
//!
//! - **Writeable** only by registered writers (the EscrowVault).
//! - **Readable** by anyone via [`ReputationRegistry::get_score`].
//!
//! Scoring is deliberately trivial and transparent for the MVP (plain counts,
//! not weighted formulas) — see the NFR on transparency in the design doc.

use crate::escrow::Verdict;
use odra::prelude::*;

/// A participant's on-chain trust record. All fields are simple counters so the
/// scoring is fully transparent and auditable.
#[odra::odra_type]
pub struct Score {
    /// Total settlements this address was involved in.
    pub deals: u32,
    /// Outcomes counted favourable to this party.
    pub positive: u32,
    /// Times this party was in a disputed deal.
    pub disputes: u32,
    /// (Arbiters) verdicts later overturned — always 0 in the MVP.
    pub overturned: u32,
}

/// Emitted whenever a writer records a settlement.
#[odra::event]
pub struct SettlementRecorded {
    pub deal_id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub arbiter: Address,
    pub verdict: Verdict,
}

/// Emitted when an arbiter's verdict is overturned (appeal flow, wired later).
#[odra::event]
pub struct Slashed {
    pub arbiter: Address,
}

/// Errors raised by [`ReputationRegistry`].
#[odra::odra_error]
pub enum ReputationError {
    /// Caller is not a registered writer.
    NotWriter = 201,
    /// Caller is not the contract owner.
    NotOwner = 202,
}

#[odra::module(
    errors = ReputationError,
    events = [SettlementRecorded, Slashed]
)]
pub struct ReputationRegistry {
    /// address -> trust record.
    scores: Mapping<Address, Score>,
    /// contracts allowed to write (e.g. the EscrowVault).
    writers: Mapping<Address, bool>,
    /// can add/remove writers.
    owner: Var<Address>,
}

#[odra::module]
impl ReputationRegistry {
    /// Initializes the registry. The deployer becomes the `owner`.
    pub fn init(&mut self) {
        self.owner.set(self.env().caller());
    }

    // --------------------------------------------------------------------
    // Admin (owner only)
    // --------------------------------------------------------------------

    /// Registers `writer` as allowed to record settlements. Owner only.
    pub fn add_writer(&mut self, writer: Address) {
        self.assert_owner();
        self.writers.set(&writer, true);
    }

    /// Revokes a writer. Owner only.
    pub fn remove_writer(&mut self, writer: Address) {
        self.assert_owner();
        self.writers.set(&writer, false);
    }

    // --------------------------------------------------------------------
    // Writer entry points
    // --------------------------------------------------------------------

    /// Records the outcome of a settled (disputed) deal.
    ///
    /// Bumps `deals` and `disputes` for both buyer and seller, credits
    /// `positive` to the party favoured by the verdict, and records arbiter
    /// activity. Writer only.
    pub fn record_settlement(
        &mut self,
        deal_id: u64,
        buyer: Address,
        seller: Address,
        arbiter: Address,
        verdict: Verdict,
    ) {
        self.assert_writer();

        let mut buyer_score = self.score_of(&buyer);
        let mut seller_score = self.score_of(&seller);

        buyer_score.deals += 1;
        buyer_score.disputes += 1;
        seller_score.deals += 1;
        seller_score.disputes += 1;

        match verdict {
            Verdict::Release => seller_score.positive += 1,
            Verdict::Refund => buyer_score.positive += 1,
            // A split is a compromise: neither party is "favoured".
            Verdict::Split => {}
        }

        // Persist buyer & seller first so a colliding arbiter address (==buyer
        // or ==seller) picks up the freshly-written value below.
        self.scores.set(&buyer, buyer_score);
        self.scores.set(&seller, seller_score);

        let mut arbiter_score = self.score_of(&arbiter);
        arbiter_score.deals += 1;
        self.scores.set(&arbiter, arbiter_score);

        self.env().emit_event(SettlementRecorded {
            deal_id,
            buyer,
            seller,
            arbiter,
            verdict,
        });
    }

    /// Records that an arbiter's verdict was overturned on appeal. Writer only.
    ///
    /// Stubbed for the MVP — the appeal flow (ArbiterStake) calls this later.
    pub fn record_overturn(&mut self, arbiter: Address) {
        self.assert_writer();
        let mut score = self.score_of(&arbiter);
        score.overturned += 1;
        self.scores.set(&arbiter, score);
        self.env().emit_event(Slashed { arbiter });
    }

    // --------------------------------------------------------------------
    // Read-only
    // --------------------------------------------------------------------

    /// Public read of an address's trust record. Returns an all-zero [`Score`]
    /// for addresses that have never been recorded.
    pub fn get_score(&self, addr: Address) -> Score {
        self.score_of(&addr)
    }

    /// Returns whether `addr` is a registered writer.
    pub fn is_writer(&self, addr: Address) -> bool {
        self.writers.get(&addr).unwrap_or(false)
    }

    // --------------------------------------------------------------------
    // Internal helpers (not exposed as entry points)
    // --------------------------------------------------------------------

    fn score_of(&self, addr: &Address) -> Score {
        self.scores.get(addr).unwrap_or(Score {
            deals: 0,
            positive: 0,
            disputes: 0,
            overturned: 0,
        })
    }

    fn assert_owner(&self) {
        if self.env().caller() != self.owner.get().unwrap() {
            self.env().revert(ReputationError::NotOwner);
        }
    }

    fn assert_writer(&self) {
        if !self.writers.get(&self.env().caller()).unwrap_or(false) {
            self.env().revert(ReputationError::NotWriter);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::escrow::Verdict;
    use odra::host::{Deployer, NoArgs};

    fn setup() -> (odra::host::HostEnv, ReputationRegistryHostRef) {
        let env = odra_test::env();
        let registry = ReputationRegistry::deploy(&env, NoArgs);
        (env, registry)
    }

    #[test]
    fn owner_can_manage_writers() {
        let (env, mut registry) = setup();
        let writer = env.get_account(1);

        assert!(!registry.is_writer(writer));
        registry.add_writer(writer);
        assert!(registry.is_writer(writer));
        registry.remove_writer(writer);
        assert!(!registry.is_writer(writer));
    }

    #[test]
    fn non_owner_cannot_add_writer() {
        let (env, mut registry) = setup();
        let stranger = env.get_account(1);
        let writer = env.get_account(2);

        env.set_caller(stranger);
        assert_eq!(
            registry.try_add_writer(writer).unwrap_err(),
            ReputationError::NotOwner.into()
        );
    }

    #[test]
    fn non_writer_cannot_record() {
        let (env, mut registry) = setup();
        let stranger = env.get_account(1);
        let buyer = env.get_account(2);
        let seller = env.get_account(3);
        let arbiter = env.get_account(4);

        env.set_caller(stranger);
        assert_eq!(
            registry
                .try_record_settlement(1, buyer, seller, arbiter, Verdict::Release)
                .unwrap_err(),
            ReputationError::NotWriter.into()
        );
    }

    #[test]
    fn writer_records_release_credits_seller() {
        let (env, mut registry) = setup();
        let writer = env.get_account(1);
        let buyer = env.get_account(2);
        let seller = env.get_account(3);
        let arbiter = env.get_account(4);

        registry.add_writer(writer);
        env.set_caller(writer);
        registry.record_settlement(7, buyer, seller, arbiter, Verdict::Release);

        let seller_score = registry.get_score(seller);
        assert_eq!(seller_score.deals, 1);
        assert_eq!(seller_score.positive, 1);
        assert_eq!(seller_score.disputes, 1);

        let buyer_score = registry.get_score(buyer);
        assert_eq!(buyer_score.deals, 1);
        assert_eq!(buyer_score.positive, 0);
        assert_eq!(buyer_score.disputes, 1);

        let arbiter_score = registry.get_score(arbiter);
        assert_eq!(arbiter_score.deals, 1);

        assert!(env.emitted_event(
            &registry.address(),
            SettlementRecorded {
                deal_id: 7,
                buyer,
                seller,
                arbiter,
                verdict: Verdict::Release,
            }
        ));
    }

    #[test]
    fn refund_credits_buyer_and_split_credits_neither() {
        let (env, mut registry) = setup();
        let writer = env.get_account(1);
        let buyer = env.get_account(2);
        let seller = env.get_account(3);
        let arbiter = env.get_account(4);

        registry.add_writer(writer);
        env.set_caller(writer);

        registry.record_settlement(1, buyer, seller, arbiter, Verdict::Refund);
        assert_eq!(registry.get_score(buyer).positive, 1);
        assert_eq!(registry.get_score(seller).positive, 0);

        registry.record_settlement(2, buyer, seller, arbiter, Verdict::Split);
        // Split favours nobody: positive counts unchanged, deal counts grow.
        assert_eq!(registry.get_score(buyer).positive, 1);
        assert_eq!(registry.get_score(seller).positive, 0);
        assert_eq!(registry.get_score(buyer).deals, 2);
        assert_eq!(registry.get_score(seller).deals, 2);
    }

    #[test]
    fn record_overturn_bumps_arbiter() {
        let (env, mut registry) = setup();
        let writer = env.get_account(1);
        let arbiter = env.get_account(4);

        registry.add_writer(writer);
        env.set_caller(writer);
        registry.record_overturn(arbiter);

        assert_eq!(registry.get_score(arbiter).overturned, 1);
        assert!(env.emitted_event(&registry.address(), Slashed { arbiter }));
    }
}
