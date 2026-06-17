import { dispatchAdjudication } from "../agents/arbiter/arbiter.service.js";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import {
  findDealsAwaitingArbiter,
  findDealsForSafetyRefund,
  findDealsReadyForRelease,
} from "../services/persistence/index.js";
import { claimRelease, timeoutRefund } from "./deal.orchestrator.js";

const log = logger.child({ component: "worker" });

/**
 * Background lifecycle worker. On each tick it advances any deal whose deadline
 * has passed:
 *  - Fulfilled + review window elapsed, undisputed → auto-release (FR-4).
 *  - Disputed + evidence window closed → dispatch to the arbiter (FR-7/8).
 *  - Disputed + past the hard safety cap → timeout refund (NFR-6 liveness).
 *
 * Each action is independently guarded and errors are isolated so one stuck
 * deal never blocks the others.
 */
export function createLifecycleWorker() {
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  async function tick(now = Date.now()): Promise<void> {
    if (running)
      return;
    running = true;
    try {
      await Promise.allSettled([
        releaseDue(now),
        dispatchDue(now),
        refundDue(now),
      ]);
    }
    finally {
      running = false;
    }
  }

  async function releaseDue(now: number): Promise<void> {
    const deals = await findDealsReadyForRelease(now);
    for (const deal of deals)
      await guard(`auto-release ${deal.dealId}`, () => claimRelease(deal.dealId));
  }

  async function dispatchDue(now: number): Promise<void> {
    const deals = await findDealsAwaitingArbiter(now);
    for (const deal of deals)
      await guard(`adjudicate ${deal.dealId}`, () => dispatchAdjudication(deal.dealId));
  }

  async function refundDue(now: number): Promise<void> {
    const deals = await findDealsForSafetyRefund(now, env.SAFETY_GRACE_MS);
    for (const deal of deals)
      await guard(`safety-refund ${deal.dealId}`, () => timeoutRefund(deal.dealId));
  }

  function start(): void {
    if (timer)
      return;
    timer = setInterval(() => void tick(), env.WORKER_INTERVAL_MS);
    timer.unref?.();
    log.info({ intervalMs: env.WORKER_INTERVAL_MS }, "Lifecycle worker started");
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
      log.info("Lifecycle worker stopped");
    }
  }

  return { start, stop, tick };
}

async function guard(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  }
  catch (err) {
    log.warn({ err, label }, "Lifecycle action failed (isolated)");
  }
}
