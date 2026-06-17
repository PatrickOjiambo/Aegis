import express from "express";

import { getCasperService } from "../services/casper/index.js";

const router = express.Router();

/** Read a participant's on-chain reputation score (F8, publicly readable). */
router.get("/:address", async (req, res) => {
  const score = await getCasperService().getScore(req.params.address);
  res.json({ address: req.params.address, score });
});

export default router;
