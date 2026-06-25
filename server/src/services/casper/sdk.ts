/**
 * ESM-safe re-exports for casper-js-sdk.
 *
 * The SDK (v5) ships as a single bundled CommonJS file with no `"type": "module"`.
 * When ESM imports a CJS module, Node uses cjs-module-lexer to statically detect
 * the named exports — and it cannot see through this bundle's `export *` chain.
 * So `import { Args } from "casper-js-sdk"` resolves to `undefined` at runtime
 * even though `require()` and the published `.d.ts` types both expose it.
 *
 * Reaching the values through the default export sidesteps the lexer. This module
 * re-exports the runtime values (via the default import) alongside the matching
 * types (via `export type`), so the rest of the codebase can import either kind
 * under the normal names from here instead of from "casper-js-sdk".
 */
import type * as Casper from "casper-js-sdk";

import casperSdk from "casper-js-sdk";

export const {
  Args,
  CLValue,
  ContractCallBuilder,
  HttpHandler,
  Key,
  KeyAlgorithm,
  PrivateKey,
  RpcClient,
  SessionBuilder,
} = casperSdk;

// Same-named type aliases so consumers can import each name from here and use it
// in both value and type position (a value `const` and a `type` coexist).
export type Args = Casper.Args;
export type CLValue = Casper.CLValue;
export type ContractCallBuilder = Casper.ContractCallBuilder;
export type HttpHandler = Casper.HttpHandler;
export type Key = Casper.Key;
export type KeyAlgorithm = Casper.KeyAlgorithm;
export type PrivateKey = Casper.PrivateKey;
export type PublicKey = Casper.PublicKey;
export type RpcClient = Casper.RpcClient;
export type SessionBuilder = Casper.SessionBuilder;
