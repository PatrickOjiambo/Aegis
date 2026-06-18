import type { CaseMessage, RequestedOutcome } from "../../domain/case.schema.js";
import type { EvidenceItem, PartyRole } from "../../domain/evidence.schema.js";

import { CaseMessageSchema } from "../../domain/case.schema.js";
import { logger } from "../../lib/logger.js";
import { sendEnvelopeToAgent } from "./a2a-client.js";

const log = logger.child({ component: "case" });

/** Builds a validated dispute case message (design §9.4). */
export function buildCaseMessage(input: {
  dealId: number;
  role: PartyRole;
  claim: string;
  requestedOutcome: RequestedOutcome;
  evidence: EvidenceItem[];
  signature?: string;
}): CaseMessage {
  return CaseMessageSchema.parse({
    escrow_id: input.dealId,
    role: input.role,
    claim: input.claim,
    evidence: input.evidence,
    requested_outcome: input.requestedOutcome,
    signature: input.signature,
  });
}

/**
 * A disputing party sends its case message to the arbiter over A2A. The arbiter
 * treats it as a claim and verifies every asserted fact on-chain (design §9.2).
 */
export async function sendCaseToArbiter(message: CaseMessage): Promise<void> {
  await sendEnvelopeToAgent("arbiter", "case", message);
  log.info({ dealId: message.escrow_id, role: message.role }, "Case message sent to arbiter");
}
