"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Gavel, Network, ScrollText, Scale } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { HealthBadge } from "@/components/layout/health-badge"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { RoleProvider } from "@/components/role-context"

const NAV = [
  { href: "/deals", label: "Deals", icon: ScrollText },
  { href: "/agents", label: "Agents", icon: Network },
  { href: "/reputation", label: "Reputation", icon: Scale },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <RoleProvider>
      <div className="flex min-h-svh flex-col">
        <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
            <Link href="/" className="group flex items-center gap-2">
              <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md shadow-sm transition-transform group-hover:scale-105">
                <Gavel className="size-4" />
              </span>
              <span className="text-lg font-semibold tracking-tight">Aegis</span>
            </Link>

            <nav className="flex items-center gap-1">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                )
              })}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <HealthBadge />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>

        <footer className="text-muted-foreground border-t py-6 text-center text-xs">
          Aegis — recourse for the machine economy, built on Casper · x402 · MCP · A2A
        </footer>
      </div>
    </RoleProvider>
  )
}
