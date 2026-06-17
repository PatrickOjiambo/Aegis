import { z } from "zod";

/**
 * A 32-byte content digest (the `[u8; 32]` the Odra contracts store for terms,
 * evidence and rationale). Canonicalised to 64 lowercase hex chars, no `0x`.
 */
export const Hex32Schema = z
  .string()
  .transform(s => s.toLowerCase().replace(/^0x/, ""))
  .pipe(z.string().regex(/^[0-9a-f]{64}$/, "expected a 32-byte hex digest (64 hex chars)"));
export type Hex32 = z.infer<typeof Hex32Schema>;

/**
 * A Casper participant identity — an account public key (hex) or account hash.
 * Kept permissive here; the Casper service does the strict parsing.
 */
export const CasperAddressSchema = z
  .string()
  .trim()
  .min(2, "casper address required");
export type CasperAddress = z.infer<typeof CasperAddressSchema>;

/**
 * A non-negative integer amount of motes (`U512` on-chain) as a decimal string,
 * because values can exceed `Number.MAX_SAFE_INTEGER`.
 */
export const MoteAmountSchema = z
  .string()
  .regex(/^\d+$/, "expected a non-negative integer amount in motes (decimal string)")
  .refine(v => v === "0" || !v.startsWith("0"), "no leading zeros");
export type MoteAmount = z.infer<typeof MoteAmountSchema>;

/** A unix-millisecond timestamp (matches Odra `self.env().get_block_time()`). */
export const TimestampMsSchema = z.number().int().nonnegative();

/** Basis points, 0–10000 (used by the EscrowVault split). */
export const BpsSchema = z.number().int().min(0).max(10_000);
export type Bps = z.infer<typeof BpsSchema>;
