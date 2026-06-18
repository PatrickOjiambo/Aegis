import type { LlmAgent } from "@google/adk";

import { InMemoryRunner, isFinalResponse } from "@google/adk";

import type { VerdictRuling } from "../../domain/verdict.schema.js";

import { VerdictRulingSchema } from "../../domain/verdict.schema.js";
import { UpstreamError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { arbiterTaskPrompt } from "./prompts.js";

const log = logger.child({ component: "arbiter:runner" });

/**
 * Runs the arbiter agent over a deal and returns its validated structured
 * ruling. The agent uses its tools to gather and verify facts; the final text
 * is parsed and checked against {@link VerdictRulingSchema} before it can drive
 * a settlement.
 */
export async function runArbiterReasoning(agent: LlmAgent, dealId: number): Promise<VerdictRuling> {
  const runner = new InMemoryRunner({ agent, appName: "aegis-arbiter" });

  let finalText = "";
  for await (const event of runner.runEphemeral({
    userId: "aegis",
    newMessage: { role: "user", parts: [{ text: arbiterTaskPrompt(dealId) }] },
  })) {
    const text = event.content?.parts?.map(p => p.text ?? "").join("") ?? "";
    if (text && (isFinalResponse(event) || !finalText))
      finalText = text;
  }

  if (!finalText)
    throw new UpstreamError("Arbiter produced no response");

  return parseVerdict(finalText);
}

/** Extracts and validates the JSON verdict from the model's final message. */
export function parseVerdict(text: string): VerdictRuling {
  const json = extractJsonObject(text);
  if (!json)
    throw new UpstreamError("Arbiter response did not contain a JSON verdict", { text });

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  }
  catch (err) {
    throw new UpstreamError("Arbiter verdict was not valid JSON", { cause: String(err), json });
  }

  const result = VerdictRulingSchema.safeParse(parsed);
  if (!result.success) {
    log.warn({ issues: result.error.issues }, "Arbiter verdict failed schema validation");
    throw new UpstreamError("Arbiter verdict failed schema validation", { issues: result.error.issues });
  }
  return result.data;
}

/** Returns the first balanced JSON object substring (tolerates code fences/prose). */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1)
    return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped)
        escaped = false;
      else if (ch === "\\")
        escaped = true;
      else if (ch === "\"")
        inString = false;
      continue;
    }
    if (ch === "\"")
      inString = true;
    else if (ch === "{")
      depth++;
    else if (ch === "}" && --depth === 0)
      return text.slice(start, i + 1);
  }
  return null;
}
