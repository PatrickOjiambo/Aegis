import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Mandate } from "../src/domain/mandate.schema.js";
import type { VerdictRuling } from "../src/domain/verdict.schema.js";

import { hearAppeal } from "../src/agents/appeal/appeal.service.js";
import { adjudicate } from "../src/agents/arbiter/arbiter.service.js";
import * as orch from "../src/orchestration/deal.orchestrator.js";
import { createLifecycleWorker } from "../src/orchestration/lifecycle.worker.js";
import { computeEvidenceHash } from "../src/services/casper/hash.js";
import { resetCasperService, setCasperService } from "../src/services/casper/index.js";
import { MockCasperService } from "../src/services/casper/mock.service.js";
import { getDealRecord, getVerdict } from "../src/services/persistence/index.js";
import { startInMemoryMongo } from "./helpers/mongo.js";

const teardown = await startInMemoryMongo();
const run = teardown ? describe : describe.skip;

let now = 1_000_000_000_000;
const chain = new MockCasperService(() => now);

function baseMandate(): Mandate {
  return {
    version: 1,
    title: "Weather API access",
    description: "30 days of forecast endpoint access",
    buyer: "placeholder",
    seller: "placeholder",
    price: "5000000000",
    currency: "CSPR",
    deliverable: "weather-api-30d",
    acceptanceCriteria: [
      { id: "c1", description: "GET /forecast returns 200", kind: "http_status", expected: 200, required: true },
    ],
    deliveryDeadlineMs: now + 1_000_000,
  };
}

run("aegis end-to-end dispute loop (mock chain)", () => {
  beforeAll(() => {
    setCasperService(chain);
  });
  afterAll(async () => {
    resetCasperService();
    await teardown?.();
  });

  it("resolves a dispute to a Refund and updates reputation", async () => {
    const { dealId } = await orch.openDeal({ mandate: baseMandate() });

    // Seller fulfils with delivery evidence.
    await orch.fulfillDeal({
      dealId,
      evidence: { type: "log", hash: computeEvidenceHash("delivery-log"), description: "delivery log" },
    });

    // Buyer disputes and both sides submit evidence + case messages.
    await orch.raiseDispute({ dealId, role: "buyer" });
    await orch.submitEvidence({
      dealId,
      role: "buyer",
      item: { type: "http_status", value: 500, hash: computeEvidenceHash("status-500") },
    });
    const buyerCaseHash = computeEvidenceHash("status-500");
    await orch.submitCaseMessage({
      escrow_id: dealId,
      role: "buyer",
      claim: "Endpoint returned 500, not 200 as agreed",
      evidence: [{ type: "http_status", value: 500, hash: buyerCaseHash }],
      requested_outcome: "refund",
    });
    await orch.submitCaseMessage({
      escrow_id: dealId,
      role: "seller",
      claim: "Service was delivered",
      evidence: [],
      requested_outcome: "release",
    });

    // Close the evidence window.
    const deal = await chain.getDeal(dealId);
    now = deal!.evidenceDeadline + 1;

    // Stubbed reasoning stands in for the DeepSeek LLM (no API key in tests).
    const reason = async (): Promise<VerdictRuling> => ({
      outcome: "Refund",
      splitBps: 0,
      rationale: "The on-chain evidence shows a 500 status; criterion c1 (200) is unmet.",
      findings: [{ criterionId: "c1", met: false, reasoning: "Status was 500", evidenceHashes: [buyerCaseHash] }],
      confidence: 0.95,
    });

    const result = await adjudicate(dealId, { reason });
    expect(result.ruling.outcome).toBe("Refund");

    const onChain = await chain.getDeal(dealId);
    expect(onChain?.state).toBe("Refunded");

    const record = await getDealRecord(dealId);
    expect(record?.state).toBe("Refunded");

    const verdict = await getVerdict(dealId);
    expect(verdict?.outcome).toBe("Refund");
    expect(verdict?.rationaleHash).toMatch(/^[0-9a-f]{64}$/);

    const buyerScore = await chain.getScore(chain.addressOf("buyer"));
    expect(buyerScore.positive).toBe(1);
    expect(buyerScore.disputes).toBe(1);
  });

  it("auto-releases an undisputed fulfilled deal via the worker", async () => {
    const { dealId } = await orch.openDeal({ mandate: baseMandate() });
    await orch.fulfillDeal({
      dealId,
      evidence: { type: "log", hash: computeEvidenceHash("delivery-2"), description: "log" },
    });

    const deal = await chain.getDeal(dealId);
    now = deal!.reviewDeadline + 1;

    const worker = createLifecycleWorker();
    await worker.tick(now);

    expect((await chain.getDeal(dealId))?.state).toBe("Released");
    expect((await getDealRecord(dealId))?.state).toBe("Released");
  });

  it("overturns a verdict on appeal and slashes the arbiter's reputation", async () => {
    const { dealId } = await orch.openDeal({ mandate: baseMandate() });
    await orch.fulfillDeal({
      dealId,
      evidence: { type: "log", hash: computeEvidenceHash("delivery-3"), description: "log" },
    });
    await orch.raiseDispute({ dealId, role: "buyer" });
    const deal = await chain.getDeal(dealId);
    now = deal!.evidenceDeadline + 1;

    await adjudicate(dealId, {
      reason: async () => ({ outcome: "Refund", splitBps: 0, rationale: "refund", findings: [] }),
    });

    const appeal = await hearAppeal(dealId, {
      reason: async () => ({ outcome: "Release", splitBps: 0, rationale: "actually delivered", findings: [] }),
    });
    expect(appeal.overturned).toBe(true);

    const verdict = await getVerdict(dealId);
    expect(verdict?.overturned).toBe(true);

    const arbiterScore = await chain.getScore(chain.addressOf("arbiter"));
    expect(arbiterScore.overturned).toBe(1);
  });
});

// Ensure the suite is not silently skipped without notice in normal local runs.
if (!teardown)

  console.warn("[integration] in-memory MongoDB unavailable — integration suite skipped");
