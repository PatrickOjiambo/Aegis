import type { EvidenceItem, PartyRole } from "../../domain/evidence.schema.js";
import type { EvidenceDoc } from "../../models/evidence.model.js";

import { EvidenceModel } from "../../models/evidence.model.js";

/** Persists one evidence item whose hash was submitted on-chain (idempotent). */
export async function saveEvidenceItem(input: {
  dealId: number;
  role: PartyRole;
  item: EvidenceItem;
  txHash?: string;
}): Promise<void> {
  const { dealId, role, item, txHash } = input;
  await EvidenceModel.updateOne(
    { dealId, hash: item.hash },
    {
      $set: {
        role,
        type: item.type,
        ref: item.ref,
        value: item.value,
        description: item.description,
        txHash,
      },
      $setOnInsert: { dealId, hash: item.hash },
    },
    { upsert: true },
  );
}

export async function getEvidenceForDeal(dealId: number): Promise<EvidenceDoc[]> {
  return EvidenceModel.find({ dealId }).lean<EvidenceDoc[]>();
}

/** The set of evidence content hashes recorded for a deal (chain-truth set). */
export async function getEvidenceHashes(dealId: number): Promise<Set<string>> {
  const docs = await EvidenceModel.find({ dealId }).select("hash").lean<{ hash: string }[]>();
  return new Set(docs.map(d => d.hash));
}
