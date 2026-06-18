import type { HydratedDocument, Model } from "mongoose";

import { model, Schema } from "mongoose";

/** The EscrowVault / ReputationRegistry events Aegis indexes (spec §1.7, §2). */
export const CHAIN_EVENT_TYPES = [
  "DealOpened",
  "Fulfilled",
  "Disputed",
  "EvidenceSubmitted",
  "Settled",
  "SettlementRecorded",
  "Slashed",
] as const;
export type ChainEventType = (typeof CHAIN_EVENT_TYPES)[number];

/**
 * An observed on-chain event, persisted so the whole case history is
 * reconstructable from records (NFR-2 auditability).
 */
export type ChainEventDoc = {
  type: ChainEventType;
  dealId?: number;
  /** Deploy hash the event originated from. */
  txHash?: string;
  blockTime?: number;
  /** Raw decoded event fields. */
  data: Record<string, unknown>;
};

export type ChainEventDocument = HydratedDocument<ChainEventDoc>;

const chainEventSchema = new Schema<ChainEventDoc>(
  {
    type: { type: String, enum: CHAIN_EVENT_TYPES, required: true, index: true },
    dealId: { type: Number, index: true },
    txHash: { type: String },
    blockTime: { type: Number },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const ChainEventModel: Model<ChainEventDoc>
  = model<ChainEventDoc>("ChainEvent", chainEventSchema);
