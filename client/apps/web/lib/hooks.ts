"use client"

/**
 * React Query hooks over the Aegis API client. Deals and their sub-resources
 * poll while non-terminal so the UI reflects the background lifecycle worker
 * (fulfil windows, auto-release, adjudication) without a manual refresh.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query"

import { api } from "./api"
import type {
  CaseMessage,
  EvidenceItem,
  Mandate,
  PartyRole,
} from "./types"
import { isTerminal } from "./types"

export const qk = {
  health: ["health"] as const,
  deals: ["deals"] as const,
  deal: (id: number) => ["deal", id] as const,
  cases: (id: number) => ["deal", id, "cases"] as const,
  evidence: (id: number) => ["deal", id, "evidence"] as const,
  verdict: (id: number) => ["deal", id, "verdict"] as const,
  agents: ["agents"] as const,
  reputation: (addr: string) => ["reputation", addr] as const,
}

export function useHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: api.health,
    refetchInterval: 15_000,
  })
}

export function useDeals() {
  return useQuery({
    queryKey: qk.deals,
    queryFn: api.listDeals,
    refetchInterval: 5_000,
  })
}

export function useDeal(id: number, options?: { poll?: boolean }) {
  return useQuery({
    queryKey: qk.deal(id),
    queryFn: () => api.getDeal(id),
    refetchInterval: (query) => {
      if (options?.poll === false) return false
      const state = query.state.data?.onChain?.state ?? query.state.data?.deal?.state
      // Keep polling until funds have moved (terminal state).
      return state && isTerminal(state) ? false : 4_000
    },
  })
}

export function useCases(id: number) {
  return useQuery({ queryKey: qk.cases(id), queryFn: () => api.getCases(id), refetchInterval: 5_000 })
}

export function useEvidence(id: number) {
  return useQuery({
    queryKey: qk.evidence(id),
    queryFn: () => api.getEvidence(id),
    refetchInterval: 5_000,
  })
}

export function useVerdict(id: number, enabled: boolean) {
  return useQuery({
    queryKey: qk.verdict(id),
    queryFn: () => api.getVerdict(id),
    enabled,
    retry: false,
    refetchInterval: 5_000,
  })
}

export function useAgents(options?: Partial<UseQueryOptions<Awaited<ReturnType<typeof api.listAgents>>>>) {
  return useQuery({ queryKey: qk.agents, queryFn: api.listAgents, ...options })
}

export function useReputation(address: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.reputation(address),
    queryFn: () => api.getReputation(address),
    enabled: enabled && address.length > 1,
    retry: false,
  })
}

/** Invalidate everything tied to a deal after a mutation. */
function useInvalidateDeal() {
  const qc = useQueryClient()
  return (id: number) => {
    void qc.invalidateQueries({ queryKey: qk.deal(id) })
    void qc.invalidateQueries({ queryKey: qk.cases(id) })
    void qc.invalidateQueries({ queryKey: qk.evidence(id) })
    void qc.invalidateQueries({ queryKey: qk.verdict(id) })
    void qc.invalidateQueries({ queryKey: qk.deals })
  }
}

export function useOpenDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mandate: Mandate) => api.openDeal(mandate),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.deals }),
  })
}

export function useFulfill(id: number) {
  const invalidate = useInvalidateDeal()
  return useMutation({
    mutationFn: (evidence: EvidenceItem) => api.fulfill(id, evidence),
    onSuccess: () => invalidate(id),
  })
}

export function useDispute(id: number) {
  const invalidate = useInvalidateDeal()
  return useMutation({
    mutationFn: (role: PartyRole) => api.dispute(id, role),
    onSuccess: () => invalidate(id),
  })
}

export function useSubmitEvidence(id: number) {
  const invalidate = useInvalidateDeal()
  return useMutation({
    mutationFn: (input: { role: PartyRole; item: EvidenceItem }) =>
      api.submitEvidence(id, input.role, input.item),
    onSuccess: () => invalidate(id),
  })
}

export function useSubmitCase(id: number) {
  const invalidate = useInvalidateDeal()
  return useMutation({
    mutationFn: (message: CaseMessage) => api.submitCase(id, message),
    onSuccess: () => invalidate(id),
  })
}

export function useRelease(id: number) {
  const invalidate = useInvalidateDeal()
  return useMutation({ mutationFn: () => api.release(id), onSuccess: () => invalidate(id) })
}

export function useAdjudicate(id: number) {
  const invalidate = useInvalidateDeal()
  return useMutation({ mutationFn: () => api.adjudicate(id), onSuccess: () => invalidate(id) })
}

export function useAppeal(id: number) {
  const invalidate = useInvalidateDeal()
  return useMutation({ mutationFn: () => api.appeal(id), onSuccess: () => invalidate(id) })
}
