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
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"

import { useRole } from "@/components/role-context"
import { hashEvidenceContent } from "@/lib/hash"
import { useFulfill, useSubmitEvidence } from "@/lib/hooks"
import { evidenceForm, evidenceTypes, type EvidenceForm } from "@/lib/schemas"
import type { EvidenceItem, PartyRole } from "@/lib/types"

export function EvidenceDialog({
  dealId,
  mode,
  trigger,
}: {
  dealId: number
  mode: "fulfill" | "submit"
  trigger: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const { role } = useRole()
  const fulfill = useFulfill(dealId)
  const submit = useSubmitEvidence(dealId)
  const effectiveRole: PartyRole = mode === "fulfill" ? "seller" : role

  const form = useForm<EvidenceForm>({
    resolver: zodResolver(evidenceForm as never) as Resolver<EvidenceForm>,
    defaultValues: { type: "http_status", value: "", ref: "", description: "" },
  })

  async function onSubmit(values: EvidenceForm) {
    const rawValue = values.value?.trim()
    const numeric =
      rawValue && /^\d+$/.test(rawValue) ? Number(rawValue) : undefined
    const item: EvidenceItem = {
      type: values.type,
      value: rawValue ? (numeric ?? rawValue) : undefined,
      ref: values.ref?.trim() || undefined,
      description: values.description?.trim() || undefined,
      hash: await hashEvidenceContent({
        value: rawValue,
        ref: values.ref?.trim(),
        description: values.description?.trim(),
      }),
    }

    try {
      if (mode === "fulfill") {
        await fulfill.mutateAsync(item)
        toast.success("Deliverable marked fulfilled")
      } else {
        await submit.mutateAsync({ role: effectiveRole, item })
        toast.success(`Evidence submitted as ${effectiveRole}`)
      }
      form.reset()
      setOpen(false)
    } catch (err) {
      toast.error("Submission failed", { description: (err as Error).message })
    }
  }

  const pending = fulfill.isPending || submit.isPending

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "fulfill"
              ? "Mark fulfilled with evidence"
              : `Submit evidence as ${effectiveRole}`}
          </DialogTitle>
          <DialogDescription>
            The content is hashed in your browser; only the 32-byte digest is
            recorded on-chain so it can&apos;t be swapped later.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {evidenceTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inline value</FormLabel>
                  <FormControl>
                    <Input placeholder="200" {...field} />
                  </FormControl>
                  <FormDescription>
                    For small facts (e.g. an HTTP status code).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ref"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference</FormLabel>
                  <FormControl>
                    <Input placeholder="ipfs://… or https://…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Description{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="What this shows" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Submitting…
                  </>
                ) : mode === "fulfill" ? (
                  "Mark fulfilled"
                ) : (
                  "Submit evidence"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
