import express from "express";

import { mongoose } from "../lib/db.js";

const router = express.Router();

/** Liveness + dependency readiness probe. */
router.get("/", (_req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  res.json({
    status: "ok",
    uptime: process.uptime(),
    db: dbState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

export default router;
