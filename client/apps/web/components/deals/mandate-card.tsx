import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"

import type { Mandate } from "@/lib/types"

export function MandateCard({ mandate }: { mandate?: Mandate }) {
  if (!mandate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mandate</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          No off-chain mandate mirror for this deal.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mandate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="font-medium">{mandate.title}</p>
          {mandate.description ? (
            <p className="text-muted-foreground mt-0.5">{mandate.description}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Meta label="Deliverable" value={mandate.deliverable} />
          <Meta
            label="Delivery by"
            value={new Date(mandate.deliveryDeadlineMs).toLocaleDateString()}
          />
        </div>

        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium">
            Acceptance criteria
          </p>
          <ul className="space-y-2">
            {mandate.acceptanceCriteria.map((c) => (
              <li
                key={c.id}
                className="bg-muted/40 rounded-md border px-3 py-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span>{c.description}</span>
                  {!c.required ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      optional
                    </Badge>
                  ) : null}
                </div>
                <div className="text-muted-foreground mt-1 flex gap-2 font-mono">
                  <span>{c.kind}</span>
                  {c.expected != null && c.expected !== "" ? (
                    <span>· expects {String(c.expected)}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {mandate.notes ? (
          <p className="text-muted-foreground border-t pt-3 text-xs italic">
            {mandate.notes}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
