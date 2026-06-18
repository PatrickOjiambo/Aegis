import type { HydratedDocument, Model } from "mongoose";

import { model, Schema } from "mongoose";

import type { EvidenceType, PartyRole } from "../domain/evidence.schema.js";

import { EvidenceTypeSchema } from "../domain/evidence.schema.js";

/**
 * A single piece of evidence whose hash was submitted on-chain
 * (`submit_evidence` / `mark_fulfilled`). Mirrors the on-chain evidence list so
 * the arbiter can correlate the off-chain payload with the on-chain digest it
 * verifies against (NFR-5).
 */
export type EvidenceDoc = {
  dealId: number;
  role: PartyRole;
  type: EvidenceType;
  hash: string;
  ref?: string;
  value?: string | number | boolean;
  description?: string;
  /** Deploy hash of the on-chain submit_evidence/mark_fulfilled call. */
  txHash?: string;
};

export type EvidenceDocument = HydratedDocument<EvidenceDoc>;

const evidenceSchema = new Schema<EvidenceDoc>(
  {
    dealId: { type: Number, required: true, index: true },
    role: { type: String, enum: ["buyer", "seller"], required: true },
    type: { type: String, enum: EvidenceTypeSchema.options, required: true },
    hash: { type: String, required: true },
    ref: { type: String },
    value: { type: Schema.Types.Mixed },
    description: { type: String },
    txHash: { type: String },
  },
  { timestamps: true },
);

evidenceSchema.index({ dealId: 1, hash: 1 }, { unique: true });

export const EvidenceModel: Model<EvidenceDoc> = model<EvidenceDoc>("Evidence", evidenceSchema);
