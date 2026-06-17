import mongoose from "mongoose";

import { env } from "../env.js";
import { logger } from "./logger.js";

const log = logger.child({ component: "db" });

mongoose.set("strictQuery", true);

let connectPromise: Promise<typeof mongoose> | undefined;

/**
 * Connects to MongoDB (idempotent — repeated calls return the same connection).
 * Aegis uses transactions, which require a replica set; the bundled
 * `docker-compose.yml` provisions a single-node one for local development.
 */
export async function connectDb(): Promise<typeof mongoose> {
  if (connectPromise)
    return connectPromise;

  connectPromise = mongoose
    .connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
      autoIndex: env.NODE_ENV !== "production",
    })
    .then((m) => {
      log.info({ host: m.connection.host, db: m.connection.name }, "MongoDB connected");
      return m;
    });

  mongoose.connection.on("error", err => log.error({ err }, "MongoDB connection error"));
  mongoose.connection.on("disconnected", () => log.warn("MongoDB disconnected"));

  return connectPromise;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  connectPromise = undefined;
  log.info("MongoDB disconnected");
}

/** Runs `fn` inside a transaction, retrying on transient transaction errors. */
export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  }
  finally {
    await session.endSession();
  }
}

export { mongoose };
