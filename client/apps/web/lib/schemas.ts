/**
 * Zod schemas for the UI forms (react-hook-form resolvers). These validate
 * operator input before it is shaped into the backend domain payloads in
 * lib/types.ts. The 'price' field is collected in CSPR and converted to motes
 * (lib/format.csprToMotes) at submit time.
 */
import { z } from "zod"

const csprAmount = z
  .string()
  .min(1, "Required")
  .regex(/^\d+(\.\d{1,9})?$/, "Enter a CSPR amount (up to 9 decimals)")
  .refine((v) => Number(v) > 0, "Must be greater than 0")

export const criterionKinds = [
  "http_status",
  "payload_schema",
  "payload_value",
  "oracle_fact",
  "manual",
] as const

export const acceptanceCriterionForm = z.object({
  id: z.string().min(1, "Required"),
  description: z.string().min(1, "Describe the condition"),
  kind: z.enum(criterionKinds),
  expected: z.string().optional(),
  // Defaults are supplied via RHF `defaultValues`; keeping the zod input and
  // output types identical here avoids a zodResolver/Control type mismatch.
  required: z.boolean(),
})

export const mandateForm = z.object({
  title: z.string().min(1, "Give the deal a title"),
  description: z.string(),
  deliverable: z.string().min(1, "What is being delivered?"),
  price: csprAmount,
  deliveryDeadline: z.string().min(1, "Pick a delivery deadline"), // datetime-local
  acceptanceCriteria: z
    .array(acceptanceCriterionForm)
    .min(1, "Add at least one acceptance criterion"),
  notes: z.string().optional(),
})
export type MandateForm = z.infer<typeof mandateForm>

export const evidenceTypes = [
  "http_status",
  "payload",
  "oracle",
  "log",
  "screenshot",
  "other",
] as const

export const evidenceForm = z.object({
  type: z.enum(evidenceTypes),
  value: z.string().optional(),
  ref: z.string().optional(),
  description: z.string().optional(),
})
  .refine((e) => Boolean(e.value?.trim() || e.ref?.trim()), {
    message: "Provide an inline value or a reference (ipfs:// or https://)",
    path: ["value"],
  })
export type EvidenceForm = z.infer<typeof evidenceForm>

export const requestedOutcomes = ["release", "refund", "split"] as const

export const caseForm = z.object({
  role: z.enum(["buyer", "seller"]),
  claim: z.string().min(1, "State the claim"),
  requested_outcome: z.enum(requestedOutcomes),
})
export type CaseForm = z.infer<typeof caseForm>
