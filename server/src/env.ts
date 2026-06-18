import process from "node:process";
import { z } from "zod";

/**
 * Centralised, type-safe configuration.
 *
 * Every value the backend reads from the environment is declared and validated
 * here exactly once. Secrets needed only for live on-chain / LLM operation are
 * optional so the API and the test-suite can boot without them; the services
 * that consume them fail loudly (with a clear message) at point of use when a
 * required value is missing. See `CHAIN_MODE` for how on-chain calls are mocked.
 */
const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform(v => v === "true" || v === "1");

const envSchema = z.object({
  // ---- Runtime ----
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // ---- HTTP API ----
  PORT: z.coerce.number().int().positive().default(3000),
  /** Public scheme+host the agents advertise in their A2A Agent Cards. */
  PUBLIC_HOST: z.string().default("http://localhost"),

  // ---- A2A agent ports (each agent is its own HTTP server) ----
  BUYER_A2A_PORT: z.coerce.number().int().positive().default(41241),
  SELLER_A2A_PORT: z.coerce.number().int().positive().default(41242),
  ARBITER_A2A_PORT: z.coerce.number().int().positive().default(41243),
  APPEAL_A2A_PORT: z.coerce.number().int().positive().default(41244),

  // ---- Database ----
  MONGODB_URI: z
    .string()
    .default("mongodb://localhost:27017/aegis?replicaSet=rs0&directConnection=true"),

  // ---- Casper chain ----
  /**
   * `real`  → submit/read against a live node via casper-js-sdk.
   * `mock`  → deterministic in-memory chain (no node, no keys). Default off-prod.
   */
  CHAIN_MODE: z.enum(["real", "mock"]).optional(),
  CASPER_NODE_RPC_URL: z.string().default("http://localhost:11101/rpc"),
  CASPER_NETWORK_NAME: z.string().default("casper-test"),
  ESCROW_CONTRACT_HASH: z.string().optional(),
  REPUTATION_CONTRACT_HASH: z.string().optional(),
  /** Session wasm that wraps the payable x402 deposit into escrow. */
  PROXY_WASM_PATH: z.string().optional(),

  // ---- Signing keys (PEM secret-key file paths) ----
  ARBITER_SECRET_KEY_PATH: z.string().optional(),
  BUYER_SECRET_KEY_PATH: z.string().optional(),
  SELLER_SECRET_KEY_PATH: z.string().optional(),

  // ---- Arbiter LLM (DeepSeek, OpenAI-compatible) ----
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-pro"),
  /** Lower = more deterministic verdicts. */
  ARBITER_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),

  // ---- Lifecycle windows / timeouts (milliseconds) ----
  REVIEW_WINDOW_MS: z.coerce.number().int().positive().default(259_200_000), // 3 days
  EVIDENCE_WINDOW_MS: z.coerce.number().int().positive().default(86_400_000), // 1 day
  /** Hard cap after evidence deadline before timeout_refund fires. */
  SAFETY_GRACE_MS: z.coerce.number().int().positive().default(3_600_000), // 1 hour
  APPEAL_WINDOW_MS: z.coerce.number().int().positive().default(86_400_000), // 1 day
  /** How often the lifecycle worker polls for due actions. */
  WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  /** Set to disable the background lifecycle worker (e.g. in tests). */
  WORKER_ENABLED: booleanish.default(true),
  /** Set to disable booting the A2A agent servers (e.g. API-only deploys). */
  AGENTS_ENABLED: booleanish.default(true),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // eslint-disable-next-line node/no-process-env
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  const env = parsed.data;
  // Default CHAIN_MODE: real only in production, mock otherwise.
  if (!env.CHAIN_MODE) {
    env.CHAIN_MODE = env.NODE_ENV === "production" ? "real" : "mock";
  }
  return env;
}

export const env: Env = loadEnv();

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
