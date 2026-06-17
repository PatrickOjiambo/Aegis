import { buildAgentCard } from "../shared/agent-card.js";

export const sellerCard = buildAgentCard("seller", {
  name: "Aegis Seller Agent",
  description:
    "Offers a service, delivers it, marks the deal fulfilled with evidence, and defends its delivery in disputes.",
  skills: [
    {
      id: "deliver",
      name: "Deliver & fulfil",
      description: "Mark a deal's deliverable fulfilled and attach delivery evidence.",
      tags: ["delivery", "evidence"],
    },
    {
      id: "defend-dispute",
      name: "Defend dispute",
      description: "Submit evidence and file a structured case with the arbiter.",
      tags: ["dispute", "evidence"],
    },
  ],
});
