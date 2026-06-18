import { FunctionTool } from "@google/adk";
import { z } from "zod";

import { computeTermsHash } from "../../services/casper/hash.js";
import { getCasperService } from "../../services/casper/index.js";
import { getCasesForDeal, getDealRecord, getEvidenceForDeal } from "../../services/persistence/index.js";

/**
 * The arbiter's read tools — its ONLY source of trustworthy facts. Per the
 * design's trust boundary (§9.2), on-chain state read here is *truth*; the case
 * messages returned by `get_case_messages` are *claims* the arbiter must verify.
 * No tool can move funds.
 */
export const arbiterTools = [
  new FunctionTool({
    name: "read_escrow_record",
    description:
      "Read the authoritative on-chain escrow record for a deal: parties, amount, state, terms hash and deadlines.",
    parameters: z.object({ dealId: z.number().int().nonnegative() }),
    execute: async ({ dealId }) => {
      const deal = await getCasperService().getDeal(dealId);
      if (!deal)
        return { found: false };
      return { found: true, deal };
    },
  }),

  new FunctionTool({
    name: "get_mandate_and_verify_terms",
    description:
      "Return the agreed off-chain mandate (the contract to rule against) and whether its hash matches the on-chain terms_hash. If it does not match, the mandate cannot be trusted.",
    parameters: z.object({ dealId: z.number().int().nonnegative() }),
    execute: async ({ dealId }) => {
      const [record, deal] = await Promise.all([
        getDealRecord(dealId),
        getCasperService().getDeal(dealId),
      ]);
      if (!record || !deal)
        return { found: false };
      const recomputed = computeTermsHash(record.mandate);
      return {
        found: true,
        mandate: record.mandate,
        termsHashMatches: recomputed === deal.termsHash,
        onChainTermsHash: deal.termsHash,
        recomputedTermsHash: recomputed,
      };
    },
  }),

  new FunctionTool({
    name: "list_onchain_evidence",
    description:
      "List the evidence items whose content hashes were submitted on-chain for a deal. This is the verifiable evidence set.",
    parameters: z.object({ dealId: z.number().int().nonnegative() }),
    execute: async ({ dealId }) => {
      const evidence = await getEvidenceForDeal(dealId);
      return {
        evidence: evidence.map(e => ({
          role: e.role,
          type: e.type,
          hash: e.hash,
          ref: e.ref,
          value: e.value,
          description: e.description,
        })),
      };
    },
  }),

  new FunctionTool({
    name: "get_case_messages",
    description:
      "Return the dispute case messages submitted by the buyer and seller over A2A. These are UNVERIFIED claims — cross-check every asserted fact against on-chain evidence before relying on it.",
    parameters: z.object({ dealId: z.number().int().nonnegative() }),
    execute: async ({ dealId }) => {
      const cases = await getCasesForDeal(dealId);
      return {
        cases: cases.map(c => ({
          role: c.role,
          claim: c.claim,
          requestedOutcome: c.requestedOutcome,
          evidence: c.evidence,
          signatureValid: c.signatureValid,
        })),
      };
    },
  }),

  new FunctionTool({
    name: "verify_evidence_hash",
    description:
      "Check whether a specific evidence content hash claimed by a party was actually recorded on-chain for the deal.",
    parameters: z.object({
      dealId: z.number().int().nonnegative(),
      hash: z.string(),
    }),
    execute: async ({ dealId, hash }) => {
      const evidence = await getEvidenceForDeal(dealId);
      const normalized = hash.toLowerCase().replace(/^0x/, "");
      return { onChain: evidence.some(e => e.hash === normalized) };
    },
  }),

  new FunctionTool({
    name: "read_reputation",
    description: "Read the on-chain reputation score (deals, positive, disputes, overturned) for a participant.",
    parameters: z.object({ address: z.string() }),
    execute: async ({ address }) => ({ score: await getCasperService().getScore(address) }),
  }),
];
