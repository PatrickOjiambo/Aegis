import type { BaseLlm } from "@google/adk";

import { LlmAgent } from "@google/adk";

import { arbiterTools } from "./arbiter.tools.js";
import { DeepSeekLlm } from "./deepseek.llm.js";
import { ARBITER_SYSTEM_INSTRUCTION } from "./prompts.js";

let cachedModel: BaseLlm | undefined;

/** The DeepSeek-backed model powering the arbiter (lazy singleton). */
export function getArbiterModel(): BaseLlm {
  cachedModel ??= new DeepSeekLlm();
  return cachedModel;
}

/** Builds the arbiter ADK agent: DeepSeek reasoning + on-chain read tools. */
export function buildArbiterAgent(model: BaseLlm = getArbiterModel()): LlmAgent {
  return new LlmAgent({
    name: "aegis_arbiter",
    model,
    description: "Autonomous dispute arbiter that rules on escrowed agent payments and settles on-chain.",
    instruction: ARBITER_SYSTEM_INSTRUCTION,
    tools: arbiterTools,
  });
}
