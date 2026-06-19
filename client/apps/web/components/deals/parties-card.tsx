import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { CopyButton } from "@/components/copy-button"
import { formatCspr, formatDeadline, shortHash } from "@/lib/format"
import type { Deal } from "@/lib/types"

export function PartiesCard({ deal }: { deal: Deal }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">On-chain record</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="Amount" value={formatCspr(deal.amount)} />
        <AddressRow label="Buyer" value={deal.buyer} />
        <AddressRow label="Seller" value={deal.seller} />
        <AddressRow label="Arbiter" value={deal.arbiter} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Terms hash</span>
          <CopyButton value={deal.termsHash} label={shortHash(deal.termsHash)} />
        </div>
        <div className="space-y-2 border-t pt-3">
          <Row label="Review by" value={formatDeadline(deal.reviewDeadline)} muted />
          {deal.evidenceDeadline ? (
            <Row
              label="Evidence by"
              value={formatDeadline(deal.evidenceDeadline)}
              muted
            />
          ) : null}
          {deal.settledAt ? (
            <Row label="Settled" value={formatDeadline(deal.settledAt)} muted />
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "text-muted-foreground text-xs" : "font-medium"}>
        {value}
      </span>
    </div>
  )
}

function AddressRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {value ? (
        <CopyButton value={value} label={shortHash(value)} />
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      )}
    </div>
  )
}
