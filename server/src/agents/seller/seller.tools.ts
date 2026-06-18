import { FunctionTool } from "@google/adk";
import { z } from "zod";

import { EvidenceItemSchema } from "../../domain/evidence.schema.js";
import * as orchestrator from "../../orchestration/deal.orchestrator.js";
import { buildCaseMessage, sendCaseToArbiter } from "../shared/case.js";

/**
 * The seller agent's capabilities as ADK tools — delivering, submitting
 * evidence, and presenting its side of a dispute to the arbiter.
 */
export const sellerTools = [
  new FunctionTool({
    name: "mark_fulfilled",
    description:
      "Mark a deal's deliverable as fulfilled, attaching delivery evidence (by content hash).",
    parameters: z.object({ dealId: z.number().int().nonnegative(), evidence: EvidenceItemSchema }),
    execute: async ({ dealId, evidence }) => ({
      txHash: await orchestrator.fulfillDeal({ dealId, evidence }),
    }),
  }),

  new FunctionTool({
    name: "submit_evidence",
    description: "Submit a piece of delivery evidence (by content hash) for a disputed deal.",
    parameters: z.object({ dealId: z.number().int().nonnegative(), evidence: EvidenceItemSchema }),
    execute: async ({ dealId, evidence }) => ({
      txHash: await orchestrator.submitEvidence({ dealId, role: "seller", item: evidence }),
    }),
  }),

  new FunctionTool({
    name: "file_case_with_arbiter",
    description:
      "Send the seller's structured dispute case (claim + evidence + requested outcome) to the arbiter over A2A.",
    parameters: z.object({
      dealId: z.number().int().nonnegative(),
      claim: z.string().min(1),
      requestedOutcome: z.enum(["release", "refund", "split"]),
      evidence: z.array(EvidenceItemSchema).default([]),
    }),
    execute: async ({ dealId, claim, requestedOutcome, evidence }) => {
      const message = buildCaseMessage({ dealId, role: "seller", claim, requestedOutcome, evidence });
      await sendCaseToArbiter(message);
      return { sent: true };
    },
  }),
];
