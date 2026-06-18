import { buildAgentCard } from "../shared/agent-card.js";

export const buyerCard = buildAgentCard("buyer", {
  name: "Aegis Buyer Agent",
  description:
    "Initiates purchases under a mandate, pays into on-chain escrow via x402, and can raise disputes.",
  skills: [
    {
      id: "open-deal",
      name: "Open escrow deal",
      description: "Open an escrow for an agreed mandate and deposit payment.",
      tags: ["escrow", "x402", "payment"],
    },
    {
      id: "raise-dispute",
      name: "Raise dispute",
      description: "Dispute a deal and file a structured case with the arbiter.",
      tags: ["dispute", "recourse"],
    },
  ],
});
