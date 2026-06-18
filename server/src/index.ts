import type { Server } from "node:http";

import process from "node:process";

import { startAgents, stopAgents } from "./agents/index.js";
import app from "./app.js";
import { env } from "./env.js";
import { connectDb, disconnectDb } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { createLifecycleWorker } from "./orchestration/lifecycle.worker.js";
import { getCasperService } from "./services/casper/index.js";

const log = logger.child({ component: "bootstrap" });

const shutdownHandlers: Array<() => Promise<void> | void> = [];

async function main(): Promise<void> {
  await connectDb();

  // Construct the chain service eagerly so configuration errors surface at boot.
  const chain = getCasperService();
  log.info({ chainMode: chain.mode }, "Casper service ready");

  if (env.AGENTS_ENABLED) {
    const handles = await startAgents();
    shutdownHandlers.push(() => stopAgents(handles));
  }

  if (env.WORKER_ENABLED) {
    const worker = createLifecycleWorker();
    worker.start();
    shutdownHandlers.push(() => worker.stop());
  }

  const server: Server = app.listen(env.PORT, () => {
    log.info(`Aegis API listening on http://localhost:${env.PORT}`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE")
      log.fatal(`Port ${env.PORT} is already in use.`);
    else
      log.fatal({ err }, "Failed to start HTTP server");
    process.exit(1);
  });
  shutdownHandlers.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  shutdownHandlers.push(disconnectDb);
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown)
    return;
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down...`);
  for (const handler of shutdownHandlers.reverse()) {
    try {
      await handler();
    }
    catch (err) {
      log.error({ err }, "Error during shutdown");
    }
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((err) => {
  log.fatal({ err }, "Fatal error during startup");
  process.exit(1);
});
