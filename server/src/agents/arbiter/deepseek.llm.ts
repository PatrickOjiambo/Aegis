import type { LlmRequest, LlmResponse } from "@google/adk";
import type { Content, FunctionDeclaration, Part, Schema } from "@google/genai";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import { BaseLlm } from "@google/adk";
import OpenAI from "openai";

import { env } from "../../env.js";
import { ConfigError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ component: "deepseek" });

/**
 * ADK model adapter for DeepSeek (OpenAI-compatible API).
 *
 * ADK has no built-in non-Gemini provider, so this `BaseLlm` translates ADK's
 * genai-format requests (system instruction, multi-part contents, function
 * declarations, tool results) to the OpenAI Chat Completions schema DeepSeek
 * speaks, and maps the response — including tool calls — back to a genai
 * `Content`. This lets the arbiter reason with DeepSeek while keeping ADK's
 * agent / tool / runner machinery.
 */
export class DeepSeekLlm extends BaseLlm {
  private readonly client: OpenAI;
  private readonly temperature: number;

  constructor(model: string = env.DEEPSEEK_MODEL) {
    super({ model });
    if (!env.DEEPSEEK_API_KEY)
      throw new ConfigError("DEEPSEEK_API_KEY is required to use the DeepSeek arbiter model");
    this.client = new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: env.DEEPSEEK_BASE_URL });
    this.temperature = env.ARBITER_TEMPERATURE;
  }

  static override readonly supportedModels: Array<string | RegExp> = [/^deepseek-.*/];

  override async* generateContentAsync(
    llmRequest: LlmRequest,
    _stream = false,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<LlmResponse, void> {
    const messages = toOpenAiMessages(llmRequest);
    const tools = toOpenAiTools(llmRequest);

    let completion;
    try {
      completion = await this.client.chat.completions.create(
        {
          model: this.model,
          messages,
          temperature: this.temperature,
          ...(tools.length ? { tools, tool_choice: "auto" } : {}),
        },
        { signal: abortSignal },
      );
    }
    catch (err) {
      log.error({ err }, "DeepSeek request failed");
      yield { errorCode: "UPSTREAM_ERROR", errorMessage: String(err) } satisfies LlmResponse;
      return;
    }

    const choice = completion.choices[0];
    const message = choice?.message;
    const parts: Part[] = [];

    if (message?.tool_calls?.length) {
      for (const call of message.tool_calls) {
        if (call.type !== "function")
          continue;
        parts.push({
          functionCall: {
            id: call.id,
            name: call.function.name,
            args: safeParseArgs(call.function.arguments),
          },
        });
      }
    }
    if (message?.content)
      parts.push({ text: message.content });
    if (parts.length === 0)
      parts.push({ text: "" });

    const content: Content = { role: "model", parts };
    yield {
      content,
      turnComplete: true,
      ...(completion.usage
        ? {
            usageMetadata: {
              promptTokenCount: completion.usage.prompt_tokens,
              candidatesTokenCount: completion.usage.completion_tokens,
              totalTokenCount: completion.usage.total_tokens,
            },
          }
        : {}),
    } satisfies LlmResponse;
  }

  override async connect(): Promise<never> {
    throw new ConfigError("DeepSeek adapter does not support live (bidi) connections");
  }
}

// ---- genai → OpenAI translation ----

function toOpenAiMessages(req: LlmRequest): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  const system = systemInstructionText(req);
  if (system)
    messages.push({ role: "system", content: system });

  for (const content of req.contents ?? []) {
    const role = content.role === "model" ? "assistant" : "user";
    const toolCalls: ChatCompletionMessageFunctionToolCall[] = [];
    const toolResults: ChatCompletionMessageParam[] = [];
    let text = "";

    for (const part of content.parts ?? []) {
      if (part.text) {
        text += part.text;
      }
      else if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.id ?? part.functionCall.name ?? "call",
          type: "function",
          function: {
            name: part.functionCall.name ?? "",
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
        });
      }
      else if (part.functionResponse) {
        toolResults.push({
          role: "tool",
          tool_call_id: part.functionResponse.id ?? part.functionResponse.name ?? "call",
          content: JSON.stringify(part.functionResponse.response ?? {}),
        });
      }
    }

    if (role === "assistant" && toolCalls.length) {
      messages.push({ role: "assistant", content: text || null, tool_calls: toolCalls });
    }
    else if (text) {
      messages.push({ role, content: text });
    }
    messages.push(...toolResults);
  }

  return messages;
}

function systemInstructionText(req: LlmRequest): string | undefined {
  const si = req.config?.systemInstruction;
  if (!si)
    return undefined;
  if (typeof si === "string")
    return si;
  if (Array.isArray(si))
    return si.map((p: unknown) => (typeof p === "string" ? p : (p as Part).text ?? "")).join("\n");
  return (si as Content).parts?.map(p => p.text ?? "").join("\n");
}

function toOpenAiTools(req: LlmRequest): ChatCompletionTool[] {
  const tools: ChatCompletionTool[] = [];
  for (const tool of req.config?.tools ?? []) {
    const declarations = (tool as { functionDeclarations?: FunctionDeclaration[] }).functionDeclarations;
    for (const decl of declarations ?? []) {
      if (!decl.name)
        continue;
      tools.push({
        type: "function",
        function: {
          name: decl.name,
          description: decl.description ?? "",
          parameters: (decl.parametersJsonSchema as Record<string, unknown> | undefined)
            ?? genaiSchemaToJsonSchema(decl.parameters)
            ?? { type: "object", properties: {} },
        },
      });
    }
  }
  return tools;
}

/** Converts a genai `Schema` (uppercase OpenAPI types) to JSON Schema. */
function genaiSchemaToJsonSchema(schema?: Schema): Record<string, unknown> | undefined {
  if (!schema)
    return undefined;
  const out: Record<string, unknown> = {};
  if (schema.type)
    out.type = String(schema.type).toLowerCase();
  if (schema.description)
    out.description = schema.description;
  if (schema.enum)
    out.enum = schema.enum;
  if (schema.format)
    out.format = schema.format;
  if (schema.items)
    out.items = genaiSchemaToJsonSchema(schema.items);
  if (schema.required)
    out.required = schema.required;
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, genaiSchemaToJsonSchema(v)]),
    );
  }
  return out;
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  catch {
    return {};
  }
}
