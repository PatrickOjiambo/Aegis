import type { Hex32 } from "../../domain/common.js";
import type { Deal, OpenDealParams, Settlement, Verdict } from "../../domain/escrow.schema.js";
import type { Score } from "../../domain/reputation.schema.js";
import type { ChainActor, ICasperService, OpenDealResult, TxResult } from "./types.js";

import { BPS_DENOMINATOR } from "../../config/constants.js";
import { isTerminal } from "../../domain/escrow.schema.js";
import { ZERO_SCORE } from "../../domain/reputation.schema.js";
import { env } from "../../env.js";
import { ConflictError, NotFoundError, PreconditionError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { hashString } from "./hash.js";

const log = logger.child({ component: "casper:mock" });

/**
 * A deterministic, in-memory re-implementation of the EscrowVault +
 * ReputationRegistry state machines (`aegis-contracts/contracts_spec.md`).
 *
 * It enforces exactly the same preconditions the Odra contracts do, so the full
 * Aegis loop — open → fulfil → dispute → evidence → settle → reputation — runs
 * and is asserted without a Casper node. Time is supplied by an injectable
 * clock so tests can drive deadlines deterministically.
 */
export class MockCasperService implements ICasperService {
  readonly mode = "mock" as const;

  private readonly deals = new Map<number, Deal>();
  private readonly evidence = new Map<number, Hex32[]>();
  private readonly scores = new Map<string, Score>();
  private readonly addresses: Record<ChainActor, string>;
  private nextId = 0;
  private txCounter = 0;

  constructor(private readonly now: () => number = () => Date.now()) {
    this.addresses = {
      buyer: mockAddress("buyer"),
      seller: mockAddress("seller"),
      arbiter: mockAddress("arbiter"),
    };
  }

  addressOf(actor: ChainActor): string {
    return this.addresses[actor];
  }

  async getDeal(dealId: number): Promise<Deal | null> {
    const deal = this.deals.get(dealId);
    return deal ? structuredClone(deal) : null;
  }

  async getScore(address: string): Promise<Score> {
    return { ...(this.scores.get(address) ?? ZERO_SCORE) };
  }

  /** All evidence hashes submitted for a deal (mock-only convenience). */
  getEvidence(dealId: number): Hex32[] {
    return [...(this.evidence.get(dealId) ?? [])];
  }

  async openDeal(params: OpenDealParams): Promise<OpenDealResult> {
    if (params.amount === "0")
      throw new PreconditionError("ZeroAmount: open_deal requires attached value");
    const id = this.nextId++;
    const now = this.now();
    const deal: Deal = {
      id,
      buyer: this.addresses.buyer,
      seller: params.seller,
      amount: params.amount,
      termsHash: params.termsHash,
      state: "Pending",
      createdAt: now,
      reviewDeadline: now + env.REVIEW_WINDOW_MS,
      evidenceDeadline: 0,
      settledAt: 0,
      appealDeadline: 0,
      arbiter: null,
    };
    this.deals.set(id, deal);
    this.evidence.set(id, []);
    log.info({ dealId: id, amount: params.amount }, "DealOpened");
    return { dealId: id, txHash: this.tx("open", id) };
  }

  async markFulfilled(dealId: number, evidenceHash: Hex32): Promise<TxResult> {
    const deal = this.require(dealId);
    this.requireState(deal, "Pending", "mark_fulfilled");
    deal.state = "Fulfilled";
    this.evidence.get(dealId)!.push(evidenceHash);
    log.info({ dealId }, "Fulfilled");
    return { txHash: this.tx("fulfill", dealId) };
  }

  async raiseDispute(actor: ChainActor, dealId: number): Promise<TxResult> {
    const deal = this.require(dealId);
    if (deal.state !== "Pending" && deal.state !== "Fulfilled")
      throw new PreconditionError(`WrongState: cannot dispute a ${deal.state} deal`);
    this.requireParty(deal, actor);
    deal.state = "Disputed";
    deal.evidenceDeadline = this.now() + env.EVIDENCE_WINDOW_MS;
    log.info({ dealId, by: actor }, "Disputed");
    return { txHash: this.tx("dispute", dealId) };
  }

  async submitEvidence(actor: ChainActor, dealId: number, evidenceHash: Hex32): Promise<TxResult> {
    const deal = this.require(dealId);
    this.requireState(deal, "Disputed", "submit_evidence");
    this.requireParty(deal, actor);
    if (this.now() >= deal.evidenceDeadline)
      throw new PreconditionError("EvidenceWindowClosed");
    this.evidence.get(dealId)!.push(evidenceHash);
    log.info({ dealId, by: actor }, "EvidenceSubmitted");
    return { txHash: this.tx("evidence", dealId) };
  }

  async claimRelease(dealId: number): Promise<TxResult> {
    const deal = this.require(dealId);
    this.requireState(deal, "Fulfilled", "claim_release");
    if (this.now() <= deal.reviewDeadline)
      throw new PreconditionError("ReviewWindowOpen");
    deal.state = "Released";
    deal.settledAt = this.now();
    this.recordSettlement(deal, "Release");
    log.info({ dealId }, "Settled(Release, auto)");
    return { txHash: this.tx("release", dealId) };
  }

  async settle(settlement: Settlement): Promise<TxResult> {
    const deal = this.require(settlement.dealId);
    this.requireState(deal, "Disputed", "settle");
    if (this.now() < deal.evidenceDeadline)
      throw new PreconditionError("EvidenceWindowOpen: cannot settle before evidence deadline");
    if (settlement.verdict === "Split" && (settlement.splitBps <= 0 || settlement.splitBps >= BPS_DENOMINATOR))
      throw new PreconditionError("BadSplit");

    switch (settlement.verdict) {
      case "Release":
        deal.state = "Released";
        break;
      case "Refund":
        deal.state = "Refunded";
        break;
      case "Split":
        deal.state = "Split";
        break;
    }
    deal.arbiter = this.addresses.arbiter;
    deal.settledAt = this.now();
    this.recordSettlement(deal, settlement.verdict);
    log.info({ dealId: deal.id, verdict: settlement.verdict, splitBps: settlement.splitBps }, "Settled");
    return { txHash: this.tx("settle", deal.id) };
  }

  async timeoutRefund(dealId: number): Promise<TxResult> {
    const deal = this.require(dealId);
    this.requireState(deal, "Disputed", "timeout_refund");
    const hardCap = deal.evidenceDeadline + env.SAFETY_GRACE_MS;
    if (this.now() <= hardCap)
      throw new PreconditionError("Safety timeout not yet reached");
    deal.state = "Refunded";
    deal.settledAt = this.now();
    this.recordSettlement(deal, "Refund");
    log.warn({ dealId }, "Settled(Refund, safety timeout)");
    return { txHash: this.tx("timeoutRefund", dealId) };
  }

  async recordOverturn(arbiterAddress: string): Promise<TxResult> {
    const score = this.scores.get(arbiterAddress) ?? { ...ZERO_SCORE };
    score.overturned += 1;
    this.scores.set(arbiterAddress, score);
    log.warn({ arbiter: arbiterAddress }, "Slashed (overturn recorded)");
    return { txHash: this.tx("overturn", 0) };
  }

  // ---- internals ----
  private require(dealId: number): Deal {
    const deal = this.deals.get(dealId);
    if (!deal)
      throw new NotFoundError(`DealNotFound: ${dealId}`);
    return deal;
  }

  private requireState(deal: Deal, expected: Deal["state"], action: string): void {
    if (isTerminal(deal.state))
      throw new ConflictError(`Deal ${deal.id} already settled (${deal.state})`);
    if (deal.state !== expected)
      throw new PreconditionError(`WrongState: ${action} requires ${expected}, deal is ${deal.state}`);
  }

  private requireParty(deal: Deal, actor: ChainActor): void {
    const addr = this.addresses[actor];
    if (addr !== deal.buyer && addr !== deal.seller)
      throw new PreconditionError("NotParty");
  }

  private recordSettlement(deal: Deal, verdict: Verdict): void {
    this.bump(deal.buyer, s => s.deals++);
    this.bump(deal.seller, s => s.deals++);
    if (deal.arbiter)
      this.bump(deal.arbiter, s => s.deals++);
    // Favoured party gets a positive mark (Split favours neither outright).
    if (verdict === "Release")
      this.bump(deal.seller, s => s.positive++);
    else if (verdict === "Refund")
      this.bump(deal.buyer, s => s.positive++);
    // Disputed deals (everything but the happy-path auto-release) mark disputes.
    if (deal.evidenceDeadline > 0) {
      this.bump(deal.buyer, s => s.disputes++);
      this.bump(deal.seller, s => s.disputes++);
    }
  }

  private bump(address: string, fn: (s: Score) => void): void {
    const score = this.scores.get(address) ?? { ...ZERO_SCORE };
    fn(score);
    this.scores.set(address, score);
  }

  private tx(kind: string, dealId: number): string {
    return hashString(`mocktx:${kind}:${dealId}:${this.txCounter++}`);
  }
}

function mockAddress(role: string): string {
  return `account-hash-${hashString(`mock-account:${role}`)}`;
}
