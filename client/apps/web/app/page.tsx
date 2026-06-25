"use client"

import Link from "next/link"
import { motion } from "motion/react"
import {
  ArrowRight,
  Coins,
  FileSearch,
  Gavel,
  Scale,
  ShieldCheck,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

const FEATURES = [
  {
    icon: Coins,
    title: "Escrowed agent payments",
    body: "The buyer pays into an on-chain escrow via x402 instead of paying the seller directly and irreversibly.",
  },
  {
    icon: FileSearch,
    title: "Two-sided evidence",
    body: "Both parties submit hash-referenced evidence — status codes, payloads, oracle facts — that cannot be swapped after the fact.",
  },
  {
    icon: Gavel,
    title: "Autonomous LLM verdict",
    body: "A bonded arbiter reasons over evidence strictly against the agreed terms, then settles release, refund or split on-chain.",
  },
  {
    icon: ShieldCheck,
    title: "Skin in the game",
    body: "Every ruling stakes the arbiter's reputation. A successful appeal overturns the verdict and slashes its bond.",
  },
]

const fade = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
}

export default function Page() {
  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-2xl border">
        <div className="from-primary/15 via-background to-background absolute inset-0 bg-gradient-to-br" />
        <div
          aria-hidden
          className="bg-primary/20 absolute -top-24 -right-24 size-72 rounded-full blur-3xl"
        />
        <div className="relative px-6 py-16 sm:px-12 sm:py-20">
          <motion.div
            initial="hidden"
            animate="show"
            variants={fade}
            custom={0}
            className="border-primary/30 bg-primary/10 text-primary mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
          >
            <Scale className="size-3.5" />
            The Autonomous Dispute Arbiter for the Agent Economy
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="show"
            variants={fade}
            custom={1}
            className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          >
            Recourse for irreversible{" "}
            <span className="text-primary">agent payments</span> on Casper.
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="show"
            variants={fade}
            custom={2}
            className="text-muted-foreground mt-5 max-w-2xl text-lg text-pretty"
          >
            When an agent pays for a service that isn&apos;t delivered, the money is
            simply gone. Aegis escrows the payment, weighs both sides&apos; evidence
            against the agreed terms, and executes a binding settlement — releasing,
            refunding, or splitting the funds on-chain.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="show"
            variants={fade}
            custom={3}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Button asChild size="lg">
              <Link href="/deals">
                Open the console
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/deals/new">Open a new escrow</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <section>
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight">The missing pillar</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            The agent economy built discovery, reputation and payments — but skipped
            justice. Aegis adds the fourth pillar: a way to be made whole when
            something goes wrong.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={fade}
              custom={i}
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                    <f.icon className="size-5" />
                  </div>
                  <CardTitle>{f.title}</CardTitle>
                  <CardDescription>{f.body}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border p-6 sm:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">The loop, end to end</h2>
        <ol className="text-muted-foreground mt-4 grid gap-3 sm:grid-cols-3">
          {[
            "Buyer opens an escrow under a mandate and deposits via x402.",
            "Seller delivers and attaches evidence; the buyer may dispute.",
            "Both sides file evidence to the arbiter over A2A before the deadline.",
            "The arbiter reads on-chain truth via MCP and reasons to a verdict.",
            "It settles release / refund / split — funds move on Casper.",
            "The ruling is recorded; a bad verdict can be appealed and slashed.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {i + 1}
              </span>
              <span className="text-sm">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <Button asChild variant="secondary">
            <Link href="/deals">
              See it run
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
