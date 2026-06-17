import type { MongoMemoryServer } from "mongodb-memory-server";

import mongoose from "mongoose";

/**
 * Starts an ephemeral in-memory MongoDB and connects Mongoose to it. Returns a
 * teardown function, or `null` if the binary could not be started (e.g. offline
 * CI) so the caller can skip the suite gracefully.
 */
export async function startInMemoryMongo(): Promise<(() => Promise<void>) | null> {
  let server: MongoMemoryServer;
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    server = await MongoMemoryServer.create();
  }
  catch {
    return null;
  }
  await mongoose.connect(server.getUri(), { dbName: "aegis-test" });
  return async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await server.stop();
  };
}
