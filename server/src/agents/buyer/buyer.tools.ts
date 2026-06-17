import { FunctionTool } from "@google/adk";
import { z } from "zod";

import { EvidenceItemSchema } from "../../domain/evidence.schema.js";
import { MandateSchema } from "../../domain/mandate.schema.js";
import * as orchestrator from "../../orchestration/deal.orchestrator.js";
import { buildCaseMessage, sendCaseToArbiter } from "../shared/case.js";

/**
 * The buyer agent's capabilities, exposed as ADK tools. Each wraps a
 * deterministic on-chain / A2A action via the orchestrator so the critical path
 * is reliable regardless of the driving LLM.
 */
export const buyerTools = [
  new FunctionTool({
    name: "open_escrow_deal",
    description:
      "Open an on-chain escrow for an agreed mandate, depositing payment. Returns the new deal id.",
    parameters: z.object({ mandate: MandateSchema }),
    execute: async ({ mandate }) => orchestrator.openDeal({ mandate }),
  }),

  new FunctionTool({
    name: "raise_dispute",
    description: "Raise a dispute on a deal before its funds are released, moving it to Disputed.",
    parameters: z.object({ dealId: z.number().int().nonnegative() }),
    execute: async ({ dealId }) => ({ txHash: await orchestrator.raiseDispute({ dealId, role: "buyer" }) }),
  }),

  new FunctionTool({
    name: "submit_evidence",
    description: "Submit a piece of evidence (by content hash) for a disputed deal.",
    parameters: z.object({ dealId: z.number().int().nonnegative(), evidence: EvidenceItemSchema }),
    execute: async ({ dealId, evidence }) => ({
      txHash: await orchestrator.submitEvidence({ dealId, role: "buyer", item: evidence }),
    }),
  }),

  new FunctionTool({
    name: "file_case_with_arbiter",
    description:
      "Send the buyer's structured dispute case (claim + evidence + requested outcome) to the arbiter over A2A.",
    parameters: z.object({
      dealId: z.number().int().nonnegative(),
      claim: z.string().min(1),
      requestedOutcome: z.enum(["release", "refund", "split"]),
      evidence: z.array(EvidenceItemSchema).default([]),
    }),
    execute: async ({ dealId, claim, requestedOutcome, evidence }) => {
      const message = buildCaseMessage({ dealId, role: "buyer", claim, requestedOutcome, evidence });
      await sendCaseToArbiter(message);
      return { sent: true };
    },
  }),
];
