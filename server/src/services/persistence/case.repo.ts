import type { CaseMessage } from "../../domain/case.schema.js";
import type { CaseDoc, CaseDocument } from "../../models/case.model.js";

import { CaseModel } from "../../models/case.model.js";

/**
 * Upserts a dispute case message (design §9.4) keyed by (deal, party); a party
 * re-submitting replaces its prior message.
 */
export async function saveCaseMessage(
  message: CaseMessage,
  signatureValid?: boolean,
): Promise<CaseDocument> {
  const doc = await CaseModel.findOneAndUpdate(
    { dealId: message.escrow_id, role: message.role },
    {
      $set: {
        claim: message.claim,
        evidence: message.evidence,
        requestedOutcome: message.requested_outcome,
        signature: message.signature,
        signatureValid,
        receivedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
  return doc;
}

export async function getCasesForDeal(dealId: number): Promise<CaseDoc[]> {
  return CaseModel.find({ dealId }).lean<CaseDoc[]>();
}

/** True once both buyer and seller have submitted their case messages. */
export async function bothCasesPresent(dealId: number): Promise<boolean> {
  const roles = await CaseModel.distinct("role", { dealId });
  return roles.includes("buyer") && roles.includes("seller");
}
