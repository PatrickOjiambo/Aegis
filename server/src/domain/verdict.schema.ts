import { z } from "zod";

import { BpsSchema } from "./common.js";
import { VerdictSchema } from "./escrow.schema.js";

/** The arbiter's assessment of one acceptance criterion. */
export const CriterionFindingSchema = z.object({
  criterionId: z.string().min(1),
  met: z.boolean(),
  /** Why the criterion was (not) met, grounded in specific evidence. */
  reasoning: z.string().min(1),
  /** Evidence item hashes the finding relies on. */
  evidenceHashes: z.array(z.string()).default([]),
});
export type CriterionFinding = z.infer<typeof CriterionFindingSchema>;

/**
 * The structured ruling the arbiter LLM must produce (F4, FR-7). This is the
 * agent's output schema; it is validated before any on-chain action. The
 * `rationale` satisfies the explainability requirement (NFR-10); its hash is
 * recorded on-chain at settlement.
 */
export const VerdictRulingSchema = z
  .object({
    outcome: VerdictSchema,
    /** Seller's share in basis points; only meaningful for a Split outcome. */
    splitBps: BpsSchema.default(0),
    /** Human-readable justification of the decision. */
    rationale: z.string().min(1),
    /** Per-criterion findings the outcome is built from. */
    findings: z.array(CriterionFindingSchema).default([]),
    /** Arbiter's self-assessed confidence, 0–1. */
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine(r => r.outcome !== "Split" || (r.splitBps > 0 && r.splitBps < 10_000), {
    message: "splitBps must be strictly between 0 and 10000 for a Split outcome",
    path: ["splitBps"],
  });
export type VerdictRuling = z.infer<typeof VerdictRulingSchema>;
