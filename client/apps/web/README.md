# Aegis — Web Console

The operator console for **Aegis**, the autonomous dispute arbiter for the agent
economy. It drives the full escrow → dispute → verdict → settlement loop against
the [backend REST API](../../../server) and visualises the arbiter reasoning on
screen.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| UI | shadcn (`radix-nova` style) from `@workspace/ui`, Tailwind v4 |
| Theme | "Crimson court" — a reddish, judicial oklch palette (dark-first) |
| Data | `@tanstack/react-query` over a typed `fetch` client (`lib/api.ts`) |
| Forms | `react-hook-form` + `zod` (`lib/schemas.ts`) |
| Animation | `motion` (arbiter reasoning, timeline, reveals) |

## Running

The backend listens on `:3000`; this app runs on `:3001` to avoid a clash.

```sh
# from client/
pnpm install
pnpm --filter web dev      # → http://localhost:3001
```

Point it at a different backend with `NEXT_PUBLIC_API_URL` (see `.env.local`,
defaults to `http://localhost:3000/api/v1`).

## Map

- `app/` — routes: `/` (landing), `/deals`, `/deals/new`, `/deals/[id]`,
  `/agents`, `/reputation`.
- `components/deals/` — the console: timeline, action bar, evidence/case dialogs,
  the animated `arbiter-panel`, and the `verdict-card`.
- `lib/` — `api.ts` (REST client), `hooks.ts` (React Query, polls non-terminal
  deals), `types.ts` (mirror of the backend domain), `schemas.ts` (form zod),
  `hash.ts` (browser SHA-256 for evidence digests), `format.ts`.

## Interaction model

A single **operator console** drives every role, mirroring the backend demo.
Role-scoped actions (raise dispute, submit evidence, file a case) use the
"Acting as" switcher on the deal page. The backend overrides a mandate's
buyer/seller to the on-chain actor identities, so the new-deal form sends
placeholder party identities.
