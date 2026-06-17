import type { Hex32 } from "../../domain/common.js";
import type { Deal, OpenDealParams, Settlement } from "../../domain/escrow.schema.js";
import type { Score } from "../../domain/reputation.schema.js";

/** Which loaded signing key performs a write. */
export type ChainActor = "buyer" | "seller" | "arbiter";

/** Result of a state-changing on-chain call. */
export type TxResult = {
  /** Deploy / transaction hash, hex. */
  txHash: string;
};

export type OpenDealResult = {
  /** The id assigned to the newly opened deal. */
  dealId: number;
} & TxResult;

/**
 * The boundary between Aegis and the Casper chain. Both the live
 * (`RealCasperService`) and deterministic in-memory (`MockCasperService`)
 * implementations satisfy this, so the entire system — including the full
 * dispute loop — runs and is tested without a node (CHAIN_MODE=mock).
 *
 * Reads return *truth* (design §9.2); writes move money only via `settle`
 * (or the safe-default `timeoutRefund`).
 */
export type ICasperService = {
  /** Chain mode this instance implements. */
  readonly mode: "real" | "mock";

  // ---- Identity ----
  /** The on-chain address (account hash, `account-hash-…`) of a loaded actor. */
  addressOf: (actor: ChainActor) => string;

  // ---- Reads (authoritative state) ----
  getDeal: (dealId: number) => Promise<Deal | null>;
  getScore: (address: string) => Promise<Score>;

  // ---- Writes ----
  /** Buyer deposits payment into a new escrow (x402 → proxy → open_deal). */
  openDeal: (params: OpenDealParams) => Promise<OpenDealResult>;
  /** Seller marks the deliverable fulfilled with an evidence hash. */
  markFulfilled: (dealId: number, evidenceHash: Hex32) => Promise<TxResult>;
  /** Buyer or seller raises a dispute before release. */
  raiseDispute: (actor: ChainActor, dealId: number) => Promise<TxResult>;
  /** A party appends an evidence hash during the dispute window. */
  submitEvidence: (actor: ChainActor, dealId: number, evidenceHash: Hex32) => Promise<TxResult>;
  /** Happy-path auto-release after the review window with no dispute. */
  claimRelease: (dealId: number) => Promise<TxResult>;
  /** The arbiter executes the verdict — the only path that moves disputed funds. */
  settle: (settlement: Settlement) => Promise<TxResult>;
  /** Safety valve: refund the buyer if no arbiter ruled before the hard cap. */
  timeoutRefund: (dealId: number) => Promise<TxResult>;
  /** Records an overturned verdict against an arbiter (appeal flow). */
  recordOverturn: (arbiterAddress: string) => Promise<TxResult>;
};
