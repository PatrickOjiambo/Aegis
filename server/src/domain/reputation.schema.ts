import { z } from "zod";

import { CasperAddressSchema } from "./common.js";

/**
 * On-chain reputation `Score` (ReputationRegistry spec §2.1). Deliberately
 * simple counts (NFR-3 transparency) — no hidden weighting on-chain.
 */
export const ScoreSchema = z.object({
  deals: z.number().int().nonnegative(), // total settlements involving this address
  positive: z.number().int().nonnegative(), // outcomes counted favourable to this party
  disputes: z.number().int().nonnegative(), // times this party was in a disputed deal
  overturned: z.number().int().nonnegative(), // (arbiters) verdicts later overturned
});
export type Score = z.infer<typeof ScoreSchema>;

export const ParticipantReputationSchema = z.object({
  address: CasperAddressSchema,
  score: ScoreSchema,
});
export type ParticipantReputation = z.infer<typeof ParticipantReputationSchema>;

export const ZERO_SCORE: Score = { deals: 0, positive: 0, disputes: 0, overturned: 0 };
