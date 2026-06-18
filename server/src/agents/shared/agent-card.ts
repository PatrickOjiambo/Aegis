import type { AgentCard, AgentSkill } from "@a2a-js/sdk";

import type { AgentRole } from "../../config/constants.js";

import { A2A_JSONRPC_PATH, A2A_REST_PATH, agentBaseUrl } from "../../config/constants.js";

export type AgentCardInput = {
  name: string;
  description: string;
  skills: AgentSkill[];
};

/**
 * Builds a spec-compliant A2A Agent Card (protocol v0.3.0) for one of the Aegis
 * agents. The card is served at `<baseUrl>/.well-known/agent-card.json` and is
 * how peers discover the agent's endpoint and capabilities.
 */
export function buildAgentCard(role: AgentRole, input: AgentCardInput): AgentCard {
  const baseUrl = agentBaseUrl(role);
  return {
    protocolVersion: "0.3.0",
    name: input.name,
    description: input.description,
    version: "0.1.0",
    url: `${baseUrl}${A2A_JSONRPC_PATH}`,
    preferredTransport: "JSONRPC",
    additionalInterfaces: [
      { url: `${baseUrl}${A2A_JSONRPC_PATH}`, transport: "JSONRPC" },
      { url: `${baseUrl}${A2A_REST_PATH}`, transport: "HTTP+JSON" },
    ],
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    skills: input.skills,
  };
}
