import express from "express";

import type MessageResponse from "../interfaces/message-response.js";

import agents from "./agents.routes.js";
import deals from "./deals.routes.js";
import health from "./health.routes.js";
import reputation from "./reputation.routes.js";

const router = express.Router();

router.get<object, MessageResponse>("/", (_req, res) => {
  res.json({ message: "Aegis API v1" });
});

router.use("/health", health);
router.use("/deals", deals);
router.use("/agents", agents);
router.use("/reputation", reputation);

export default router;
