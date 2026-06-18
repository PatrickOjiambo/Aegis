import type { VerdictRuling } from "../../domain/verdict.schema.js";

import { SettlementSchema } from "../../domain/escrow.schema.js";
import { logger } from "../../lib/logger.js";
import { syncDeal } from "../../orchestration/deal.orchestrator.js";
import { computeRationaleHash } from "../../services/casper/hash.js";
import { getCasperService } from "../../services/casper/index.js";
import { saveVerdict } from "../../services/persistence/index.js";
import { sendEnvelopeToAgent } from "../shared/a2a-client.js";

const log = logger.child({ component: "arbiter:settle" });

/**
 * Executes a verdict on-chain — the only path that moves disputed funds (NFR-4).
 * Records the rationale hash on settlement, persists the full ruling off-chain
 * (NFR-2/NFR-10), re-syncs the mirror, and notifies both parties over A2A.
 */
export async function executeSettlement(
  dealId: number,
  ruling: VerdictRuling,
): Promise<{ txHash: string; rationaleHash: string }> {
  const chain = getCasperService();
  const rationaleHash = computeRationaleHash(ruling.rationale);

  const settlement = SettlementSchema.parse({
    dealId,
    verdict: ruling.outcome,
    splitBps: ruling.splitBps,
    rationaleHash,
  });

  const { txHash } = await chain.settle(settlement);
  log.info({ dealId, outcome: ruling.outcome, splitBps: ruling.splitBps, txHash }, "Verdict settled on-chain");

  await saveVerdict({
    dealId,
    arbiter: chain.addressOf("arbiter"),
    ruling,
    rationaleHash,
    settleTxHash: txHash,
  });
  await syncDeal(dealId);
  await notifyParties(dealId, ruling, txHash);

  return { txHash, rationaleHash };
}

async function notifyParties(dealId: number, ruling: VerdictRuling, txHash: string): Promise<void> {
  const payload = { dealId, outcome: ruling.outcome, splitBps: ruling.splitBps, txHash };
  for (const role of ["buyer", "seller"] as const) {
    try {
      await sendEnvelopeToAgent(role, "verdict", payload);
    }
    catch (err) {
      log.warn({ err, role, dealId }, "Failed to notify party of verdict (non-fatal)");
    }
  }
}
