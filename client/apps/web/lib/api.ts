/**
 * Typed client for the Aegis REST API (server/src/api/*, mounted at /api/v1).
 * The backend is the source of truth; the UI only reads/writes through here.
 */
import type {
  AdjudicateResult,
  AgentCard,
  AppealResult,
  CaseMessage,
  CaseRecord,
  Deal,
  DealRecord,
  EvidenceItem,
  EvidenceRecord,
  Mandate,
  OpenDealResult,
  PartyRole,
  Score,
  TxResult,
  VerdictRecord,
} from "./types"

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = init ?? {}
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  })

  const text = await res.text()
  const data = text ? safeJson(text) : undefined

  if (!res.ok) {
    const message =
      (data as { message?: string } | undefined)?.message ??
      `${res.status} ${res.statusText}`
    throw new ApiError(message, res.status, data)
  }
  return data as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const api = {
  health: () =>
    request<{ status: string; db: string; uptime: number; timestamp: string }>(
      "/health",
    ),

  // ---- Deals ----
  listDeals: () => request<{ deals: DealRecord[] }>("/deals"),
  getDeal: (id: number) =>
    request<{ deal: DealRecord | null; onChain: Deal | null }>(`/deals/${id}`),
  openDeal: (mandate: Mandate) =>
    request<OpenDealResult>("/deals", { method: "POST", json: { mandate } }),
  fulfill: (id: number, evidence: EvidenceItem) =>
    request<TxResult>(`/deals/${id}/fulfill`, {
      method: "POST",
      json: { evidence },
    }),
  dispute: (id: number, role: PartyRole) =>
    request<TxResult>(`/deals/${id}/dispute`, {
      method: "POST",
      json: { role },
    }),
  submitEvidence: (id: number, role: PartyRole, item: EvidenceItem) =>
    request<TxResult>(`/deals/${id}/evidence`, {
      method: "POST",
      json: { role, item },
    }),
  submitCase: (id: number, message: CaseMessage) =>
    request<{ accepted: boolean }>(`/deals/${id}/case`, {
      method: "POST",
      json: message,
    }),
  release: (id: number) =>
    request<TxResult>(`/deals/${id}/release`, { method: "POST" }),
  adjudicate: (id: number) =>
    request<AdjudicateResult>(`/deals/${id}/adjudicate`, { method: "POST" }),
  appeal: (id: number) =>
    request<AppealResult>(`/deals/${id}/appeal`, { method: "POST" }),
  getCases: (id: number) =>
    request<{ cases: CaseRecord[] }>(`/deals/${id}/cases`),
  getEvidence: (id: number) =>
    request<{ evidence: EvidenceRecord[] }>(`/deals/${id}/evidence`),
  getVerdict: (id: number) =>
    request<{ verdict: VerdictRecord }>(`/deals/${id}/verdict`),

  // ---- Agents & reputation ----
  listAgents: () => request<{ agents: AgentCard[] }>("/agents"),
  getReputation: (address: string) =>
    request<{ address: string; score: Score }>(
      `/reputation/${encodeURIComponent(address)}`,
    ),
}
