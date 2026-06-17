import type { HydratedDocument, Model } from "mongoose";

import { model, Schema } from "mongoose";

import type { RequestedOutcome } from "../domain/case.schema.js";
import type { EvidenceItem, PartyRole } from "../domain/evidence.schema.js";

import { EvidenceTypeSchema } from "../domain/evidence.schema.js";

/** Embedded evidence item subdocument (no own _id). */
export const evidenceItemSubSchema = new Schema<EvidenceItem>(
  {
    type: { type: String, enum: EvidenceTypeSchema.options, required: true },
    value: { type: Schema.Types.Mixed },
    ref: { type: String },
    hash: { type: String, required: true },
    description: { type: String },
  },
  { _id: false },
);

/**
 * A dispute case message received from a party over A2A (design §9.4). Stored
 * verbatim as *evidence* — never trusted as fact until cross-checked on-chain.
 */
export type CaseDoc = {
  dealId: number;
  role: PartyRole;
  claim: string;
  evidence: EvidenceItem[];
  requestedOutcome: RequestedOutcome;
  signature?: string;
  /** Whether the message signature verified against the party's on-chain key. */
  signatureValid?: boolean;
  receivedAt: Date;
};

export type CaseDocument = HydratedDocument<CaseDoc>;

const caseSchema = new Schema<CaseDoc>(
  {
    dealId: { type: Number, required: true, index: true },
    role: { type: String, enum: ["buyer", "seller"], required: true },
    claim: { type: String, required: true },
    evidence: { type: [evidenceItemSubSchema], default: [] },
    requestedOutcome: { type: String, enum: ["release", "refund", "split"], required: true },
    signature: { type: String },
    signatureValid: { type: Boolean },
    receivedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

// One case message per (deal, party); a re-submission upserts.
caseSchema.index({ dealId: 1, role: 1 }, { unique: true });

export const CaseModel: Model<CaseDoc> = model<CaseDoc>("Case", caseSchema);
