import { z } from "zod";

import { CasperAddressSchema, MoteAmountSchema } from "./common.js";

/**
 * How an individual acceptance criterion is checked. These mirror the
 * "semi-verifiable" evidence kinds the demo is scoped to (design §4.3, §8.2):
 * status codes, returned payloads, oracle-checkable facts.
 */
export const CriterionKindSchema = z.enum([
  "http_status", // an HTTP endpoint must return an expected status
  "payload_schema", // a returned payload must conform to a JSON schema/shape
  "payload_value", // a returned payload must contain/equal an expected value
  "oracle_fact", // an oracle-checkable fact must hold
  "manual", // subjective — weighed by the arbiter from evidence text
]);
export type CriterionKind = z.infer<typeof CriterionKindSchema>;

/**
 * A single, testable condition the seller must satisfy. The arbiter rules each
 * criterion met/unmet strictly against submitted evidence (F4, FR-7).
 */
export const AcceptanceCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  kind: CriterionKindSchema,
  /** Expected value/shape for the check (interpretation depends on `kind`). */
  expected: z.unknown().optional(),
  /** If false, failing this criterion alone does not warrant a full refund. */
  required: z.boolean().default(true),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

/**
 * The Mandate — the full agreed terms that live OFF-chain (only their hash is
 * stored on-chain, spec §0). This is the contract the arbiter rules against
 * (F2). It must serialise deterministically; see `canonicalize` in the hashing
 * service so buyer and arbiter compute identical `terms_hash` values.
 */
export const MandateSchema = z.object({
  /** Schema version, so the hash space is forward-compatible. */
  version: z.literal(1).default(1),
  title: z.string().min(1),
  description: z.string().default(""),
  buyer: CasperAddressSchema,
  seller: CasperAddressSchema,
  /** Total price escrowed, in motes. */
  price: MoteAmountSchema,
  currency: z.literal("CSPR").default("CSPR"),
  /** What is being delivered (free-form label, e.g. "weather-api-30d"). */
  deliverable: z.string().min(1),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema).min(1),
  /** Wall-clock deadline for delivery (unix ms). */
  deliveryDeadlineMs: z.number().int().positive(),
  /** Optional free-form notes that are still part of the binding terms. */
  notes: z.string().optional(),
});
export type Mandate = z.infer<typeof MandateSchema>;
