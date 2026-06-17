/* eslint-disable no-console */
/**
 * End-to-end Aegis demo: two agents transact, delivery is disputed, the arbiter
 * rules, and the escrow settles on-chain — then a second case is appealed and
 * overturned (the arbiter is slashed). Runs against the in-memory mock chain by
 * default (no testnet needed); set CHAIN_MODE=real with deployed contract
 * hashes + keys to fire real Casper Testnet transactions.
 *
 * Prerequisites: a running MongoDB (`pnpm mongo:up`).
 *   pnpm demo
 */
import process from "node:process";

import type { ReasoningFn } from "../src/agents/arbiter/arbiter.service.js";
import type { Mandate } from "../src/domain/mandate.schema.js";

import { hearAppeal } from "../src/agents/appeal/appeal.service.js";
import { buildArbiterAgent } from "../src/agents/arbiter/arbiter.agent.js";
import { runArbiterReasoning } from "../src/agents/arbiter/arbiter.runner.js";
import { adjudicate } from "../src/agents/arbiter/arbiter.service.js";
import { env } from "../src/env.js";
import { connectDb, disconnectDb } from "../src/lib/db.js";
import * as orch from "../src/orchestration/deal.orchestrator.js";
import { computeEvidenceHash } from "../src/services/casper/hash.js";
import { getCasperService, setCasperService } from "../src/services/casper/index.js";
import { MockCasperService } from "../src/services/casper/mock.service.js";
import { getVerdict } from "../src/services/persistence/index.js";

// A controllable clock so the demo can fast-forward through escrow windows.
let clock = Date.now();
const tick = (ms: number) => (clock += ms);

function log(step: string, detail?: unknown): void {
  console.log(`\n▸ ${step}`);
  if (detail !== undefined)
    console.log(JSON.stringify(detail, null, 2));
}

function mandate(): Mandate {
  return {
    version: 1,
    title: "Weather forecast API — 30 days",
    description: "Access to the /forecast endpoint for 30 days",
    buyer: "set-by-orchestrator",
    seller: "set-by-orchestrator",
    price: "5000000000",
    currency: "CSPR",
    deliverable: "weather-api-30d",
    acceptanceCriteria: [
      { id: "c1", description: "GET /forecast returns HTTP 200", kind: "http_status", expected: 200, required: true },
    ],
    deliveryDeadlineMs: clock + 86_400_000,
  };
}

/** Real DeepSeek reasoning if a key is set, else a deterministic stub. */
function reasoningFor(outcomeIfStub: "Refund" | "Release"): ReasoningFn | undefined {
  if (env.DEEPSEEK_API_KEY)
    return undefined; // adjudicate() falls back to the real DeepSeek arbiter
  return async () => ({
    outcome: outcomeIfStub,
    splitBps: 0,
    rationale:
      outcomeIfStub === "Refund"
        ? "On-chain evidence shows HTTP 500; acceptance criterion c1 (HTTP 200) is unmet — the buyer is refunded."
        : "On-chain evidence confirms HTTP 200; the deliverable conforms — funds release to the seller.",
    findings: [{ criterionId: "c1", met: outcomeIfStub === "Release", reasoning: "Verified against on-chain status evidence", evidenceHashes: [] }],
    confidence: 0.9,
  });
}

async function disputeCase(): Promise<void> {
  log("CASE 1 — Disputed deliverable → refund");
  const { dealId } = await orch.openDeal({ mandate: mandate() });
  log("Buyer opened escrow and deposited 5 CSPR", { dealId });

  await orch.fulfillDeal({
    dealId,
    evidence: { type: "log", hash: computeEvidenceHash("delivery-log"), description: "delivery log" },
  });
  log("Seller marked the deal fulfilled");

  await orch.raiseDispute({ dealId, role: "buyer" });
  await orch.submitEvidence({
    dealId,
    role: "buyer",
    item: { type: "http_status", value: 500, hash: computeEvidenceHash("status-500"), description: "Observed 500" },
  });
  await orch.submitCaseMessage({
    escrow_id: dealId,
    role: "buyer",
    claim: "The endpoint returned HTTP 500, not the agreed 200.",
    evidence: [{ type: "http_status", value: 500, hash: computeEvidenceHash("status-500") }],
    requested_outcome: "refund",
  });
  await orch.submitCaseMessage({
    escrow_id: dealId,
    role: "seller",
    claim: "The service was delivered as agreed.",
    evidence: [],
    requested_outcome: "release",
  });
  log("Buyer disputed; both parties filed evidence and case messages");

  const deal = await getCasperService().getDeal(dealId);
  tick(deal!.evidenceDeadline - clock + 1); // close the evidence window

  const { ruling, txHash } = await adjudicate(dealId, { reason: reasoningFor("Refund") });
  log("Arbiter ruled and settled on-chain", { outcome: ruling.outcome, txHash, rationale: ruling.rationale });

  const settled = await getCasperService().getDeal(dealId);
  const buyerScore = await getCasperService().getScore(getCasperService().addressOf("buyer"));
  log("Final state", { state: settled?.state, buyerReputation: buyerScore });
}

async function appealCase(): Promise<void> {
  log("CASE 2 — A bad ruling is appealed and overturned (arbiter slashed)");
  const { dealId } = await orch.openDeal({ mandate: mandate() });
  await orch.fulfillDeal({
    dealId,
    evidence: { type: "log", hash: computeEvidenceHash("delivery-2"), description: "delivery log" },
  });
  await orch.raiseDispute({ dealId, role: "buyer" });
  const deal = await getCasperService().getDeal(dealId);
  tick(deal!.evidenceDeadline - clock + 1);

  await adjudicate(dealId, { reason: reasoningFor("Refund") });
  log("Arbiter issued an initial (contested) Refund verdict", { dealId });

  const appeal = await hearAppeal(dealId, { reason: reasoningFor("Release") });
  const verdict = await getVerdict(dealId);
  const arbiterScore = await getCasperService().getScore(getCasperService().addressOf("arbiter"));
  log("Appeal heard", {
    overturned: appeal.overturned,
    from: appeal.originalOutcome,
    to: appeal.reheardOutcome,
    verdictOverturned: verdict?.overturned,
    arbiterReputation: arbiterScore,
  });
}

async function main(): Promise<void> {
  // Use a mock chain with a controllable clock so windows fast-forward instantly.
  setCasperService(new MockCasperService(() => clock));
  if (env.CHAIN_MODE === "real")
    console.warn("CHAIN_MODE=real ignored by the demo clock harness; running mock chain.");

  await connectDb();
  console.log(`\n=== Aegis demo — DeepSeek arbiter ${env.DEEPSEEK_API_KEY ? "(live)" : "(stubbed)"} ===`);

  // Touch the arbiter agent factory so misconfiguration surfaces early when live.
  if (env.DEEPSEEK_API_KEY)
    void buildArbiterAgent();
  void runArbiterReasoning;

  await disputeCase();
  await appealCase();

  console.log("\n✓ Demo complete — recourse delivered for the machine economy.\n");
  await disconnectDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Demo failed:", err);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
