"use client"

import Link from "next/link"
import { ArrowLeft, FileText, Inbox } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { ActionBar } from "@/components/deals/action-bar"
import { ArbiterPanel } from "@/components/deals/arbiter-panel"
import { CasesList } from "@/components/deals/cases-list"
import { DealTimeline } from "@/components/deals/deal-timeline"
import { EvidenceList } from "@/components/deals/evidence-list"
import { MandateCard } from "@/components/deals/mandate-card"
import { PartiesCard } from "@/components/deals/parties-card"
import { RoleSwitcher } from "@/components/deals/role-switcher"
import { EmptyState } from "@/components/empty-state"
import { StateBadge } from "@/components/state-badge"
import { formatCspr } from "@/lib/format"
import {
  useCases,
  useDeal,
  useEvidence,
  useVerdict,
} from "@/lib/hooks"
import { isTerminal } from "@/lib/types"

export function DealDetail({ id }: { id: number }) {
  const { data, isLoading, isError, error } = useDeal(id)
  const evidence = useEvidence(id)
  const cases = useCases(id)

  const onChain = data?.onChain ?? null
  const record = data?.deal ?? null
  const chainRecord = onChain ?? record
  const state = onChain?.state ?? record?.state ?? "Pending"
  const mandate = record?.mandate

  const verdictEnabled = state === "Disputed" || isTerminal(state)
  const verdictQuery = useVerdict(id, verdictEnabled)
  const verdict = verdictQuery.data?.verdict

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    )
  }

  if (isError || !chainRecord) {
    return (
      <EmptyState
        icon={Inbox}
        title={`Deal #${id} not found`}
        description={(error as Error)?.message ?? "It may not exist on this backend."}
      />
    )
  }

  const title = mandate?.title ?? mandate?.deliverable ?? `Deal #${id}`

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/deals"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Deals
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground font-mono text-lg tabular-nums">
            #{id}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <StateBadge state={state} className="text-sm" />
          <span className="text-muted-foreground ml-auto text-lg font-medium tabular-nums">
            {formatCspr(chainRecord.amount)}
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 py-6">
          <DealTimeline state={state} hasVerdict={!!verdict} />
          <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
            <RoleSwitcher />
            <ActionBar dealId={id} state={state} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ArbiterPanel dealId={id} state={state} verdict={verdict} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" />
                Evidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EvidenceList evidence={evidence.data?.evidence ?? []} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Case messages</CardTitle>
            </CardHeader>
            <CardContent>
              <CasesList cases={cases.data?.cases ?? []} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <MandateCard mandate={mandate} />
          <PartiesCard deal={chainRecord} />
        </div>
      </div>
    </div>
  )
}
