import { Args, CLValue, Key } from "casper-js-sdk";

import type { Hex32 } from "../../domain/common.js";
import type { Verdict } from "../../domain/escrow.schema.js";

import { verdictToCode } from "../../domain/escrow.schema.js";
import { hex32ToBytes } from "./hash.js";

/**
 * CLValue encoders for the EscrowVault / ReputationRegistry entry-point args.
 *
 * NOTE ON ODRA ABI: Odra `Address` is encoded as a `Key`; `[u8; 32]` as a fixed
 * byte array; numerics as their CL counterparts. Odra `#[odra_type]` enums are
 * encoded as a single `u8` discriminant — we use the explicit codes from the
 * contract spec (§1.1). These encodings are exercised end-to-end by the mock
 * chain; when wiring a live deployment, confirm them against the generated
 * contract schema (`bin/build_schema.rs`).
 */

/** Odra `Address` → `Key` (accepts `account-hash-…` or `hash-…`). */
export function addressArg(address: string): CLValue {
  return CLValue.newCLKey(Key.newKey(address));
}

/** Odra `[u8; 32]` content hash. */
export function hash32Arg(hash: Hex32): CLValue {
  return CLValue.newCLByteArray(hex32ToBytes(hash));
}

export function u64Arg(value: number): CLValue {
  return CLValue.newCLUint64(value);
}

export function u32Arg(value: number): CLValue {
  return CLValue.newCLUInt32(value);
}

export function stringArg(value: string): CLValue {
  return CLValue.newCLString(value);
}

/** A `U512` amount in motes (decimal string). */
export function motesArg(value: string): CLValue {
  return CLValue.newCLUInt512(value);
}

/** Odra `Verdict` enum → u8 discriminant (Release=1, Refund=2, Split=3). */
export function verdictArg(verdict: Verdict): CLValue {
  return CLValue.newCLUint8(verdictToCode(verdict));
}

/** Builds an {@link Args} map from named CLValues. */
export function args(map: Record<string, CLValue>): Args {
  return Args.fromMap(map);
}
