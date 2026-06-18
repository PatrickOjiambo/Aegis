import { pino } from "pino";

import { env, isProd } from "../env.js";

/**
 * Structured application logger. Pretty in development, JSON in production.
 * Use `logger.child({ component: "..." })` to scope logs per subsystem.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
});

export type Logger = typeof logger;
