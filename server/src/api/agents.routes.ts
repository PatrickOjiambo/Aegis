import express from "express";

import { listAgents } from "../agents/shared/registry.js";

const router = express.Router();

/** A2A agent directory (discovery). */
router.get("/", async (_req, res) => {
  res.json({ agents: await listAgents() });
});

export default router;
