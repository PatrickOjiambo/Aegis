"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useFieldArray, useForm, type Resolver } from "react-hook-form"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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

import { useOpenDeal } from "@/lib/hooks"
import { csprToMotes } from "@/lib/format"
import { criterionKinds, mandateForm, type MandateForm } from "@/lib/schemas"
import type { Mandate } from "@/lib/types"

const KIND_LABEL: Record<(typeof criterionKinds)[number], string> = {
  http_status: "HTTP status",
  payload_schema: "Payload schema",
  payload_value: "Payload value",
  oracle_fact: "Oracle fact",
  manual: "Manual / subjective",
}

function defaultDeadline(): string {
  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function NewDealForm() {
  const router = useRouter()
  const openDeal = useOpenDeal()

  const form = useForm<MandateForm>({
    // Casts bridge a type-only drift: the shadcn CLI pulls an older zod (v4
    // core minor 0) that @hookform/resolvers resolves against, vs our zod 4.4.x
    // (minor 4). Runtime behaviour is correct; this only quiets the overload.
    resolver: zodResolver(mandateForm as never) as Resolver<MandateForm>,
    defaultValues: {
      title: "",
      description: "",
      deliverable: "",
      price: "100",
      deliveryDeadline: defaultDeadline(),
      acceptanceCriteria: [
        {
          id: "c1",
          description: "Endpoint returns HTTP 200",
          kind: "http_status",
          expected: "200",
          required: true,
        },
      ],
      notes: "",
    },
  })

  const criteria = useFieldArray({
    control: form.control,
    name: "acceptanceCriteria",
  })

  async function onSubmit(values: MandateForm) {
    const mandate: Mandate = {
      version: 1,
      title: values.title,
      description: values.description ?? "",
      // The backend overrides these to the on-chain actor identities; we send
      // valid placeholders so the request passes MandateSchema validation.
      buyer: "buyer-agent",
      seller: "seller-agent",
      price: csprToMotes(values.price),
      currency: "CSPR",
      deliverable: values.deliverable,
      acceptanceCriteria: values.acceptanceCriteria.map((c, i) => ({
        id: c.id || `c${i + 1}`,
        description: c.description,
        kind: c.kind,
        expected: c.expected?.trim() ? c.expected.trim() : undefined,
        required: c.required,
      })),
      deliveryDeadlineMs: new Date(values.deliveryDeadline).getTime(),
      notes: values.notes?.trim() || undefined,
    }

    try {
      const result = await openDeal.mutateAsync(mandate)
      toast.success(`Escrow opened — deal #${result.dealId}`, {
        description: `tx ${result.txHash.slice(0, 14)}…`,
      })
      router.push(`/deals/${result.dealId}`)
    } catch (err) {
      toast.error("Couldn't open the escrow", {
        description: (err as Error).message,
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Mandate</CardTitle>
            <CardDescription>
              The agreed terms the seller must satisfy. Only the hash of this
              mandate is stored on-chain; it becomes the contract the arbiter rules
              against.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="30-day weather API access" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="deliverable"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deliverable</FormLabel>
                    <FormControl>
                      <Input placeholder="weather-api-30d" {...field} />
                    </FormControl>
                    <FormDescription>A short machine label.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (CSPR)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="100" {...field} />
                    </FormControl>
                    <FormDescription>Escrowed into the vault via x402.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="deliveryDeadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery deadline</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
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
                    <Textarea
                      rows={2}
                      placeholder="What the buyer is purchasing and any context."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Acceptance criteria</CardTitle>
                <CardDescription>
                  Each testable condition the arbiter rules met / unmet against the
                  submitted evidence.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  criteria.append({
                    id: `c${criteria.fields.length + 1}`,
                    description: "",
                    kind: "manual",
                    expected: "",
                    required: true,
                  })
                }
              >
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {criteria.fields.map((field, index) => (
              <div
                key={field.id}
                className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_auto]"
              >
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name={`acceptanceCriteria.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Condition</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Endpoint returns HTTP 200 within 24h"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name={`acceptanceCriteria.${index}.kind`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Check kind</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {criterionKinds.map((k) => (
                                <SelectItem key={k} value={k}>
                                  {KIND_LABEL[k]}
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
                      name={`acceptanceCriteria.${index}.expected`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">
                            Expected{" "}
                            <span className="text-muted-foreground font-normal">
                              (optional)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="200" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                <div className="flex items-start justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove criterion"
                    disabled={criteria.fields.length === 1}
                    onClick={() => criteria.remove(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {form.formState.errors.acceptanceCriteria?.root ? (
              <p className="text-destructive text-sm">
                {form.formState.errors.acceptanceCriteria.root.message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/deals")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={openDeal.isPending}>
            {openDeal.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Opening escrow…
              </>
            ) : (
              "Open escrow"
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}
