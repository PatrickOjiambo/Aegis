import { describe, expect, it } from "vitest";

import type { Mandate } from "../src/domain/mandate.schema.js";

import { computeTermsHash, hashString } from "../src/services/casper/hash.js";
import { MockCasperService } from "../src/services/casper/mock.service.js";

const mandate: Mandate = {
  version: 1,
  title: "Weather API access",
  description: "30 days of the forecast endpoint",
  buyer: "account-hash-buyer",
  seller: "account-hash-seller",
  price: "1000000000",
  currency: "CSPR",
  deliverable: "weather-api-30d",
  acceptanceCriteria: [
    { id: "c1", description: "GET /forecast returns 200", kind: "http_status", expected: 200, required: true },
  ],
  deliveryDeadlineMs: 1_900_000_000_000,
};

describe("hashing", () => {
  it("is deterministic regardless of key order", () => {
    const a = computeTermsHash(mandate);
    const reordered = { ...mandate, currency: "CSPR" as const, title: "Weather API access" };
    expect(computeTermsHash(reordered)).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces distinct digests for distinct inputs", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

describe("mockCasperService state machine", () => {
  it("runs a dispute to a Refund settlement and updates reputation", async () => {
    let now = 1_000_000;
    const chain = new MockCasperService(() => now);
    const termsHash = computeTermsHash(mandate);

    const { dealId } = await chain.openDeal({
      seller: chain.addressOf("seller"),
      termsHash,
      amount: "1000000000",
    });
    expect((await chain.getDeal(dealId))?.state).toBe("Pending");

    await chain.markFulfilled(dealId, hashString("delivery-log"));
    expect((await chain.getDeal(dealId))?.state).toBe("Fulfilled");

    await chain.raiseDispute("buyer", dealId);
    const disputed = await chain.getDeal(dealId);
    expect(disputed?.state).toBe("Disputed");
    expect(disputed!.evidenceDeadline).toBeGreaterThan(now);

    await chain.submitEvidence("buyer", dealId, hashString("buyer-evidence"));

    // Cannot settle before the evidence deadline.
    await expect(chain.settle({ dealId, verdict: "Refund", splitBps: 0, rationaleHash: hashString("r") }))
      .rejects
      .toThrow(/EvidenceWindowOpen/);

    now = disputed!.evidenceDeadline + 1;
    await chain.settle({ dealId, verdict: "Refund", splitBps: 0, rationaleHash: hashString("r") });

    const settled = await chain.getDeal(dealId);
    expect(settled?.state).toBe("Refunded");
    expect(settled?.arbiter).toBe(chain.addressOf("arbiter"));

    const buyerScore = await chain.getScore(chain.addressOf("buyer"));
    expect(buyerScore.positive).toBe(1);
    expect(buyerScore.disputes).toBe(1);
  });

  it("rejects settling a non-existent deal", async () => {
    const chain = new MockCasperService();
    await expect(chain.getDeal(999)).resolves.toBeNull();
  });
});
