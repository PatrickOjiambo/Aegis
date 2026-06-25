"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, Gavel, Loader2, Scale, ShieldQuestion } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { VerdictCard } from "@/components/deals/verdict-card"
import { useAdjudicate } from "@/lib/hooks"
import type { EscrowState, VerdictRecord } from "@/lib/types"

const REASONING_STEPS = [
  "Reading the escrow record on-chain via MCP",
  "Loading the agreed terms (the mandate)",
  "Cross-checking the buyer's evidence against chain",
  "Cross-checking the seller's evidence against chain",
  "Reasoning over evidence against each acceptance criterion",
  "Rendering a structured verdict and rationale",
  "Executing settlement on-chain",
]

export function ArbiterPanel({
  dealId,
  state,
  verdict,
}: {
  dealId: number
  state: EscrowState
  verdict?: VerdictRecord
}) {
  const adjudicate = useAdjudicate(dealId)
  const [reasoning, setReasoning] = React.useState(false)
  const [activeStep, setActiveStep] = React.useState(0)

  // Drive the step-by-step reveal while the arbiter is working.
  React.useEffect(() => {
    if (!reasoning) return
    const t = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, REASONING_STEPS.length - 1))
    }, 850)
    return () => clearInterval(t)
  }, [reasoning])

  async function run() {
    setActiveStep(0)
    setReasoning(true)
    try {
      const result = await adjudicate.mutateAsync()
      // Let the final step land before swapping to the verdict.
      setActiveStep(REASONING_STEPS.length - 1)
      setTimeout(() => setReasoning(false), 700)
      toast.success(`Arbiter ruled: ${result.ruling.outcome}`)
    } catch (err) {
      setReasoning(false)
      toast.error("Adjudication failed", { description: (err as Error).message })
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="text-primary size-4" />
          Arbiter
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {verdict && !reasoning ? (
            <motion.div key="verdict">
              <VerdictCard verdict={verdict} />
            </motion.div>
          ) : reasoning ? (
            <ReasoningView key="reasoning" activeStep={activeStep} />
          ) : state === "Disputed" ? (
            <motion.div
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4 py-6 text-center"
            >
              <motion.div
                animate={{ rotate: [0, -12, 12, -8, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full"
              >
                <Gavel className="size-7" />
              </motion.div>
              <div>
                <p className="font-medium">A bonded arbiter is ready to rule</p>
                <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
                  It will read on-chain truth, weigh both sides&apos; evidence against
                  the terms, and execute a binding settlement.
                </p>
              </div>
              <Button onClick={run} disabled={adjudicate.isPending}>
                <Gavel className="size-4" />
                Run adjudication
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-muted-foreground flex flex-col items-center gap-3 py-8 text-center text-sm"
            >
              <ShieldQuestion className="size-8" />
              <p className="max-w-sm">
                No dispute to adjudicate. If the review window elapses without a
                dispute, the escrow auto-releases to the seller.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

function ReasoningView({ activeStep }: { activeStep: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4 py-2"
    >
      <div className="flex items-center gap-3">
        <span className="relative flex size-10">
          <motion.span
            className="bg-primary/30 absolute inset-0 rounded-full"
            animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          <span className="bg-primary/10 text-primary relative flex size-10 items-center justify-center rounded-full">
            <Gavel className="size-5" />
          </span>
        </span>
        <div>
          <p className="font-medium">The arbiter is reasoning…</p>
          <p className="text-muted-foreground text-xs">
            Evidence is weighed strictly against the agreed terms.
          </p>
        </div>
      </div>

      <ol className="space-y-2">
        {REASONING_STEPS.map((step, i) => {
          const done = i < activeStep
          const active = i === activeStep
          return (
            <motion.li
              key={step}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: done || active ? 1 : 0.4 }}
              className="flex items-center gap-3 text-sm"
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-border text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="size-3" />
                ) : active ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className={cn(!done && !active && "text-muted-foreground")}>
                {step}
              </span>
            </motion.li>
          )
        })}
      </ol>
    </motion.div>
  )
}
