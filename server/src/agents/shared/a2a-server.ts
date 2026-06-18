import type { AgentCard } from "@a2a-js/sdk";
import type { AgentExecutor } from "@a2a-js/sdk/server";
import type { RequestHandler } from "express";
import type { Server } from "node:http";

import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, restHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import express from "express";

import type { AgentRole } from "../../config/constants.js";

import { A2A_JSONRPC_PATH, A2A_REST_PATH, AGENT_CARD_PATH, AGENT_PORTS } from "../../config/constants.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ component: "a2a-server" });

export type A2AAgentHandle = {
  role: AgentRole;
  port: number;
  card: AgentCard;
  close: () => Promise<void>;
};

/**
 * Mounts an {@link AgentExecutor} as a standalone A2A HTTP server (Agent Card +
 * JSON-RPC + REST transports). Each Aegis agent gets its own port so the agents
 * genuinely discover and message one another over A2A.
 *
 * NOTE: `@a2a-js/sdk` ships its middleware typed against Express 4 while the
 * rest of the app runs Express 5; the two are wire-compatible. The casts below
 * isolate that single type-boundary to this helper.
 */
export async function startA2AAgent(params: {
  role: AgentRole;
  card: AgentCard;
  executor: AgentExecutor;
}): Promise<A2AAgentHandle> {
  const { role, card, executor } = params;
  const port = AGENT_PORTS[role];

  const requestHandler = new DefaultRequestHandler(card, new InMemoryTaskStore(), executor);

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(
    `/${AGENT_CARD_PATH}`,
    agentCardHandler({ agentCardProvider: requestHandler }) as unknown as RequestHandler,
  );
  app.use(
    A2A_JSONRPC_PATH,
    jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }) as unknown as RequestHandler,
  );
  app.use(
    A2A_REST_PATH,
    restHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }) as unknown as RequestHandler,
  );

  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(port, () => resolve(s));
    s.on("error", reject);
  });
  log.info({ role, port }, `A2A agent '${card.name}' listening`);

  return {
    role,
    port,
    card,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
