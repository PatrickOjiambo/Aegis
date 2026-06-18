import type { PublicKey } from "casper-js-sdk";

import { KeyAlgorithm, PrivateKey } from "casper-js-sdk";
import { readFileSync } from "node:fs";

import { ConfigError } from "../../lib/errors.js";

/** A loaded signing identity for an Aegis agent. */
export type AgentKey = {
  privateKey: PrivateKey;
  publicKey: PublicKey;
  /** `account-hash-…` — the on-chain identity used in deals and reputation. */
  accountHash: string;
  /** Hex public key (with algorithm tag). */
  publicKeyHex: string;
};

/** Maps a Casper key-algorithm name to the SDK enum. */
function resolveAlgorithm(algo: string | undefined): KeyAlgorithm {
  switch ((algo ?? "ed25519").toLowerCase()) {
    case "ed25519":
      return KeyAlgorithm.ED25519;
    case "secp256k1":
      return KeyAlgorithm.SECP256K1;
    default:
      throw new ConfigError(`Unsupported key algorithm: ${algo}`);
  }
}

function toAgentKey(privateKey: PrivateKey): AgentKey {
  const publicKey = privateKey.publicKey;
  return {
    privateKey,
    publicKey,
    accountHash: publicKey.accountHash().toPrefixedString(),
    publicKeyHex: publicKey.toHex(),
  };
}

/** Loads an agent signing key from a PEM secret-key file. */
export function loadKeyFromPem(path: string, algorithm?: string): AgentKey {
  let pem: string;
  try {
    pem = readFileSync(path, "utf8");
  }
  catch (err) {
    throw new ConfigError(`Could not read secret key at ${path}`, { cause: String(err) });
  }
  const privateKey = PrivateKey.fromPem(pem, resolveAlgorithm(algorithm));
  return toAgentKey(privateKey);
}

/** Generates an ephemeral key (used by the demo when no PEM is supplied). */
export function generateKey(algorithm: KeyAlgorithm = KeyAlgorithm.ED25519): AgentKey {
  return toAgentKey(PrivateKey.generate(algorithm));
}
