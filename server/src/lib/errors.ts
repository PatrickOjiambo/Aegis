/**
 * Application error hierarchy. Every operational failure the API can produce is
 * one of these, carrying an HTTP status and a stable machine-readable `code`.
 * The Express error handler (`src/middlewares.ts`) renders them uniformly.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super(404, "NOT_FOUND", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}

/** A precondition for an on-chain/agent action was not met (wrong state, etc.). */
export class PreconditionError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, "PRECONDITION_FAILED", message, details);
  }
}

/** A required piece of configuration (key, contract hash, API key) is absent. */
export class ConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super(500, "CONFIG_ERROR", message, details);
  }
}

/** A downstream dependency (chain node, LLM, peer agent) failed. */
export class UpstreamError extends AppError {
  constructor(message: string, details?: unknown) {
    super(502, "UPSTREAM_ERROR", message, details);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
