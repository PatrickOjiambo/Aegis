import type { AgentExecutor } from "@a2a-js/sdk/server";

import { z } from "zod";

import { logger } from "../../lib/logger.js";
import { createEnvelopeExecutor } from "../shared/executor.js";
import { hearAppeal } from "./appeal.service.js";

const log = logger.child({ component: "appeal:a2a" });

const AppealRequestSchema = z.object({ dealId: z.number().int().nonnegative() });

/**
 * Appeal Panel A2A executor. A party submits an `appeal` envelope referencing a
 * settled deal; the panel re-hears it and reports whether the verdict stood.
 */
export const appealExecutor: AgentExecutor = createEnvelopeExecutor({
  name: "Aegis Appeal Panel",
  onEnvelope: async (envelope) => {
    if (envelope.kind !== "appeal")
      return { text: "appeal panel: only 'appeal' messages are accepted here" };

    const parsed = AppealRequestSchema.safeParse(envelope.payload);
    if (!parsed.success)
      return { kind: "appeal", payload: { accepted: false, errors: parsed.error.issues } };

    const result = await hearAppeal(parsed.data.dealId);
    log.info({ dealId: result.dealId, overturned: result.overturned }, "Appeal heard");
    return { kind: "appeal", payload: result };
  },
});
