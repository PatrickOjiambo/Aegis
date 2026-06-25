import { notFound } from "next/navigation"

import { DealDetail } from "@/components/deals/deal-detail"

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const dealId = Number(id)
  if (!Number.isInteger(dealId) || dealId < 0) notFound()
  return <DealDetail id={dealId} />
}
