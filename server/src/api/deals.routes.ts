import express from "express";
import { z } from "zod";

import { hearAppeal } from "../agents/appeal/appeal.service.js";
import { adjudicate } from "../agents/arbiter/arbiter.service.js";
import { CaseMessageSchema } from "../domain/case.schema.js";
import { EvidenceItemSchema, PartyRoleSchema } from "../domain/evidence.schema.js";
import { MandateSchema } from "../domain/mandate.schema.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { validate } from "../middlewares.js";
import { DealModel } from "../models/deal.model.js";
import * as orchestrator from "../orchestration/deal.orchestrator.js";
import { getCasperService } from "../services/casper/index.js";
import {
  getCasesForDeal,
  getDealRecord,
  getEvidenceForDeal,
  getVerdict,
} from "../services/persistence/index.js";

const router = express.Router();

function dealIdParam(req: express.Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 0)
    throw new ValidationError("Invalid deal id");
  return id;
}

/** Open a new escrow deal for an agreed mandate (F1). */
router.post("/", validate("body", z.object({ mandate: MandateSchema })), async (req, res) => {
  const { mandate } = req.body as { mandate: z.infer<typeof MandateSchema> };
  const result = await orchestrator.openDeal({ mandate });
  res.status(201).json(result);
});

/** List recent deals (mirror). */
router.get("/", async (_req, res) => {
  const deals = await DealModel.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({ deals });
});

/** Fetch a single deal: off-chain mirror + authoritative on-chain state. */
router.get("/:id", async (req, res) => {
  const id = dealIdParam(req);
  const [record, onChain] = await Promise.all([getDealRecord(id), getCasperService().getDeal(id)]);
  if (!record && !onChain)
    throw new NotFoundError(`Deal ${id} not found`);
  res.json({ deal: record, onChain });
});

/** Seller marks the deliverable fulfilled with evidence (F3). */
router.post("/:id/fulfill", validate("body", z.object({ evidence: EvidenceItemSchema })), async (req, res) => {
  const id = dealIdParam(req);
  const { evidence } = req.body as { evidence: z.infer<typeof EvidenceItemSchema> };
  const txHash = await orchestrator.fulfillDeal({ dealId: id, evidence });
  res.json({ txHash });
});

/** A party raises a dispute (FR-5). */
router.post("/:id/dispute", validate("body", z.object({ role: PartyRoleSchema })), async (req, res) => {
  const id = dealIdParam(req);
  const { role } = req.body as { role: z.infer<typeof PartyRoleSchema> };
  const txHash = await orchestrator.raiseDispute({ dealId: id, role });
  res.json({ txHash });
});

/** A party submits an evidence item during the dispute window (FR-6). */
router.post(
  "/:id/evidence",
  validate("body", z.object({ role: PartyRoleSchema, item: EvidenceItemSchema })),
  async (req, res) => {
    const id = dealIdParam(req);
    const { role, item } = req.body as { role: z.infer<typeof PartyRoleSchema>; item: z.infer<typeof EvidenceItemSchema> };
    const txHash = await orchestrator.submitEvidence({ dealId: id, role, item });
    res.json({ txHash });
  },
);

/** Submit a dispute case message (design §9.4) — normally sent agent-to-agent. */
router.post("/:id/case", validate("body", CaseMessageSchema), async (req, res) => {
  const id = dealIdParam(req);
  const message = { ...(req.body as z.infer<typeof CaseMessageSchema>), escrow_id: id };
  await orchestrator.submitCaseMessage(message);
  res.status(201).json({ accepted: true });
});

/** Happy-path auto-release (FR-4). */
router.post("/:id/release", async (req, res) => {
  const id = dealIdParam(req);
  const txHash = await orchestrator.claimRelease(id);
  res.json({ txHash });
});

/** Manually trigger adjudication (the worker does this automatically). */
router.post("/:id/adjudicate", async (req, res) => {
  const id = dealIdParam(req);
  const result = await adjudicate(id);
  res.json(result);
});

/** Appeal a settled verdict (F7). */
router.post("/:id/appeal", async (req, res) => {
  const id = dealIdParam(req);
  const result = await hearAppeal(id);
  res.json(result);
});

/** Case messages, evidence and the verdict for a deal. */
router.get("/:id/cases", async (req, res) => {
  res.json({ cases: await getCasesForDeal(dealIdParam(req)) });
});
router.get("/:id/evidence", async (req, res) => {
  res.json({ evidence: await getEvidenceForDeal(dealIdParam(req)) });
});
router.get("/:id/verdict", async (req, res) => {
  const verdict = await getVerdict(dealIdParam(req));
  if (!verdict)
    throw new NotFoundError("No verdict for this deal");
  res.json({ verdict });
});

export default router;
