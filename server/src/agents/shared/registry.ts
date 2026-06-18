import type { AgentRole } from "../../config/constants.js";
import type { AgentDoc } from "../../models/agent.model.js";

import { agentBaseUrl } from "../../config/constants.js";
import { NotFoundError } from "../../lib/errors.js";
import { AgentModel } from "../../models/agent.model.js";

export type RegisterAgentInput = {
  role: AgentRole;
  name: string;
  address?: string;
  skills: string[];
};

/**
 * A2A agent discovery, backed by the `agents` collection. Each agent registers
 * its role, advertised base URL and on-chain identity on startup; peers resolve
 * one another here (and `/api/v1/agents` exposes the directory).
 */
export async function registerAgent(input: RegisterAgentInput): Promise<AgentDoc> {
  const baseUrl = agentBaseUrl(input.role);
  const doc = await AgentModel.findOneAndUpdate(
    { role: input.role },
    {
      $set: {
        name: input.name,
        baseUrl,
        address: input.address,
        skills: input.skills,
        online: true,
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true },
  ).lean<AgentDoc>();
  return doc!;
}

export async function markAgentOffline(role: AgentRole): Promise<void> {
  await AgentModel.updateOne({ role }, { $set: { online: false } });
}

export async function listAgents(): Promise<AgentDoc[]> {
  return AgentModel.find().lean<AgentDoc[]>();
}

export async function getAgent(role: AgentRole): Promise<AgentDoc | null> {
  return AgentModel.findOne({ role }).lean<AgentDoc>();
}

/** Resolves a peer's advertised base URL, falling back to the configured port. */
export async function resolveAgentBaseUrl(role: AgentRole): Promise<string> {
  const agent = await getAgent(role);
  if (agent?.baseUrl)
    return agent.baseUrl;
  // Fallback keeps in-process bootstrapping working before registration lands.
  return agentBaseUrl(role);
}

/** Resolves a peer's on-chain address from the registry. */
export async function resolveAgentAddress(role: AgentRole): Promise<string> {
  const agent = await getAgent(role);
  if (!agent?.address)
    throw new NotFoundError(`No on-chain address registered for ${role} agent`);
  return agent.address;
}
