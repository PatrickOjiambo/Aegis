import { buildAgentCard } from "../shared/agent-card.js";

export const appealCard = buildAgentCard("appeal", {
  name: "Aegis Appeal Panel",
  description:
    "Re-hears a contested verdict; if overturned, records the overturn against the original arbiter's reputation.",
  skills: [
    {
      id: "hear-appeal",
      name: "Hear appeal",
      description: "Re-adjudicate a settled dispute and overturn the verdict if warranted.",
      tags: ["appeal", "accountability", "slashing"],
    },
  ],
});
