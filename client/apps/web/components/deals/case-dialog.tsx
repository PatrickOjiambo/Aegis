"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, type Resolver } from "react-hook-form"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"

import { useRole } from "@/components/role-context"
import { useSubmitCase } from "@/lib/hooks"
import { caseForm, requestedOutcomes, type CaseForm } from "@/lib/schemas"

export function CaseDialog({
  dealId,
  trigger,
}: {
  dealId: number
  trigger: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const { role } = useRole()
  const submitCase = useSubmitCase(dealId)

  const form = useForm<CaseForm>({
    resolver: zodResolver(caseForm as never) as Resolver<CaseForm>,
    defaultValues: { role, claim: "", requested_outcome: "refund" },
  })

  // Keep the form role in sync with the operator's selected role when reopened.
  React.useEffect(() => {
    if (open) form.setValue("role", role)
  }, [open, role, form])

  async function onSubmit(values: CaseForm) {
    try {
      await submitCase.mutateAsync({
        escrow_id: dealId,
        role: values.role,
        claim: values.claim,
        requested_outcome: values.requested_outcome,
        evidence: [],
      })
      toast.success("Case message filed with the arbiter")
      form.reset({ role, claim: "", requested_outcome: "refund" })
      setOpen(false)
    } catch (err) {
      toast.error("Couldn't file the case", { description: (err as Error).message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File a case with the arbiter</DialogTitle>
          <DialogDescription>
            A structured claim (A2A §9.4). The arbiter treats it as evidence and
            cross-checks every asserted fact against on-chain truth.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="buyer">buyer</SelectItem>
                        <SelectItem value="seller">seller</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requested_outcome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requested outcome</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {requestedOutcomes.map((o) => (
                          <SelectItem key={o} value={o} className="capitalize">
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="claim"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Claim</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="deliverable non-conforming: schema mismatch on the returned payload"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    State plainly what went wrong (or right) versus the terms.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={submitCase.isPending}>
                {submitCase.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Filing…
                  </>
                ) : (
                  "File case"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
