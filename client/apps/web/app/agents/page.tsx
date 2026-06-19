"use client"

import { createElement } from "react"
import { motion } from "motion/react"
import { Bot, Gavel, Network, ScaleIcon, ShoppingCart, Store } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { CopyButton } from "@/components/copy-button"
import { EmptyState } from "@/components/empty-state"
import { useAgents } from "@/lib/hooks"
import type { AgentCard } from "@/lib/types"

function agentIcon(name: string): LucideIcon {
  const n = name.toLowerCase()
  if (n.includes("buyer")) return ShoppingCart
  if (n.includes("seller")) return Store
  if (n.includes("arbiter")) return Gavel
  if (n.includes("appeal")) return ScaleIcon
  return Bot
}

export default function AgentsPage() {
  const { data, isLoading, isError, error } = useAgents({ refetchInterval: 15_000 })
  const agents = data?.agents ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The A2A directory — each agent is a real HTTP server that discovers and
          messages the others.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={Network}
          title="Couldn't load the agent directory"
          description={(error as Error)?.message}
        />
      ) : agents.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No agents registered"
          description="Start the backend with AGENTS_ENABLED=true to boot the buyer, seller, arbiter and appeal A2A servers."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent, i) => (
            <AgentItem key={agent.name ?? i} agent={agent} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function AgentItem({ agent, index }: { agent: AgentCard; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
              {createElement(agentIcon(agent.name ?? ""), { className: "size-5" })}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                {agent.name ?? "Unnamed agent"}
              </CardTitle>
              {agent.version ? (
                <p className="text-muted-foreground text-xs">v{agent.version}</p>
              ) : null}
            </div>
          </div>
          {agent.description ? (
            <CardDescription className="pt-2">{agent.description}</CardDescription>
          ) : null}
        </CardHeader>
        {agent.url ? (
          <CardContent>
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <span className="truncate font-mono">{String(agent.url)}</span>
              <CopyButton value={String(agent.url)} />
            </div>
          </CardContent>
        ) : null}
      </Card>
    </motion.div>
  )
}
