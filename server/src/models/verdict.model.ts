import type { HydratedDocument, Model } from "mongoose";

import { model, Schema } from "mongoose";

import type { Verdict } from "../domain/escrow.schema.js";
import type { CriterionFinding } from "../domain/verdict.schema.js";

import { VERDICTS } from "../domain/escrow.schema.js";

/** Embedded per-criterion finding subdocument (no own _id). */
const criterionFindingSubSchema = new Schema<CriterionFinding>(
  {
    criterionId: { type: String, required: true },
    met: { type: Boolean, required: true },
    reasoning: { type: String, required: true },
    evidenceHashes: { type: [String], default: [] },
  },
  { _id: false },
);

/**
 * A rendered arbiter ruling and its on-chain settlement record. The `rationale`
 * is kept in full off-chain (NFR-10); only its `rationaleHash` is on-chain.
 */
export type VerdictDoc = {
  dealId: number;
  arbiter: string;
  outcome: Verdict;
  splitBps: number;
  rationale: string;
  rationaleHash: string;
  findings: CriterionFinding[];
  confidence?: number;
  /** Deploy hash of the `settle` transaction. */
  settleTxHash?: string;
  /** Appeal lifecycle (minimal in MVP). */
  appealed: boolean;
  overturned: boolean;
  overturnReason?: string;
};

export type VerdictDocument = HydratedDocument<VerdictDoc>;

const verdictSchema = new Schema<VerdictDoc>(
  {
    dealId: { type: Number, required: true, unique: true, index: true },
    arbiter: { type: String, required: true, index: true },
    outcome: { type: String, enum: VERDICTS, required: true },
    splitBps: { type: Number, default: 0 },
    rationale: { type: String, required: true },
    rationaleHash: { type: String, required: true },
    findings: { type: [criterionFindingSubSchema], default: [] },
    confidence: { type: Number },
    settleTxHash: { type: String },
    appealed: { type: Boolean, default: false },
    overturned: { type: Boolean, default: false },
    overturnReason: { type: String },
  },
  { timestamps: true },
);

export const VerdictModel: Model<VerdictDoc> = model<VerdictDoc>("Verdict", verdictSchema);
