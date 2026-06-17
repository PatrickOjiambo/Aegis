import type { HydratedDocument, Model } from "mongoose";

import { model, Schema } from "mongoose";

import type { AgentRole } from "../config/constants.js";

import { AGENT_ROLES } from "../config/constants.js";

/**
 * Registry entry for a discoverable A2A agent. Powers `/api/v1/agents` and lets
 * agents resolve one another's Agent Card URLs (A2A discovery).
 */
export type AgentDoc = {
  role: AgentRole;
  name: string;
  /** Base URL serving the agent's `.well-known/agent-card.json`. */
  baseUrl: string;
  /** On-chain identity (public key / account hash) this agent signs with. */
  address?: string;
  skills: string[];
  online: boolean;
  lastSeenAt: Date;
};

export type AgentDocument = HydratedDocument<AgentDoc>;

const agentSchema = new Schema<AgentDoc>(
  {
    role: { type: String, enum: AGENT_ROLES, required: true, unique: true, index: true },
    name: { type: String, required: true },
    baseUrl: { type: String, required: true },
    address: { type: String },
    skills: { type: [String], default: [] },
    online: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

export const AgentModel: Model<AgentDoc> = model<AgentDoc>("Agent", agentSchema);
