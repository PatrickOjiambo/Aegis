"use client"

import { useHealth } from "@/lib/hooks"
import { cn } from "@workspace/ui/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

export function HealthBadge() {
  const { data, isError } = useHealth()
  const online = !isError && data?.status === "ok"
  const dbConnected = data?.db === "connected"

  const label = isError
    ? "API offline"
    : !data
      ? "Connecting…"
      : dbConnected
        ? "API online"
        : "API up · DB down"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
          <span className="relative flex size-2">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75",
                online && dbConnected && "bg-emerald-500 motion-safe:animate-ping",
              )}
            />
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                online && dbConnected
                  ? "bg-emerald-500"
                  : online
                    ? "bg-amber-500"
                    : "bg-muted-foreground",
              )}
            />
          </span>
          <span className="text-muted-foreground hidden sm:inline">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Backend REST API at /api/v1</p>
        <p className="text-muted-foreground">{label}</p>
      </TooltipContent>
    </Tooltip>
  )
}
