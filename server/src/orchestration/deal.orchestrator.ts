import type { CaseMessage } from "../domain/case.schema.js";
import type { EvidenceItem, PartyRole } from "../domain/evidence.schema.js";
import type { Mandate } from "../domain/mandate.schema.js";
import type { ChainActor } from "../services/casper/index.js";

import { MandateSchema } from "../domain/mandate.schema.js";
import { NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { computeTermsHash } from "../services/casper/hash.js";
import { getCasperService } from "../services/casper/index.js";
import {
  createDealRecord,
  getDealRecord,
  recordDealTx,
  saveCaseMessage,
  saveEvidenceItem,
  setDisputeRaisedBy,
  upsertDealFromChain,
} from "../services/persistence/index.js";

const log = logger.child({ component: "orchestrator" });

/**
 * Encapsulates the deal/dispute lifecycle across chain + persistence so the
 * agents, REST API and lifecycle worker share one consistent implementation.
 * The chain is the source of truth; every mutating step re-syncs the mirror.
 */

/** Opens an escrow for an agreed mandate (F1, FR-1). */
export async function openDeal(input: { mandate: Mandate }): Promise<{ dealId: number; txHash: string }> {
  const chain = getCasperService();
  // Normalise the binding parties to the deposit/seller identities so the
  // terms_hash the buyer commits matches what the arbiter later verifies.
  const mandate = MandateSchema.parse({
    ...input.mandate,
    buyer: chain.addressOf("buyer"),
    seller: chain.addressOf("seller"),
  });
  const termsHash = computeTermsHash(mandate);

  const { dealId, txHash } = await chain.openDeal({
    seller: mandate.seller,
    termsHash,
    amount: mandate.price,
  });

  const deal = await chain.getDeal(dealId);
  if (!deal)
    throw new NotFoundError(`Opened deal ${dealId} not found on chain`);
  await createDealRecord({ deal, mandate, openTxHash: txHash });
  log.info({ dealId, termsHash }, "Deal opened and persisted");
  return { dealId, txHash };
}

/** Seller marks the deliverable fulfilled with evidence (F3, FR-3). */
export async function fulfillDeal(input: { dealId: number; evidence: EvidenceItem }): Promise<string> {
  const chain = getCasperService();
  const { txHash } = await chain.markFulfilled(input.dealId, input.evidence.hash);
  await saveEvidenceItem({ dealId: input.dealId, role: "seller", item: input.evidence, txHash });
  await recordDealTx(input.dealId, "fulfill", txHash);
  await syncDeal(input.dealId);
  return txHash;
}

/** A party raises a dispute before release (FR-5). */
export async function raiseDispute(input: { dealId: number; role: PartyRole }): Promise<string> {
  const chain = getCasperService();
  const { txHash } = await chain.raiseDispute(input.role, input.dealId);
  await setDisputeRaisedBy(input.dealId, input.role);
  await recordDealTx(input.dealId, "dispute", txHash);
  await syncDeal(input.dealId);
  log.info({ dealId: input.dealId, by: input.role }, "Dispute raised");
  return txHash;
}

/** A party appends an evidence hash during the dispute window (FR-6). */
export async function submitEvidence(input: {
  dealId: number;
  role: PartyRole;
  item: EvidenceItem;
}): Promise<string> {
  const chain = getCasperService();
  const { txHash } = await chain.submitEvidence(input.role, input.dealId, input.item.hash);
  await saveEvidenceItem({ dealId: input.dealId, role: input.role, item: input.item, txHash });
  await syncDeal(input.dealId);
  return txHash;
}

/** Records a dispute case message received over A2A (evidence, not truth). */
export async function submitCaseMessage(message: CaseMessage): Promise<void> {
  await saveCaseMessage(message);
  log.info({ dealId: message.escrow_id, role: message.role }, "Case message stored");
}

/** Happy-path auto-release after the review window (FR-4). */
export async function claimRelease(dealId: number): Promise<string> {
  const chain = getCasperService();
  const { txHash } = await chain.claimRelease(dealId);
  await recordDealTx(dealId, "release", txHash);
  await syncDeal(dealId);
  return txHash;
}

/** Safety-default refund when no arbiter ruled in time (NFR-6). */
export async function timeoutRefund(dealId: number): Promise<string> {
  const chain = getCasperService();
  const { txHash } = await chain.timeoutRefund(dealId);
  await recordDealTx(dealId, "timeoutRefund", txHash);
  await syncDeal(dealId);
  log.warn({ dealId }, "Deal refunded via safety timeout");
  return txHash;
}

/** Re-reads authoritative chain state and updates the off-chain mirror. */
export async function syncDeal(dealId: number): Promise<void> {
  const chain = getCasperService();
  const deal = await chain.getDeal(dealId);
  if (!deal) {
    log.warn({ dealId }, "syncDeal: deal not found on chain");
    return;
  }
  await upsertDealFromChain(deal);
}

/** Convenience accessor that fails clearly when a deal is unknown. */
export async function requireDealRecord(dealId: number, actor?: ChainActor) {
  const record = await getDealRecord(dealId);
  if (!record)
    throw new NotFoundError(`Deal ${dealId} not found${actor ? ` (requested by ${actor})` : ""}`);
  return record;
}
