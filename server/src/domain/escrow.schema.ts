import { z } from "zod";

import { BpsSchema, CasperAddressSchema, Hex32Schema, MoteAmountSchema, TimestampMsSchema } from "./common.js";

/**
 * Escrow deal state machine — mirrors `EscrowState` in the EscrowVault contract
 * (`aegis-contracts/contracts_spec.md` §1.1). Numeric codes are the on-chain
 * representation; string names are used everywhere off-chain.
 */
export const ESCROW_STATES = ["Pending", "Fulfilled", "Disputed", "Released", "Refunded", "Split"] as const;
export const EscrowStateSchema = z.enum(ESCROW_STATES);
export type EscrowState = z.infer<typeof EscrowStateSchema>;

const ESCROW_STATE_CODES: Record<EscrowState, number> = {
  Pending: 1,
  Fulfilled: 2,
  Disputed: 3,
  Released: 4,
  Refunded: 5,
  Split: 6,
};
const ESCROW_STATE_BY_CODE = Object.fromEntries(
  Object.entries(ESCROW_STATE_CODES).map(([k, v]) => [v, k]),
) as Record<number, EscrowState>;

export function escrowStateToCode(state: EscrowState): number {
  return ESCROW_STATE_CODES[state];
}
export function escrowStateFromCode(code: number): EscrowState {
  const state = ESCROW_STATE_BY_CODE[code];
  if (!state)
    throw new Error(`Unknown EscrowState code: ${code}`);
  return state;
}

/** Terminal states — no further transitions, funds have moved. */
export const TERMINAL_STATES: readonly EscrowState[] = ["Released", "Refunded", "Split"];
export function isTerminal(state: EscrowState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Verdict the arbiter applies via `settle` — mirrors `Verdict` (spec §1.1).
 */
export const VERDICTS = ["Release", "Refund", "Split"] as const;
export const VerdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof VerdictSchema>;

const VERDICT_CODES: Record<Verdict, number> = { Release: 1, Refund: 2, Split: 3 };
export function verdictToCode(v: Verdict): number {
  return VERDICT_CODES[v];
}

/**
 * On-chain `Deal` record (spec §1.1), mirrored off-chain for queryability.
 * `arbiter`, `settledAt`, `appealDeadline` are the post-settlement / appeal
 * seam fields (null/0 until a verdict is applied).
 */
export const DealSchema = z.object({
  id: z.number().int().nonnegative(),
  buyer: CasperAddressSchema,
  seller: CasperAddressSchema,
  amount: MoteAmountSchema,
  termsHash: Hex32Schema,
  state: EscrowStateSchema,
  createdAt: TimestampMsSchema,
  reviewDeadline: TimestampMsSchema,
  evidenceDeadline: TimestampMsSchema, // 0 until disputed
  settledAt: TimestampMsSchema, // 0 until settled
  appealDeadline: TimestampMsSchema, // 0 in MVP
  arbiter: CasperAddressSchema.nullable(),
});
export type Deal = z.infer<typeof DealSchema>;

/** Parameters to open a new escrow deal. */
export const OpenDealParamsSchema = z.object({
  seller: CasperAddressSchema,
  termsHash: Hex32Schema,
  amount: MoteAmountSchema,
});
export type OpenDealParams = z.infer<typeof OpenDealParamsSchema>;

/** Parameters the arbiter passes to `settle`. */
export const SettlementSchema = z
  .object({
    dealId: z.number().int().nonnegative(),
    verdict: VerdictSchema,
    splitBps: BpsSchema.default(0),
    rationaleHash: Hex32Schema,
  })
  .refine(s => s.verdict !== "Split" || s.splitBps > 0, {
    message: "splitBps must be > 0 for a Split verdict",
    path: ["splitBps"],
  });
export type Settlement = z.infer<typeof SettlementSchema>;
