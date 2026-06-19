"use client"

import { useRole } from "@/components/role-context"
import { cn } from "@workspace/ui/lib/utils"
import type { PartyRole } from "@/lib/types"

const ROLES: PartyRole[] = ["buyer", "seller"]

export function RoleSwitcher() {
  const { role, setRole } = useRole()

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs font-medium">Acting as</p>
      <div className="bg-muted inline-flex rounded-md p-0.5">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={cn(
              "rounded px-3 py-1 text-sm font-medium capitalize transition-colors",
              role === r
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}
