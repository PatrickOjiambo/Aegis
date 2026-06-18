import type { AgentExecutor } from "@a2a-js/sdk/server";

import { CaseMessageSchema } from "../../domain/case.schema.js";
import { logger } from "../../lib/logger.js";
import { submitCaseMessage } from "../../orchestration/deal.orchestrator.js";
import { createEnvelopeExecutor } from "../shared/executor.js";

const log = logger.child({ component: "arbiter:a2a" });

/**
 * Arbiter A2A executor. Receives dispute case messages from the parties (design
 * §9.3) and stores them as claims. The actual ruling is triggered by the
 * lifecycle worker once the evidence window closes and both cases are present —
 * this keeps adjudication idempotent and independent of message-arrival order.
 */
export const arbiterExecutor: AgentExecutor = createEnvelopeExecutor({
  name: "Aegis Arbiter Agent",
  onEnvelope: async (envelope) => {
    if (envelope.kind !== "case")
      return { text: "arbiter: only 'case' messages are accepted here" };

    const parsed = CaseMessageSchema.safeParse(envelope.payload);
    if (!parsed.success)
      return { kind: "case", payload: { accepted: false, errors: parsed.error.issues } };

    await submitCaseMessage(parsed.data);
    log.info({ dealId: parsed.data.escrow_id, role: parsed.data.role }, "Accepted case message");
    return { kind: "case", payload: { accepted: true, dealId: parsed.data.escrow_id } };
  },
});
