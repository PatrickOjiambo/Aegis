"use client"

import { AlertTriangle, FilePlus2, Loader2, PackageCheck, Scale, Send } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { CaseDialog } from "@/components/deals/case-dialog"
import { EvidenceDialog } from "@/components/deals/evidence-dialog"
import { useRole } from "@/components/role-context"
import { useAppeal, useDispute, useRelease } from "@/lib/hooks"
import { isTerminal, type EscrowState } from "@/lib/types"

export function ActionBar({
  dealId,
  state,
}: {
  dealId: number
  state: EscrowState
}) {
  const { role } = useRole()
  const dispute = useDispute(dealId)
  const release = useRelease(dealId)
  const appeal = useAppeal(dealId)

  const canFulfill = state === "Pending"
  const canDispute = state === "Pending" || state === "Fulfilled"
  const canRelease = state === "Fulfilled"
  const isDisputed = state === "Disputed"
  const terminal = isTerminal(state)

  async function onDispute() {
    try {
      await dispute.mutateAsync(role)
      toast.success(`Dispute raised by ${role}`)
    } catch (err) {
      toast.error("Couldn't raise dispute", { description: (err as Error).message })
    }
  }

  async function onRelease() {
    try {
      await release.mutateAsync()
      toast.success("Funds released to seller")
    } catch (err) {
      toast.error("Release failed", { description: (err as Error).message })
    }
  }

  async function onAppeal() {
    try {
      const result = await appeal.mutateAsync()
      toast[result.overturned ? "warning" : "success"](
        result.overturned
          ? "Appeal overturned the verdict — arbiter slashed"
          : "Appeal heard — original verdict upheld",
      )
    } catch (err) {
      toast.error("Appeal failed", { description: (err as Error).message })
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canFulfill ? (
        <EvidenceDialog
          dealId={dealId}
          mode="fulfill"
          trigger={
            <Button variant="outline">
              <PackageCheck className="size-4" />
              Mark fulfilled
            </Button>
          }
        />
      ) : null}

      {canRelease ? (
        <Button variant="outline" onClick={onRelease} disabled={release.isPending}>
          {release.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Release to seller
        </Button>
      ) : null}

      {canDispute ? (
        <Button variant="outline" onClick={onDispute} disabled={dispute.isPending}>
          {dispute.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          Raise dispute
        </Button>
      ) : null}

      {isDisputed ? (
        <>
          <EvidenceDialog
            dealId={dealId}
            mode="submit"
            trigger={
              <Button variant="outline">
                <FilePlus2 className="size-4" />
                Submit evidence
              </Button>
            }
          />
          <CaseDialog
            dealId={dealId}
            trigger={
              <Button variant="outline">
                <Send className="size-4" />
                File case
              </Button>
            }
          />
        </>
      ) : null}

      {terminal ? (
        <Button variant="outline" onClick={onAppeal} disabled={appeal.isPending}>
          {appeal.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Scale className="size-4" />
          )}
          Appeal verdict
        </Button>
      ) : null}
    </div>
  )
}
