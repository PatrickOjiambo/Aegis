import type { AgentCard } from "@a2a-js/sdk";
import type { AgentExecutor } from "@a2a-js/sdk/server";

import type { AgentRole } from "../config/constants.js";
import type { ChainActor } from "../services/casper/index.js";
import type { A2AAgentHandle } from "./shared/a2a-server.js";

import { logger } from "../lib/logger.js";
import { getCasperService } from "../services/casper/index.js";
import { appealCard } from "./appeal/appeal.card.js";
import { appealExecutor } from "./appeal/appeal.executor.js";
import { arbiterCard } from "./arbiter/arbiter.card.js";
import { arbiterExecutor } from "./arbiter/arbiter.executor.js";
import { buyerCard } from "./buyer/buyer.card.js";
import { buyerExecutor } from "./buyer/buyer.executor.js";
import { sellerCard } from "./seller/seller.card.js";
import { sellerExecutor } from "./seller/seller.executor.js";
import { startA2AAgent } from "./shared/a2a-server.js";
import { markAgentOffline, registerAgent } from "./shared/registry.js";

const log = logger.child({ component: "agents" });

type AgentDefinition = {
  role: AgentRole;
  card: AgentCard;
  executor: AgentExecutor;
  /** On-chain actor whose address this agent advertises (panel has none). */
  actor?: ChainActor;
  skills: string[];
};

const AGENT_DEFS: AgentDefinition[] = [
  { role: "buyer", card: buyerCard, executor: buyerExecutor, actor: "buyer", skills: ["open-deal", "raise-dispute"] },
  { role: "seller", card: sellerCard, executor: sellerExecutor, actor: "seller", skills: ["deliver", "defend-dispute"] },
  { role: "arbiter", card: arbiterCard, executor: arbiterExecutor, actor: "arbiter", skills: ["adjudicate-dispute"] },
  { role: "appeal", card: appealCard, executor: appealExecutor, skills: ["hear-appeal"] },
];

/** Starts every Aegis A2A agent server and registers it for discovery. */
export async function startAgents(): Promise<A2AAgentHandle[]> {
  const chain = getCasperService();
  const handles: A2AAgentHandle[] = [];

  for (const def of AGENT_DEFS) {
    const handle = await startA2AAgent({ role: def.role, card: def.card, executor: def.executor });
    await registerAgent({
      role: def.role,
      name: def.card.name,
      address: def.actor ? chain.addressOf(def.actor) : undefined,
      skills: def.skills,
    });
    handles.push(handle);
  }
  log.info({ count: handles.length }, "All A2A agents started and registered");
  return handles;
}

/** Stops all agents and marks them offline in the registry. */
export async function stopAgents(handles: A2AAgentHandle[]): Promise<void> {
  await Promise.allSettled(handles.map(async (h) => {
    await markAgentOffline(h.role);
    await h.close();
  }));
}
