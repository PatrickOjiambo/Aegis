import type { HydratedDocument, Model } from "mongoose";

import { model, Schema } from "mongoose";

import type { EscrowState } from "../domain/escrow.schema.js";
import type { PartyRole } from "../domain/evidence.schema.js";
import type { Mandate } from "../domain/mandate.schema.js";

import { ESCROW_STATES } from "../domain/escrow.schema.js";

/** Deploy hashes for each on-chain action taken against a deal (audit trail). */
export type DealTxHashes = {
  open?: string;
  fulfill?: string;
  dispute?: string;
  settle?: string;
  timeoutRefund?: string;
  release?: string;
};

/**
 * Off-chain mirror of an on-chain escrow Deal plus the artifacts the chain does
 * not hold (the full Mandate, deploy hashes, lifecycle bookkeeping). The chain
 * is the source of truth for money/state; this document exists for queryability
 * and audit (NFR-2).
 */
export type DealDoc = {
  dealId: number;
  buyer: string;
  seller: string;
  amount: string;
  termsHash: string;
  state: EscrowState;
  /** On-chain `created_at` (unix ms). */
  createdAtChain: number;
  reviewDeadline: number;
  evidenceDeadline: number;
  settledAt: number;
  appealDeadline: number;
  arbiter: string | null;
  /** The full off-chain agreed terms whose digest is `termsHash`. */
  mandate: Mandate;
  /** Which party raised the dispute, if any. */
  disputeRaisedBy?: PartyRole;
  /** Whether the lifecycle worker has dispatched this dispute to the arbiter. */
  arbiterDispatched: boolean;
  tx: DealTxHashes;
};

export type DealDocument = HydratedDocument<DealDoc>;

const dealSchema = new Schema<DealDoc>(
  {
    dealId: { type: Number, required: true, unique: true, index: true },
    buyer: { type: String, required: true, index: true },
    seller: { type: String, required: true, index: true },
    amount: { type: String, required: true },
    termsHash: { type: String, required: true },
    state: { type: String, enum: ESCROW_STATES, required: true, index: true },
    createdAtChain: { type: Number, required: true },
    reviewDeadline: { type: Number, required: true },
    evidenceDeadline: { type: Number, default: 0 },
    settledAt: { type: Number, default: 0 },
    appealDeadline: { type: Number, default: 0 },
    arbiter: { type: String, default: null },
    mandate: { type: Schema.Types.Mixed, required: true },
    disputeRaisedBy: { type: String, enum: ["buyer", "seller"] },
    arbiterDispatched: { type: Boolean, default: false },
    tx: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Worker query: find disputed deals past their evidence deadline awaiting ruling.
dealSchema.index({ state: 1, evidenceDeadline: 1 });

export const DealModel: Model<DealDoc>
  = model<DealDoc>("Deal", dealSchema);
