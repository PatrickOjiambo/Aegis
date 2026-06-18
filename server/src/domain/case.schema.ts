import { z } from "zod";

import { EvidenceItemSchema, PartyRoleSchema } from "./evidence.schema.js";

/** Outcome a disputing party requests from the arbiter. */
export const RequestedOutcomeSchema = z.enum(["release", "refund", "split"]);
export type RequestedOutcome = z.infer<typeof RequestedOutcomeSchema>;

/**
 * The structured case message a party sends the arbiter over A2A when a dispute
 * is opened (design §9.4). Wire keys are snake_case to match the published
 * payload shape so any conforming agent can interoperate.
 *
 * The arbiter treats this purely as a *claim* (evidence) — it cross-checks every
 * asserted fact against on-chain truth before weighing it (design §9.2).
 */
export const CaseMessageSchema = z.object({
  escrow_id: z.number().int().nonnegative(),
  role: PartyRoleSchema,
  claim: z.string().min(1),
  evidence: z.array(EvidenceItemSchema).default([]),
  requested_outcome: RequestedOutcomeSchema,
  /** Signature tying the message to the party's key (verified by the arbiter). */
  signature: z.string().optional(),
});
export type CaseMessage = z.infer<typeof CaseMessageSchema>;

/** Discriminates the kind of A2A message Aegis agents exchange. */
export const A2AMessageKindSchema = z.enum([
  "negotiate", // buyer ⇄ seller term negotiation
  "deliver", // seller → buyer deliverable handoff
  "case", // party → arbiter dispute case message
  "verdict", // arbiter → parties ruling notification
  "appeal", // party → appeal panel
]);
export type A2AMessageKind = z.infer<typeof A2AMessageKindSchema>;

/**
 * Envelope wrapping a typed payload inside an A2A DataPart, so a single A2A
 * endpoint can route structured Aegis messages by `kind`.
 */
export const A2AEnvelopeSchema = z.object({
  kind: A2AMessageKindSchema,
  payload: z.unknown(),
});
export type A2AEnvelope = z.infer<typeof A2AEnvelopeSchema>;
