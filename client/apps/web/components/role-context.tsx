"use client"

/**
 * Operator console: the UI drives the whole loop, so the operator chooses which
 * party they are "acting as" for role-scoped actions (raise dispute, submit
 * evidence, file a case). This mirrors the backend demo, which plays every role
 * from one process.
 */
import * as React from "react"

import type { PartyRole } from "@/lib/types"

type RoleContextValue = {
  role: PartyRole
  setRole: (role: PartyRole) => void
}

const RoleContext = React.createContext<RoleContextValue | null>(null)

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = React.useState<PartyRole>("buyer")
  const value = React.useMemo(() => ({ role, setRole }), [role])
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole(): RoleContextValue {
  const ctx = React.useContext(RoleContext)
  if (!ctx) throw new Error("useRole must be used within RoleProvider")
  return ctx
}
