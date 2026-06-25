import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { Card, CardContent } from "@workspace/ui/components/card"

import { StateBadge } from "@/components/state-badge"
import { formatCspr, relativeTime, shortHash } from "@/lib/format"
import type { DealRecord } from "@/lib/types"

export function DealCard({ deal }: { deal: DealRecord }) {
  const title = deal.mandate?.title ?? deal.mandate?.deliverable ?? `Deal #${deal.id}`

  return (
    <Link href={`/deals/${deal.id}`} className="group block">
      <Card className="transition-all group-hover:border-primary/40 group-hover:shadow-md">
        <CardContent className="flex items-center gap-4 py-4">
          <div className="text-muted-foreground font-mono text-sm tabular-nums">
            #{deal.id}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{title}</p>
              <ArrowUpRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="text-muted-foreground truncate text-xs">
              buyer {shortHash(deal.buyer)} → seller {shortHash(deal.seller)} ·
              opened {relativeTime(deal.createdAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-medium tabular-nums">{formatCspr(deal.amount)}</p>
          </div>
          <StateBadge state={deal.state} />
        </CardContent>
      </Card>
    </Link>
  )
}
