import type { VerdictRuling } from "../../domain/verdict.schema.js";
import type { ReasoningFn } from "../arbiter/arbiter.service.js";

import { NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { getCasperService } from "../../services/casper/index.js";
import { getVerdict, markAppealed, markOverturned } from "../../services/persistence/index.js";
import { buildArbiterAgent } from "../arbiter/arbiter.agent.js";
import { runArbiterReasoning } from "../arbiter/arbiter.runner.js";

const log = logger.child({ component: "appeal" });

export type AppealResult = {
  dealId: number;
  overturned: boolean;
  originalOutcome: string;
  reheardOutcome: string;
  reheardRuling: VerdictRuling;
};

/**
 * Minimal appeal path (design §4.1 v1, spec §3). A second panel re-hears the
 * case; if its outcome differs from the original verdict, the first arbiter's
 * verdict is overturned and the overturn is recorded against its on-chain
 * reputation.
 *
 * On-chain re-settlement and stake slashing require the deferred ArbiterStake
 * contract (the EscrowVault `settle` leaves the deal terminal with
 * `appeal_deadline = 0` in the MVP), so they are intentionally out of scope
 * here — the accountability signal is the reputation overturn.
 */
export async function hearAppeal(
  dealId: number,
  opts: { reason?: ReasoningFn } = {},
): Promise<AppealResult> {
  const original = await getVerdict(dealId);
  if (!original)
    throw new NotFoundError(`No verdict to appeal for deal ${dealId}`);

  await markAppealed(dealId);
  log.info({ dealId, originalOutcome: original.outcome }, "Hearing appeal");

  const reason = opts.reason ?? (id => runArbiterReasoning(buildArbiterAgent(), id));
  const reheardRuling = await reason(dealId);

  const overturned = reheardRuling.outcome !== original.outcome;
  if (overturned) {
    await getCasperService().recordOverturn(original.arbiter);
    await markOverturned(
      dealId,
      `Re-heard outcome '${reheardRuling.outcome}' differs from original '${original.outcome}'`,
    );
    log.warn({ dealId, from: original.outcome, to: reheardRuling.outcome }, "Verdict overturned; arbiter slashed");
  }
  else {
    log.info({ dealId }, "Appeal upheld the original verdict");
  }

  return {
    dealId,
    overturned,
    originalOutcome: original.outcome,
    reheardOutcome: reheardRuling.outcome,
    reheardRuling,
  };
}
