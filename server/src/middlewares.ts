import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

import { ZodError } from "zod";

import type ErrorResponse from "./interfaces/error-response.js";

import { isProd } from "./env.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";

const log = logger.child({ component: "http" });

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, "NOT_FOUND", `Not Found - ${req.method} ${req.originalUrl}`));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<ErrorResponse>,

  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Request validation failed",
      code: "VALIDATION_ERROR",
      details: err.issues,
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500)
      log.error({ err }, err.message);
    res.status(err.statusCode).json({
      message: err.message,
      code: err.code,
      details: err.details,
      ...(isProd ? {} : { stack: err.stack }),
    });
    return;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  log.error({ err: error }, "Unhandled error");
  res.status(500).json({
    message: isProd ? "Internal Server Error" : error.message,
    code: "INTERNAL_ERROR",
    ...(isProd ? {} : { stack: error.stack }),
  });
}

/** What part of the request a {@link validate} schema targets. */
type RequestPart = "body" | "query" | "params";

/**
 * Returns middleware that validates and replaces `req[part]` with the parsed,
 * typed value. Forwards a `ZodError` (rendered as 400) to the error handler.
 */
export function validate(part: RequestPart, schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // query/params are read-only getters in Express 5; assign via defineProperty.
    Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true });
    next();
  };
}
