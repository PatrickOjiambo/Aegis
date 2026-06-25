/**
 * Frontend mirror of the Aegis backend domain types (server/src/domain/*).
 * Kept hand-synced and deliberately small — only the shapes the UI consumes.
 */

export const ESCROW_STATES = [
  "Pending",
  "Fulfilled",
  "Disputed",
  "Released",
  "Refunded",
  "Split",
] as const
export type EscrowState = (typeof ESCROW_STATES)[number]

export const TERMINAL_STATES: readonly EscrowState[] = [
  "Released",
  "Refunded",
  "Split",
]

export function isTerminal(state: EscrowState): boolean {
  return TERMINAL_STATES.includes(state)
}

export const VERDICTS = ["Release", "Refund", "Split"] as const
export type Verdict = (typeof VERDICTS)[number]

export type PartyRole = "buyer" | "seller"
export type RequestedOutcome = "release" | "refund" | "split"

export type EvidenceType =
  | "http_status"
  | "payload"
  | "oracle"
  | "log"
  | "screenshot"
  | "other"

export type CriterionKind =
  | "http_status"
  | "payload_schema"
  | "payload_value"
  | "oracle_fact"
  | "manual"

/** On-chain Deal record, mirrored off-chain (server escrow.schema.ts). */
export interface Deal {
  id: number
  buyer: string
  seller: string
  amount: string // motes, decimal string
  termsHash: string
  state: EscrowState
  createdAt: number
  reviewDeadline: number
  evidenceDeadline: number
  settledAt: number
  appealDeadline: number
  arbiter: string | null
}

/** The off-chain mirror document returned by GET /deals (Mongoose lean doc). */
export interface DealRecord extends Deal {
  _id?: string
  mandate?: Mandate
  txHashes?: Record<string, string>
}

export interface AcceptanceCriterion {
  id: string
  description: string
  kind: CriterionKind
  expected?: unknown
  required: boolean
}

export interface Mandate {
  version: 1
  title: string
  description: string
  buyer: string
  seller: string
  price: string
  currency: "CSPR"
  deliverable: string
  acceptanceCriteria: AcceptanceCriterion[]
  deliveryDeadlineMs: number
  notes?: string
}

export interface EvidenceItem {
  type: EvidenceType
  value?: string | number | boolean
  ref?: string
  hash: string
  description?: string
}

export interface EvidenceRecord extends EvidenceItem {
  dealId: number
  role: PartyRole
  txHash?: string
  createdAt?: string
}

export interface CaseMessage {
  escrow_id: number
  role: PartyRole
  claim: string
  evidence: EvidenceItem[]
  requested_outcome: RequestedOutcome
  signature?: string
}

export interface CaseRecord extends CaseMessage {
  _id?: string
  createdAt?: string
}

export interface CriterionFinding {
  criterionId: string
  met: boolean
  reasoning: string
  evidenceHashes: string[]
}

export interface VerdictRecord {
  dealId: number
  arbiter: string
  outcome: Verdict
  splitBps: number
  rationale: string
  rationaleHash: string
  findings: CriterionFinding[]
  confidence?: number
  settleTxHash?: string
  appealed: boolean
  overturned: boolean
  overturnReason?: string
  createdAt?: string
  updatedAt?: string
}

export interface Score {
  deals: number
  positive: number
  disputes: number
  overturned: number
}

export interface AgentCard {
  name: string
  description?: string
  url?: string
  version?: string
  [key: string]: unknown
}

/** ---- API envelope shapes (server/src/api/*.routes.ts) ---- */
export interface OpenDealResult {
  dealId: number
  txHash: string
}
export interface TxResult {
  txHash: string
}
export interface AdjudicateResult {
  ruling: VerdictRuling
  txHash: string
  rationaleHash: string
}
export interface AppealResult {
  overturned: boolean
  [key: string]: unknown
}
export interface VerdictRuling {
  outcome: Verdict
  splitBps: number
  rationale: string
  findings: CriterionFinding[]
  confidence?: number
}
