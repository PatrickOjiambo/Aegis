import type MessageResponse from "./message-response.js";

type ErrorResponse = {
  /** Stable machine-readable error code (e.g. `VALIDATION_ERROR`). */
  code?: string;
  /** Structured error context (Zod issues, conflicting state, etc.). */
  details?: unknown;
  /** Stack trace — included outside production only. */
  stack?: string;
} & MessageResponse;
export default ErrorResponse;
