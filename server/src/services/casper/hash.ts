import { blake2b } from "@noble/hashes/blake2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { Hex32 } from "../../domain/common.js";
import type { Mandate } from "../../domain/mandate.schema.js";

import { HASH_BYTES } from "../../config/constants.js";

/**
 * Blake2b-256 — the digest the Odra contracts store as `[u8; 32]`.
 *
 * IMPORTANT: buyer and arbiter MUST hash identically for the arbiter to verify
 * `terms_hash`, so all Aegis hashing goes through these helpers. The canonical
 * form (sorted-key JSON, see {@link canonicalize}) makes the digest stable
 * regardless of property order.
 */
export function blake2b256(data: Uint8Array): Hex32 {
  return bytesToHex(blake2b(data, { dkLen: HASH_BYTES })) as Hex32;
}

/** Hashes a UTF-8 string. */
export function hashString(value: string): Hex32 {
  return blake2b256(utf8ToBytes(value));
}

/**
 * Deterministic JSON serialization: object keys sorted recursively so two
 * structurally-equal values always produce the same bytes (and thus hash).
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Computes the on-chain `terms_hash` for a Mandate. */
export function computeTermsHash(mandate: Mandate): Hex32 {
  return hashString(canonicalize(mandate));
}

/** Computes the content hash of the arbiter's written rationale (recorded on settle). */
export function computeRationaleHash(rationale: string): Hex32 {
  return hashString(rationale);
}

/**
 * Computes an evidence content hash. Accepts the raw payload bytes, or a
 * string/structured value which is canonicalised first.
 */
export function computeEvidenceHash(payload: Uint8Array | string | object): Hex32 {
  if (payload instanceof Uint8Array)
    return blake2b256(payload);
  if (typeof payload === "string")
    return hashString(payload);
  return hashString(canonicalize(payload));
}

/** Converts a 64-char hex digest into the 32-byte array the contracts expect. */
export function hex32ToBytes(hex: Hex32): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(HASH_BYTES);
  for (let i = 0; i < HASH_BYTES; i++)
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
