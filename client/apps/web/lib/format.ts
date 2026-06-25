import { formatDistanceToNow } from "date-fns"

import type { EscrowState, Verdict } from "./types"

const MOTES_PER_CSPR = 1_000_000_000n

/** Format a motes decimal string as a human CSPR amount. */
export function formatCspr(motes: string): string {
  let value: bigint
  try {
    value = BigInt(motes)
  } catch {
    return `${motes} motes`
  }
  const whole = value / MOTES_PER_CSPR
  const frac = value % MOTES_PER_CSPR
  if (frac === 0n) return `${whole.toLocaleString()} CSPR`
  const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "")
  return `${whole.toLocaleString()}.${fracStr} CSPR`
}

/** Convert a CSPR amount (possibly fractional) to a motes decimal string. */
export function csprToMotes(cspr: string): string {
  const [whole = "0", frac = ""] = cspr.trim().split(".")
  const fracPadded = (frac + "0".repeat(9)).slice(0, 9)
  const motes = BigInt(whole || "0") * MOTES_PER_CSPR + BigInt(fracPadded || "0")
  return motes.toString()
}

export function shortHash(hash: string | null | undefined, head = 6, tail = 4): string {
  if (!hash) return "—"
  if (hash.length <= head + tail + 1) return hash
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`
}

export function relativeTime(ms: number | undefined | null): string {
  if (!ms) return "—"
  return formatDistanceToNow(new Date(ms), { addSuffix: true })
}

export function formatDeadline(ms: number | undefined | null): string {
  if (!ms) return "—"
  return new Date(ms).toLocaleString()
}

/** Tailwind classes for an escrow state badge (crimson-cohesive). */
export function stateTone(
  state: EscrowState,
): "neutral" | "info" | "warn" | "success" | "danger" | "split" {
  switch (state) {
    case "Pending":
      return "neutral"
    case "Fulfilled":
      return "info"
    case "Disputed":
      return "warn"
    case "Released":
      return "success"
    case "Refunded":
      return "danger"
    case "Split":
      return "split"
  }
}

export function verdictTone(v: Verdict): "success" | "danger" | "split" {
  switch (v) {
    case "Release":
      return "success"
    case "Refund":
      return "danger"
    case "Split":
      return "split"
  }
}
