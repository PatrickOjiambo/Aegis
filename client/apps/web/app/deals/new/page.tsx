"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { NewDealForm } from "@/components/deals/new-deal-form"

export default function NewDealPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/deals"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Deals
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Open a new escrow</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Record the agreed terms and deposit the payment into the on-chain vault.
        </p>
      </div>
      <NewDealForm />
    </div>
  )
}
