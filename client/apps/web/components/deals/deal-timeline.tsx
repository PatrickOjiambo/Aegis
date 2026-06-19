"use client"

import { motion } from "motion/react"
import { Check, Coins, FileCheck2, Gavel, PackageCheck, Scale } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import type { EscrowState } from "@/lib/types"

type StepStatus = "done" | "active" | "todo"

interface Step {
  key: string
  label: string
  icon: LucideIcon
  status: StepStatus
}

export function DealTimeline({
  state,
  hasVerdict,
}: {
  state: EscrowState
  hasVerdict: boolean
}) {
  const disputed = state === "Disputed" || hasVerdict
  const terminal = ["Released", "Refunded", "Split"].includes(state)
  const fulfilled = ["Fulfilled", "Disputed", "Released", "Refunded", "Split"].includes(
    state,
  )

  const steps: Step[] = [
    {
      key: "opened",
      label: "Opened",
      icon: Coins,
      status: "done",
    },
    {
      key: "fulfilled",
      label: "Fulfilled",
      icon: PackageCheck,
      status: fulfilled ? "done" : state === "Pending" ? "active" : "todo",
    },
  ]

  if (disputed) {
    steps.push({
      key: "disputed",
      label: "Disputed",
      icon: FileCheck2,
      status: hasVerdict || terminal ? "done" : "active",
    })
    steps.push({
      key: "verdict",
      label: "Verdict",
      icon: Gavel,
      status: hasVerdict ? "done" : "active",
    })
  }

  steps.push({
    key: "settled",
    label: terminal ? state : "Settlement",
    icon: Scale,
    status: terminal ? "done" : disputed && hasVerdict ? "active" : "todo",
  })

  return (
    <div className="flex items-center">
      {steps.map((step, i) => (
        <div key={step.key} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <span className="relative flex">
              {step.status === "active" ? (
                <motion.span
                  className="bg-primary/30 absolute inset-0 rounded-full"
                  animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                />
              ) : null}
              <span
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-full border-2 transition-colors",
                  step.status === "done" &&
                    "border-primary bg-primary text-primary-foreground",
                  step.status === "active" &&
                    "border-primary text-primary bg-background",
                  step.status === "todo" &&
                    "border-border text-muted-foreground bg-background",
                )}
              >
                {step.status === "done" ? (
                  <Check className="size-4" />
                ) : (
                  <step.icon className="size-4" />
                )}
              </span>
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                step.status === "todo" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 ? (
            <div
              className={cn(
                "mx-1 mb-5 h-0.5 flex-1 rounded transition-colors",
                step.status === "done" ? "bg-primary" : "bg-border",
              )}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}
