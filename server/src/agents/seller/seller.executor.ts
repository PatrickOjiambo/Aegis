import type { AgentExecutor } from "@a2a-js/sdk/server";

import { logger } from "../../lib/logger.js";
import { createEnvelopeExecutor } from "../shared/executor.js";

const log = logger.child({ component: "seller" });

/**
 * Seller A2A executor. Accepts negotiation and verdict notifications. Delivery
 * and dispute-defence actions are driven through the seller's tools.
 */
export const sellerExecutor: AgentExecutor = createEnvelopeExecutor({
  name: "Aegis Seller Agent",
  onEnvelope: (envelope) => {
    switch (envelope.kind) {
      case "negotiate":
        return { kind: "negotiate", payload: { accepted: true } };
      case "verdict":
        log.info({ verdict: envelope.payload }, "Received verdict notification from arbiter");
        return { text: "verdict acknowledged" };
      default:
        return { text: "seller: acknowledged" };
    }
  },
});
