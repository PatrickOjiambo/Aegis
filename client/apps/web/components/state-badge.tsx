import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import { stateTone, verdictTone } from "@/lib/format"
import type { EscrowState, Verdict } from "@/lib/types"

const TONE_CLASSES: Record<string, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  success:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  danger: "border-primary/40 bg-primary/10 text-primary",
  split:
    "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
}

export function StateBadge({
  state,
  className,
}: {
  state: EscrowState
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", TONE_CLASSES[stateTone(state)], className)}
    >
      {state}
    </Badge>
  )
}

export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: Verdict
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", TONE_CLASSES[verdictTone(verdict)], className)}
    >
      {verdict}
    </Badge>
  )
}
