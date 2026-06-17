import type { DataPart, Message } from "@a2a-js/sdk";

import { randomUUID } from "node:crypto";

import type { A2AEnvelope, A2AMessageKind } from "../../domain/case.schema.js";

/**
 * Aegis routes structured messages between agents inside a single A2A
 * {@link DataPart} carrying an {@link A2AEnvelope} (`{ kind, payload }`), so one
 * endpoint can dispatch negotiate / case / verdict / appeal messages by `kind`.
 */
export function envelopeMessage(
  kind: A2AMessageKind,
  payload: unknown,
  opts: { role?: "user" | "agent"; contextId?: string } = {},
): Message {
  const part: DataPart = { kind: "data", data: { kind, payload } as Record<string, unknown> };
  return {
    kind: "message",
    messageId: randomUUID(),
    role: opts.role ?? "user",
    parts: [part],
    ...(opts.contextId ? { contextId: opts.contextId } : {}),
  };
}

/** Extracts the first Aegis envelope from a message's data parts, if present. */
export function extractEnvelope(message: Message): A2AEnvelope | null {
  for (const part of message.parts) {
    if (part.kind === "data" && part.data && typeof part.data === "object") {
      const data = part.data as Record<string, unknown>;
      if (typeof data.kind === "string" && "payload" in data)
        return { kind: data.kind as A2AMessageKind, payload: data.payload };
    }
  }
  return null;
}

/** Builds a plain text agent reply message. */
export function textReply(text: string, contextId?: string): Message {
  return {
    kind: "message",
    messageId: randomUUID(),
    role: "agent",
    parts: [{ kind: "text", text }],
    ...(contextId ? { contextId } : {}),
  };
}

/** Builds a structured agent reply carrying an envelope. */
export function envelopeReply(kind: A2AMessageKind, payload: unknown, contextId?: string): Message {
  return envelopeMessage(kind, payload, { role: "agent", ...(contextId ? { contextId } : {}) });
}
