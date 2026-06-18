import type { VerdictRuling } from "../../domain/verdict.schema.js";
import type { VerdictDoc, VerdictDocument } from "../../models/verdict.model.js";

import { VerdictModel } from "../../models/verdict.model.js";

/** Persists the arbiter's ruling and its settlement record (upsert per deal). */
export async function saveVerdict(input: {
  dealId: number;
  arbiter: string;
  ruling: VerdictRuling;
  rationaleHash: string;
  settleTxHash?: string;
}): Promise<VerdictDocument> {
  const { dealId, arbiter, ruling, rationaleHash, settleTxHash } = input;
  return VerdictModel.findOneAndUpdate(
    { dealId },
    {
      $set: {
        arbiter,
        outcome: ruling.outcome,
        splitBps: ruling.splitBps,
        rationale: ruling.rationale,
        rationaleHash,
        findings: ruling.findings,
        confidence: ruling.confidence,
        settleTxHash,
      },
      $setOnInsert: { dealId, appealed: false, overturned: false },
    },
    { upsert: true, new: true },
  );
}

export async function getVerdict(dealId: number): Promise<VerdictDoc | null> {
  return VerdictModel.findOne({ dealId }).lean<VerdictDoc>();
}

export async function markAppealed(dealId: number): Promise<void> {
  await VerdictModel.updateOne({ dealId }, { $set: { appealed: true } });
}

export async function markOverturned(dealId: number, reason: string): Promise<void> {
  await VerdictModel.updateOne({ dealId }, { $set: { overturned: true, overturnReason: reason } });
}
