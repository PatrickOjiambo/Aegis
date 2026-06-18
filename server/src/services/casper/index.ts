import type { AgentKey } from "./keys.js";
import type { ChainActor, ICasperService } from "./types.js";

import { env } from "../../env.js";
import { ConfigError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { generateKey, loadKeyFromPem } from "./keys.js";
import { MockCasperService } from "./mock.service.js";
import { RealCasperService } from "./real.service.js";

export * from "./hash.js";
export * from "./keys.js";
export { MockCasperService } from "./mock.service.js";
export { RealCasperService } from "./real.service.js";
export type { ChainActor, ICasperService, OpenDealResult, TxResult } from "./types.js";

const log = logger.child({ component: "casper" });

let instance: ICasperService | undefined;

/** Loads the three agent signing keys (PEM if configured, ephemeral otherwise). */
export function loadKeyring(): Record<ChainActor, AgentKey> {
  const load = (path: string | undefined, role: ChainActor): AgentKey => {
    if (path)
      return loadKeyFromPem(path);
    log.warn({ role }, "No secret key configured; generating an ephemeral key (dev only)");
    return generateKey();
  };
  return {
    buyer: load(env.BUYER_SECRET_KEY_PATH, "buyer"),
    seller: load(env.SELLER_SECRET_KEY_PATH, "seller"),
    arbiter: load(env.ARBITER_SECRET_KEY_PATH, "arbiter"),
  };
}

/**
 * Returns the process-wide Casper service, constructing it on first use from
 * `CHAIN_MODE`. `mock` needs no keys or node; `real` requires deployed contract
 * hashes (signing keys fall back to ephemeral only for dry runs).
 */
export function getCasperService(): ICasperService {
  if (instance)
    return instance;

  if (env.CHAIN_MODE === "mock") {
    log.info("Using in-memory mock Casper chain (CHAIN_MODE=mock)");
    instance = new MockCasperService();
    return instance;
  }

  if (!env.ESCROW_CONTRACT_HASH || !env.REPUTATION_CONTRACT_HASH) {
    throw new ConfigError(
      "CHAIN_MODE=real requires ESCROW_CONTRACT_HASH and REPUTATION_CONTRACT_HASH",
    );
  }

  log.info({ rpc: env.CASPER_NODE_RPC_URL, network: env.CASPER_NETWORK_NAME }, "Using live Casper chain");
  instance = new RealCasperService({
    rpcUrl: env.CASPER_NODE_RPC_URL,
    chainName: env.CASPER_NETWORK_NAME,
    escrowContractHash: env.ESCROW_CONTRACT_HASH,
    reputationContractHash: env.REPUTATION_CONTRACT_HASH,
    proxyWasmPath: env.PROXY_WASM_PATH,
    keys: loadKeyring(),
  });
  return instance;
}

/** Overrides the service (used by tests to inject a controlled mock). */
export function setCasperService(service: ICasperService): void {
  instance = service;
}

/** Resets the singleton (tests). */
export function resetCasperService(): void {
  instance = undefined;
}
