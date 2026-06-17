import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import type MessageResponse from "./interfaces/message-response.js";

import api from "./api/index.js";
import { logger } from "./lib/logger.js";
import * as middlewares from "./middlewares.js";

const app = express();

app.use(pinoHttp({ logger, autoLogging: { ignore: req => req.url === "/health" } }));
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get<object, MessageResponse>("/", (_req, res) => {
  res.json({ message: "Aegis — recourse for the machine economy, built on Casper." });
});

app.use("/api/v1", api);

app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

export default app;
