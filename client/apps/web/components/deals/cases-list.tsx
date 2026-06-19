import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import type { CaseRecord } from "@/lib/types"

export function CasesList({ cases }: { cases: CaseRecord[] }) {
  if (cases.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed px-4 py-6 text-sm">
        No case messages filed yet.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {cases.map((c, i) => (
        <li key={c._id ?? i} className="bg-muted/30 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "capitalize",
                c.role === "buyer"
                  ? "border-sky-500/40 text-sky-600 dark:text-sky-400"
                  : "border-primary/40 text-primary",
              )}
            >
              {c.role}
            </Badge>
            <span className="text-muted-foreground text-xs">requests</span>
            <Badge variant="secondary" className="capitalize">
              {c.requested_outcome}
            </Badge>
          </div>
          <p className="mt-2 text-sm">{c.claim}</p>
        </li>
      ))}
    </ul>
  )
}
