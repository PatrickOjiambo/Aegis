import { buildAgentCard } from "../shared/agent-card.js";

export const arbiterCard = buildAgentCard("arbiter", {
  name: "Aegis Arbiter Agent",
  description:
    "Autonomous dispute arbiter: ingests case messages and on-chain evidence, reasons with an LLM against the agreed terms, and executes binding settlement on Casper.",
  skills: [
    {
      id: "adjudicate-dispute",
      name: "Adjudicate dispute",
      description:
        "Receive a dispute case, reason over verified evidence vs. terms, and settle the escrow on-chain.",
      tags: ["arbitration", "settlement", "llm", "casper"],
    },
  ],
});
