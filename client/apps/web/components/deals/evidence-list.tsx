import { FileQuestion } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import { CopyButton } from "@/components/copy-button"
import { shortHash } from "@/lib/format"
import type { EvidenceRecord } from "@/lib/types"

export function EvidenceList({ evidence }: { evidence: EvidenceRecord[] }) {
  if (evidence.length === 0) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm">
        <FileQuestion className="size-4" />
        No evidence submitted yet.
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {evidence.map((item, i) => (
        <li
          key={`${item.hash}-${i}`}
          className="bg-muted/30 flex items-start gap-3 rounded-md border p-3"
        >
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 capitalize",
              item.role === "buyer"
                ? "border-sky-500/40 text-sky-600 dark:text-sky-400"
                : "border-primary/40 text-primary",
            )}
          >
            {item.role}
          </Badge>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground font-mono text-xs">
                {item.type}
              </span>
              {item.value != null ? (
                <span className="font-medium">{String(item.value)}</span>
              ) : null}
            </div>
            {item.ref ? (
              <p className="text-muted-foreground truncate font-mono text-xs">
                {item.ref}
              </p>
            ) : null}
            {item.description ? (
              <p className="mt-0.5 text-sm">{item.description}</p>
            ) : null}
          </div>
          <CopyButton value={item.hash} label={shortHash(item.hash)} />
        </li>
      ))}
    </ul>
  )
}
