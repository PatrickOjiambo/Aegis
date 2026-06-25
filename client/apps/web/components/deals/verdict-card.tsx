"use client"

import { motion } from "motion/react"
import { Check, Gavel, X } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"

import { CopyButton } from "@/components/copy-button"
import { VerdictBadge } from "@/components/state-badge"
import { shortHash } from "@/lib/format"
import type { VerdictRecord } from "@/lib/types"

export function VerdictCard({ verdict }: { verdict: VerdictRecord }) {
  const sellerShare = (verdict.splitBps / 100).toFixed(verdict.splitBps % 100 ? 2 : 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-full">
          <Gavel className="size-4" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold">Verdict</span>
          <VerdictBadge verdict={verdict.outcome} />
          {verdict.outcome === "Split" ? (
            <span className="text-muted-foreground text-sm">
              {sellerShare}% to seller
            </span>
          ) : null}
        </div>
        {verdict.overturned ? (
          <Badge variant="destructive">Overturned on appeal</Badge>
        ) : verdict.appealed ? (
          <Badge variant="secondary">Appeal upheld verdict</Badge>
        ) : null}
      </div>

      {typeof verdict.confidence === "number" ? (
        <div className="space-y-1">
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>Arbiter confidence</span>
            <span className="tabular-nums">
              {Math.round(verdict.confidence * 100)}%
            </span>
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <motion.div
              className="bg-primary h-full"
              initial={{ width: 0 }}
              animate={{ width: `${verdict.confidence * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>
      ) : null}

      <blockquote className="border-primary/40 text-foreground/90 border-l-2 pl-4 text-sm leading-relaxed">
        {verdict.rationale}
      </blockquote>

      {verdict.findings.length > 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium">
            Per-criterion findings
          </p>
          {verdict.findings.map((f, i) => (
            <motion.div
              key={f.criterionId}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.1 }}
              className="bg-muted/30 flex gap-3 rounded-md border p-3"
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  f.met
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-primary/15 text-primary",
                )}
              >
                {f.met ? <Check className="size-3" /> : <X className="size-3" />}
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-mono text-xs">
                  {f.criterionId} · {f.met ? "met" : "unmet"}
                </p>
                <p className="text-muted-foreground mt-0.5">{f.reasoning}</p>
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}

      <Separator />

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          rationale hash
          <CopyButton value={verdict.rationaleHash} label={shortHash(verdict.rationaleHash)} />
        </span>
        {verdict.settleTxHash ? (
          <span className="flex items-center gap-1">
            settle tx
            <CopyButton value={verdict.settleTxHash} label={shortHash(verdict.settleTxHash)} />
          </span>
        ) : null}
        <span>arbiter {shortHash(verdict.arbiter)}</span>
      </div>
    </motion.div>
  )
}
