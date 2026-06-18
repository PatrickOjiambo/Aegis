import type { AgentExecutor } from "@a2a-js/sdk/server";

import { logger } from "../../lib/logger.js";
import { createEnvelopeExecutor } from "../shared/executor.js";

const log = logger.child({ component: "buyer" });

/**
 * Buyer A2A executor. Handles term negotiation with the seller and verdict
 * notifications from the arbiter. Money-moving actions are driven through the
 * buyer's tools / the orchestrator, not free-form messages.
 */
export const buyerExecutor: AgentExecutor = createEnvelopeExecutor({
  name: "Aegis Buyer Agent",
  onEnvelope: (envelope) => {
    switch (envelope.kind) {
      case "negotiate":
        return { kind: "negotiate", payload: { accepted: true } };
      case "verdict":
        log.info({ verdict: envelope.payload }, "Received verdict notification from arbiter");
        return { text: "verdict acknowledged" };
      default:
        return { text: "buyer: acknowledged" };
    }
  },
});
