import type { Message } from "@a2a-js/sdk";
import type { Client } from "@a2a-js/sdk/client";

import { ClientFactory } from "@a2a-js/sdk/client";

import type { AgentRole } from "../../config/constants.js";
import type { A2AMessageKind } from "../../domain/case.schema.js";

import { UpstreamError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { envelopeMessage, extractEnvelope } from "./messaging.js";
import { resolveAgentBaseUrl } from "./registry.js";

const log = logger.child({ component: "a2a-client" });

const factory = new ClientFactory();

/** Caches one client per peer base URL. */
const clientCache = new Map<string, Promise<Client>>();

async function clientFor(baseUrl: string): Promise<Client> {
  let pending = clientCache.get(baseUrl);
  if (!pending) {
    pending = factory.createFromUrl(baseUrl);
    clientCache.set(baseUrl, pending);
  }
  return pending;
}

/** Resolves and connects to a peer agent by role (via the registry). */
export async function connectToAgent(role: AgentRole): Promise<Client> {
  const baseUrl = await resolveAgentBaseUrl(role);
  return clientFor(baseUrl);
}

/**
 * Sends a structured Aegis envelope to a peer agent and returns the parsed
 * response payload (or the raw text, if the peer replied with text).
 */
export async function sendEnvelopeToAgent(
  role: AgentRole,
  kind: A2AMessageKind,
  payload: unknown,
): Promise<{ kind?: A2AMessageKind; payload?: unknown; text?: string }> {
  const client = await connectToAgent(role);
  let result;
  try {
    result = await client.sendMessage({ message: envelopeMessage(kind, payload) });
  }
  catch (err) {
    throw new UpstreamError(`A2A send to '${role}' failed`, { cause: String(err) });
  }

  // A direct message response (non-task) is the common case for Aegis agents.
  const message = (result as { kind?: string }).kind === "message" ? (result as Message) : undefined;
  if (!message) {
    log.debug({ role, kind }, "Peer returned a task; no inline message payload");
    return {};
  }

  const envelope = extractEnvelope(message);
  if (envelope)
    return { kind: envelope.kind, payload: envelope.payload };

  const text = message.parts.find(p => p.kind === "text");
  return { text: text && text.kind === "text" ? text.text : undefined };
}
