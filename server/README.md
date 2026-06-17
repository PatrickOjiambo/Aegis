# Aegis — Backend

> The autonomous dispute arbiter for the agent economy, on Casper.

This is the off-chain backend for **Aegis**: the buyer, seller, arbiter and
appeal agents, the orchestration that drives the end-to-end transaction-and-
dispute loop, the Casper integration, and the REST API. It complements the Odra
smart contracts in [`../aegis-contracts`](../aegis-contracts) (EscrowVault,
ReputationRegistry, x402 proxy).

The headline: when an agent pays another over an irreversible rail and the
service isn't delivered, Aegis gives the wronged party **recourse** — it ingests
the evidence, reasons over it against the agreed terms, and executes a binding
settlement on-chain (release / refund / split), staking its own reputation on
every ruling.

## Stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript (ESM, NodeNext), Node 20+ |
| Agent framework | **Google ADK for TypeScript** (`@google/adk`) |
| Agent discovery & messaging | **A2A** (`@a2a-js/sdk`, protocol v0.3.0) |
| Arbiter reasoning LLM | **DeepSeek** (`deepseek-v4-pro`, OpenAI-compatible) via a custom ADK `BaseLlm` adapter |
| Chain | `casper-js-sdk` v5 |
| Database | MongoDB + Mongoose (Docker Compose for local dev) |
| Validation | Zod v4 |
| HTTP | Express 5 |

## Architecture

A single Node process bootstraps the REST API plus four **A2A agent servers**
(real HTTP, distinct ports) so the agents genuinely discover and message one
another, plus a background lifecycle worker — all over one Mongo connection and
one Casper client.

```
 client ──REST──► API (:3000)
                    │
   ┌────────────────┼─────────────────────────────┐
   │ Buyer :41241   Seller :41242                  │
   │ Arbiter :41243 (ADK + DeepSeek)  Appeal :41244│
   └────────────────┬─────────────────────────────┘
       A2A (claims)  │  casper-js-sdk (truth + settlement)
                     ▼
            Casper Testnet  ◄──►  MongoDB (mirror + artifacts)
```

**Trust boundary (design §9.2 — non-negotiable):** A2A messages are *evidence*
(untrusted); on-chain state read via `casper-js-sdk` is *truth*. The arbiter
verifies every claimed fact against chain before weighing it, and funds move
**only** through `EscrowVault.settle`.

### Layout (`src/`)

- `domain/` — Zod schemas + inferred types (single source of truth).
- `models/` — typed Mongoose models (deal, case, verdict, evidence, agent, chain-event).
- `services/casper/` — `ICasperService` with a deterministic in-memory
  `MockCasperService` and a live `RealCasperService` (v5 builders); blake2b hashing.
- `services/persistence/` — repositories mediating chain ↔ Mongo.
- `agents/` — `buyer/`, `seller/`, `arbiter/`, `appeal/`, plus `shared/` A2A
  infra (card builder, server mount, client, registry, envelope executor).
  The arbiter holds the DeepSeek adapter, read-only tools, agent, runner and settlement.
- `orchestration/` — the deal lifecycle orchestrator and the lifecycle worker.
- `api/` — Express routers (`deals`, `agents`, `reputation`, `health`).

## Getting started

```sh
pnpm install
cp .env.sample .env          # adjust as needed
pnpm mongo:up                # MongoDB (single-node replica set) via Docker
pnpm dev                     # API + agents + worker
```

`CHAIN_MODE` defaults to **`mock`** outside production: a deterministic in-memory
re-implementation of the EscrowVault + ReputationRegistry state machines, so the
whole system runs with no Casper node and no keys.

### Demo

Watch the full story (no testnet required):

```sh
pnpm mongo:up
pnpm demo
```

It runs two cases against the mock chain: (1) a disputed deliverable that the
arbiter refunds, and (2) a bad ruling that is appealed, overturned, and slashes
the arbiter's reputation. If `DEEPSEEK_API_KEY` is set, the arbiter reasons with
DeepSeek live; otherwise a deterministic stub stands in.

### Verify

```sh
pnpm typecheck
pnpm lint
pnpm test     # unit (hashing, mock chain, verdict parsing) + full-loop integration
```

The integration suite (`test/integration.test.ts`) drives the complete loop
against an in-memory MongoDB and the mock chain — dispute → refund, happy-path
auto-release, and appeal-overturn — asserting on-chain state, persisted verdict,
and reputation. It skips automatically if the in-memory Mongo binary can't start.

## REST API (`/api/v1`)

| Method & path | Purpose |
| --- | --- |
| `POST /deals` | Open an escrow for a mandate (F1) |
| `GET /deals` · `GET /deals/:id` | List / fetch deals (mirror + on-chain) |
| `POST /deals/:id/fulfill` | Seller marks fulfilled with evidence (F3) |
| `POST /deals/:id/dispute` | Raise a dispute (FR-5) |
| `POST /deals/:id/evidence` | Submit an evidence item (FR-6) |
| `POST /deals/:id/case` | Submit a case message (design §9.4) |
| `POST /deals/:id/release` | Happy-path auto-release (FR-4) |
| `POST /deals/:id/adjudicate` | Trigger adjudication now (worker does this automatically) |
| `POST /deals/:id/appeal` | Appeal a settled verdict (F7) |
| `GET /deals/:id/{cases,evidence,verdict}` | Case/evidence/verdict for a deal |
| `GET /agents` | A2A agent directory (discovery) |
| `GET /reputation/:address` | On-chain reputation score (F8) |
| `GET /health` | Liveness + DB readiness |

## Going live on Casper Testnet (manual E2E)

The mock chain is the default working path. To fire real transactions:

1. Deploy the contracts (`../aegis-contracts`) and note the **EscrowVault** and
   **ReputationRegistry** contract hashes.
2. Provide the **authorized-arbiter** signing key — the EscrowVault MVP
   authorizes a single arbiter address set at `init`; the arbiter agent must
   sign with that key. Place PEM secret keys under `keys/` (git-ignored).
3. Set in `.env`: `CHAIN_MODE=real`, `CASPER_NODE_RPC_URL`,
   `ESCROW_CONTRACT_HASH`, `REPUTATION_CONTRACT_HASH`, `PROXY_WASM_PATH`,
   `*_SECRET_KEY_PATH`, and `DEEPSEEK_API_KEY`.
4. `pnpm dev`, then drive the loop via the REST API or a buyer/seller agent.

**Live bring-up notes (chain-ABI seams to confirm against the deployment):**

- Odra custom-type encodings in `services/casper/abi.ts` (the `Verdict` enum as a
  `u8`, `Address` as a `Key`, `[u8;32]` byte arrays) are exercised by the mock;
  confirm them against the generated contract schema (`bin/build_schema.rs`).
- Real-mode chain **reads** (`getDeal` / `getScore`) need the deployed contract's
  dictionary layout; they throw a clear error until wired (`services/casper/real.service.ts`).
- The x402 `proxy` session wasm must forward `amount`, `purse`, `seller` and
  `terms_hash` to `open_deal`; align it with `RealCasperService.openDeal`.

## License

MIT
