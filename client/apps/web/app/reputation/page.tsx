"use client"

import * as React from "react"
import { motion } from "motion/react"
import {
  AlertTriangle,
  Gavel,
  Handshake,
  Loader2,
  Scale,
  Search,
  ThumbsUp,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"

import { useReputation } from "@/lib/hooks"
import type { Score } from "@/lib/types"

export default function ReputationPage() {
  const [input, setInput] = React.useState("")
  const [address, setAddress] = React.useState("")
  const { data, isFetching, isError, error } = useReputation(
    address,
    address.length > 1,
  )

  function lookup(e: React.FormEvent) {
    e.preventDefault()
    setAddress(input.trim())
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reputation</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The open, on-chain trust ledger. Any account or contract can read a
          participant&apos;s score — buyers, sellers and arbiters alike.
        </p>
      </div>

      <form onSubmit={lookup} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Casper account public key or hash"
          className="font-mono"
        />
        <Button type="submit" disabled={input.trim().length < 2}>
          {isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Look up
        </Button>
      </form>

      {address ? (
        isError ? (
          <Card>
            <CardContent className="text-muted-foreground py-6 text-sm">
              Couldn&apos;t read a score for this address.{" "}
              {(error as Error)?.message}
            </CardContent>
          </Card>
        ) : data ? (
          <ScoreView address={data.address} score={data.score} />
        ) : null
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Enter an address to read its on-chain reputation.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ScoreView({ address, score }: { address: string; score: Score }) {
  const reliability =
    score.deals > 0 ? Math.round((score.positive / score.deals) * 100) : null

  const stats: { label: string; value: number; icon: LucideIcon; tone: string }[] = [
    { label: "Deals", value: score.deals, icon: Handshake, tone: "text-foreground" },
    {
      label: "Positive",
      value: score.positive,
      icon: ThumbsUp,
      tone: "text-emerald-500",
    },
    {
      label: "Disputes",
      value: score.disputes,
      icon: AlertTriangle,
      tone: "text-amber-500",
    },
    {
      label: "Overturned",
      value: score.overturned,
      icon: Gavel,
      tone: "text-primary",
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="text-primary size-4" />
            <span className="truncate font-mono text-sm">{address}</span>
          </CardTitle>
        </CardHeader>
        {reliability !== null ? (
          <CardContent className="space-y-1">
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>Favourable-outcome rate</span>
              <span className="tabular-nums">{reliability}%</span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <motion.div
                className="bg-primary h-full"
                initial={{ width: 0 }}
                animate={{ width: `${reliability}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card>
              <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
                <s.icon className={`size-5 ${s.tone}`} />
                <span className="text-2xl font-semibold tabular-nums">{s.value}</span>
                <span className="text-muted-foreground text-xs">{s.label}</span>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
