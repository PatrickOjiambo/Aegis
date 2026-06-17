import type { Deal } from "../../domain/escrow.schema.js";
import type { PartyRole } from "../../domain/evidence.schema.js";
import type { Mandate } from "../../domain/mandate.schema.js";
import type { DealDoc, DealDocument, DealTxHashes } from "../../models/deal.model.js";

import { DealModel } from "../../models/deal.model.js";

/** Maps an on-chain {@link Deal} onto the persisted mirror fields. */
function chainDealFields(deal: Deal): Partial<DealDoc> {
  return {
    buyer: deal.buyer,
    seller: deal.seller,
    amount: deal.amount,
    termsHash: deal.termsHash,
    state: deal.state,
    createdAtChain: deal.createdAt,
    reviewDeadline: deal.reviewDeadline,
    evidenceDeadline: deal.evidenceDeadline,
    settledAt: deal.settledAt,
    appealDeadline: deal.appealDeadline,
    arbiter: deal.arbiter,
  };
}

/** Persists a newly opened deal (chain state + off-chain mandate + open tx). */
export async function createDealRecord(input: {
  deal: Deal;
  mandate: Mandate;
  openTxHash: string;
}): Promise<DealDocument> {
  return DealModel.create({
    dealId: input.deal.id,
    ...chainDealFields(input.deal),
    mandate: input.mandate,
    arbiterDispatched: false,
    tx: { open: input.openTxHash },
  });
}

/** Upserts the mirror from authoritative chain state (used by the indexer/sync). */
export async function upsertDealFromChain(deal: Deal, mandate?: Mandate): Promise<void> {
  await DealModel.updateOne(
    { dealId: deal.id },
    {
      $set: { ...chainDealFields(deal), ...(mandate ? { mandate } : {}) },
      $setOnInsert: { dealId: deal.id, arbiterDispatched: false },
    },
    { upsert: true },
  );
}

export async function getDealRecord(dealId: number): Promise<DealDocument | null> {
  return DealModel.findOne({ dealId });
}

export async function recordDealTx(dealId: number, key: keyof DealTxHashes, txHash: string): Promise<void> {
  await DealModel.updateOne({ dealId }, { $set: { [`tx.${key}`]: txHash } });
}

export async function setDisputeRaisedBy(dealId: number, role: PartyRole): Promise<void> {
  await DealModel.updateOne({ dealId }, { $set: { disputeRaisedBy: role } });
}

export async function markArbiterDispatched(dealId: number): Promise<boolean> {
  // Atomic guard so the worker dispatches a dispute to the arbiter exactly once.
  const res = await DealModel.updateOne(
    { dealId, arbiterDispatched: false },
    { $set: { arbiterDispatched: true } },
  );
  return res.modifiedCount === 1;
}

/** Fulfilled deals whose review window has elapsed without dispute (auto-release). */
export async function findDealsReadyForRelease(now: number): Promise<DealDocument[]> {
  return DealModel.find({ state: "Fulfilled", reviewDeadline: { $lt: now } });
}

/** Disputed deals past their evidence deadline not yet dispatched to the arbiter. */
export async function findDealsAwaitingArbiter(now: number): Promise<DealDocument[]> {
  return DealModel.find({
    state: "Disputed",
    arbiterDispatched: false,
    evidenceDeadline: { $gt: 0, $lte: now },
  });
}

/** Disputed deals past the hard safety cap (liveness refund). */
export async function findDealsForSafetyRefund(now: number, graceMs: number): Promise<DealDocument[]> {
  return DealModel.find({
    state: "Disputed",
    evidenceDeadline: { $gt: 0 },
    $expr: { $lt: [{ $add: ["$evidenceDeadline", graceMs] }, now] },
  });
}
