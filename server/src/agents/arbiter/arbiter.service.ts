import type { VerdictRuling } from "../../domain/verdict.schema.js";

import { PreconditionError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { getCasperService } from "../../services/casper/index.js";
import { markArbiterDispatched } from "../../services/persistence/index.js";
import { buildArbiterAgent } from "./arbiter.agent.js";
import { runArbiterReasoning } from "./arbiter.runner.js";
import { executeSettlement } from "./settle.js";

const log = logger.child({ component: "arbiter" });

/** How the arbiter reaches a ruling — overridable so tests can stub the LLM. */
export type ReasoningFn = (dealId: number) => Promise<VerdictRuling>;

const defaultReasoning: ReasoningFn = dealId => runArbiterReasoning(buildArbiterAgent(), dealId);

/**
 * Reads the case (terms + evidence + escrow record), reasons to a verdict, and
 * settles on-chain (design §8.2 steps 3–6). Verifies the deal is genuinely ready
 * (Disputed, evidence window closed) before ruling.
 */
export async function adjudicate(
  dealId: number,
  opts: { reason?: ReasoningFn } = {},
): Promise<{ ruling: VerdictRuling; txHash: string; rationaleHash: string }> {
  const chain = getCasperService();
  const deal = await chain.getDeal(dealId);
  if (!deal)
    throw new PreconditionError(`Cannot adjudicate unknown deal ${dealId}`);
  if (deal.state !== "Disputed")
    throw new PreconditionError(`Deal ${dealId} is ${deal.state}, not Disputed`);
  // The evidence-window precondition is enforced authoritatively on-chain by
  // `settle` (it reverts with EvidenceWindowOpen); we don't duplicate the clock
  // off-chain so the chain remains the single source of timing truth.

  log.info({ dealId }, "Adjudicating dispute");
  const reason = opts.reason ?? defaultReasoning;
  const ruling = await reason(dealId);
  const { txHash, rationaleHash } = await executeSettlement(dealId, ruling);
  log.info({ dealId, outcome: ruling.outcome }, "Adjudication complete");
  return { ruling, txHash, rationaleHash };
}

/**
 * Dispatch guard used by the worker (and the arbiter executor): ensures a deal
 * is adjudicated exactly once. Returns the result, or null if already dispatched.
 */
export async function dispatchAdjudication(
  dealId: number,
  opts: { reason?: ReasoningFn } = {},
): Promise<{ ruling: VerdictRuling; txHash: string } | null> {
  const claimed = await markArbiterDispatched(dealId);
  if (!claimed) {
    log.debug({ dealId }, "Adjudication already dispatched; skipping");
    return null;
  }
  try {
    return await adjudicate(dealId, opts);
  }
  catch (err) {
    log.error({ err, dealId }, "Adjudication failed");
    throw err;
  }
}
