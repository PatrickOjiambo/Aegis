import { env } from "../env.js";

/** The four off-chain participants Aegis runs as A2A agents. */
export const AGENT_ROLES = ["buyer", "seller", "arbiter", "appeal"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** Standard A2A well-known path for an Agent Card. */
export const AGENT_CARD_PATH = ".well-known/agent-card.json";

/** Base path each agent mounts its JSON-RPC + REST transports under. */
export const A2A_JSONRPC_PATH = "/a2a/jsonrpc";
export const A2A_REST_PATH = "/a2a/rest";

export const AGENT_PORTS: Record<AgentRole, number> = {
  buyer: env.BUYER_A2A_PORT,
  seller: env.SELLER_A2A_PORT,
  arbiter: env.ARBITER_A2A_PORT,
  appeal: env.APPEAL_A2A_PORT,
};

/** Public base URL an agent advertises (and peers dial) for discovery. */
export function agentBaseUrl(role: AgentRole): string {
  return `${env.PUBLIC_HOST}:${AGENT_PORTS[role]}`;
}

/** Basis points denominator used by the EscrowVault split logic. */
export const BPS_DENOMINATOR = 10_000;

/** Content-hash digest length the Odra contracts expect (`[u8; 32]`). */
export const HASH_BYTES = 32;
