"use client"

import Link from "next/link"
import { Plus, ScrollText } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { DealCard } from "@/components/deals/deal-card"
import { EmptyState } from "@/components/empty-state"
import { useDeals } from "@/lib/hooks"

export default function DealsPage() {
  const { data, isLoading, isError, error } = useDeals()
  const deals = data?.deals ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every escrow and its lifecycle — pending, disputed, settled.
          </p>
        </div>
        <Button asChild>
          <Link href="/deals/new">
            <Plus className="size-4" />
            New escrow
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={ScrollText}
          title="Couldn't reach the Aegis API"
          description={
            (error as Error)?.message ??
            "Make sure the backend is running on http://localhost:3000."
          }
        />
      ) : deals.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No deals yet"
          description="Open an escrow for an agreed mandate to start the loop."
          action={
            <Button asChild>
              <Link href="/deals/new">
                <Plus className="size-4" />
                Open a new escrow
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  )
}
