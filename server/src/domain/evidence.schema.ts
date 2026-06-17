import { z } from "zod";

import { Hex32Schema } from "./common.js";

/** The party that produced a piece of evidence. */
export const PartyRoleSchema = z.enum(["buyer", "seller"]);
export type PartyRole = z.infer<typeof PartyRoleSchema>;

/**
 * The kind of evidence item, matching the design's representative shapes
 * (§9.4): http status codes, returned payloads, oracle facts, logs.
 */
export const EvidenceTypeSchema = z.enum([
  "http_status",
  "payload",
  "oracle",
  "log",
  "screenshot",
  "other",
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

/**
 * A single evidence item. The `hash` ties the item to an immutable reference so
 * nothing can be swapped after submission (NFR-5); `ref` is an off-chain
 * pointer (e.g. ipfs://, https://) the contract never needs to know about.
 * Exactly one of `value` / `ref` is expected depending on `type`.
 */
export const EvidenceItemSchema = z.object({
  type: EvidenceTypeSchema,
  /** Inline value for small facts (e.g. an HTTP status code 200). */
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  /** Off-chain reference for larger payloads (ipfs://, https://, ...). */
  ref: z.string().optional(),
  /** Content hash of the referenced/inlined evidence (`[u8; 32]`). */
  hash: Hex32Schema,
  /** Optional human description aiding the arbiter. */
  description: z.string().optional(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/** A party's full evidence submission for a dispute. */
export const EvidenceSubmissionSchema = z.object({
  dealId: z.number().int().nonnegative(),
  role: PartyRoleSchema,
  items: z.array(EvidenceItemSchema).min(1),
});
export type EvidenceSubmission = z.infer<typeof EvidenceSubmissionSchema>;
