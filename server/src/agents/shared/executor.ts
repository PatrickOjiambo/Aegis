import type { AgentExecutor, ExecutionEventBus, RequestContext } from "@a2a-js/sdk/server";

import type { A2AEnvelope, A2AMessageKind } from "../../domain/case.schema.js";

import { logger } from "../../lib/logger.js";
import { envelopeReply, extractEnvelope, textReply } from "./messaging.js";

const log = logger.child({ component: "executor" });

/** A handler's reply: a structured envelope, plain text, or nothing (ack). */
export type EnvelopeReply
  = | { kind: A2AMessageKind; payload: unknown }
    | { text: string }
    | void;

export type EnvelopeExecutorOptions = {
  name: string;
  /** Handles a decoded Aegis envelope; return a reply or void to ack. */
  onEnvelope?: (envelope: A2AEnvelope, ctx: RequestContext) => Promise<EnvelopeReply> | EnvelopeReply;
  /** Handles a plain text message (no envelope). */
  onText?: (text: string, ctx: RequestContext) => Promise<EnvelopeReply> | EnvelopeReply;
};

/**
 * Builds an {@link AgentExecutor} that decodes the incoming Aegis envelope,
 * dispatches it to a handler, and publishes the handler's reply as an A2A
 * message. Errors are caught and returned as a structured error reply so a
 * misbehaving peer never crashes the agent.
 */
export function createEnvelopeExecutor(options: EnvelopeExecutorOptions): AgentExecutor {
  return {
    async execute(ctx: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
      const { userMessage } = ctx;
      const contextId = userMessage.contextId;
      try {
        const envelope = extractEnvelope(userMessage);
        let reply: EnvelopeReply;
        if (envelope) {
          reply = await options.onEnvelope?.(envelope, ctx);
        }
        else {
          const text = userMessage.parts.find(p => p.kind === "text");
          reply = await options.onText?.(text && text.kind === "text" ? text.text : "", ctx);
        }

        if (reply && "kind" in reply)
          eventBus.publish(envelopeReply(reply.kind, reply.payload, contextId));
        else if (reply && "text" in reply)
          eventBus.publish(textReply(reply.text, contextId));
        else
          eventBus.publish(textReply(`${options.name}: acknowledged`, contextId));
      }
      catch (err) {
        log.error({ err, agent: options.name }, "Executor handler failed");
        eventBus.publish(envelopeReply("verdict", { error: String(err) }, contextId));
      }
      finally {
        eventBus.finished();
      }
    },
    async cancelTask(): Promise<void> {
      // Aegis agents complete synchronously; nothing long-running to cancel.
    },
  };
}
