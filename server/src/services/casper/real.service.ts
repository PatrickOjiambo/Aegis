import { ContractCallBuilder, HttpHandler, RpcClient, SessionBuilder } from "casper-js-sdk";
import { readFileSync } from "node:fs";

import type { Hex32 } from "../../domain/common.js";
import type { Deal, OpenDealParams, Settlement } from "../../domain/escrow.schema.js";
import type { Score } from "../../domain/reputation.schema.js";
import type { AgentKey } from "./keys.js";
import type { ChainActor, ICasperService, OpenDealResult, TxResult } from "./types.js";

import { ConfigError, UpstreamError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { addressArg, args, hash32Arg, motesArg, stringArg, u32Arg, u64Arg, verdictArg } from "./abi.js";

const log = logger.child({ component: "casper:real" });

/** Gas budgets in motes (overridable per deployment). */
const GAS = {
  contractCall: 5_000_000_000,
  openSession: 12_000_000_000,
};

export type RealCasperConfig = {
  rpcUrl: string;
  chainName: string;
  escrowContractHash: string;
  reputationContractHash: string;
  proxyWasmPath?: string;
  keys: Record<ChainActor, AgentKey>;
};

/**
 * Live Casper implementation using casper-js-sdk v5 transaction builders.
 *
 * State-changing calls are built, signed and submitted as Transactions. The
 * payable deposit (`open_deal`) is performed via the x402 session-wasm proxy.
 *
 * Chain reads decode authoritative state from global state; the exact Odra
 * dictionary layout is deployment-specific, so reads surface a clear error if
 * the configured layout does not match (see the manual E2E checklist in the
 * README). The deterministic {@link MockCasperService} mirrors this contract for
 * development and tests.
 */
export class RealCasperService implements ICasperService {
  readonly mode = "real" as const;

  private readonly rpc: RpcClient;
  private proxyWasm?: Uint8Array;

  constructor(private readonly config: RealCasperConfig) {
    this.rpc = new RpcClient(new HttpHandler(config.rpcUrl));
  }

  addressOf(actor: ChainActor): string {
    return this.config.keys[actor].accountHash;
  }

  async getDeal(dealId: number): Promise<Deal | null> {
    // Chain reads require the deployed contract's `deals` dictionary URef, which
    // is deployment-specific. Until wired against a live deployment this throws
    // rather than silently returning unverified state (design §9.2: truth only).
    throw new UpstreamError(
      `Real-mode getDeal(${dealId}) requires the deployed EscrowVault dictionary layout. `
      + `Configure it during live bring-up (see README › Manual E2E).`,
    );
  }

  async getScore(address: string): Promise<Score> {
    throw new UpstreamError(
      `Real-mode getScore(${address}) requires the deployed ReputationRegistry dictionary layout.`,
    );
  }

  async openDeal(params: OpenDealParams): Promise<OpenDealResult> {
    const wasm = this.loadProxyWasm();
    const key = this.config.keys.buyer;
    // The session proxy attaches `params.amount` from the buyer's purse and
    // forwards the open_deal call with the seller + terms_hash arguments.
    const tx = new SessionBuilder()
      .from(key.publicKey)
      .chainName(this.config.chainName)
      .wasm(wasm)
      .runtimeArgs(
        args({
          contract_hash: addressArg(`hash-${this.config.escrowContractHash}`),
          entry_point: stringArg("open_deal"),
          amount: motesArg(params.amount),
          seller: addressArg(params.seller),
          terms_hash: hash32Arg(params.termsHash),
        }),
      )
      .payment(GAS.openSession)
      .build();
    tx.sign(key.privateKey);
    const txHash = await this.submit(tx);
    // The new deal id is emitted in the DealOpened event; the event indexer
    // resolves it. Callers persist by terms_hash until the id is observed.
    log.info({ txHash }, "open_deal submitted (deal id resolved via event indexer)");
    return { dealId: -1, txHash };
  }

  async markFulfilled(dealId: number, evidenceHash: Hex32): Promise<TxResult> {
    return this.callEscrow("seller", "mark_fulfilled", {
      id: u64Arg(dealId),
      evidence_hash: hash32Arg(evidenceHash),
    });
  }

  async raiseDispute(actor: ChainActor, dealId: number): Promise<TxResult> {
    return this.callEscrow(actor, "raise_dispute", { id: u64Arg(dealId) });
  }

  async submitEvidence(actor: ChainActor, dealId: number, evidenceHash: Hex32): Promise<TxResult> {
    return this.callEscrow(actor, "submit_evidence", {
      id: u64Arg(dealId),
      evidence_hash: hash32Arg(evidenceHash),
    });
  }

  async claimRelease(dealId: number): Promise<TxResult> {
    return this.callEscrow("seller", "claim_release", { id: u64Arg(dealId) });
  }

  async settle(settlement: Settlement): Promise<TxResult> {
    return this.callEscrow("arbiter", "settle", {
      id: u64Arg(settlement.dealId),
      verdict: verdictArg(settlement.verdict),
      split_bps: u32Arg(settlement.splitBps),
      rationale_hash: hash32Arg(settlement.rationaleHash),
    });
  }

  async timeoutRefund(dealId: number): Promise<TxResult> {
    return this.callEscrow("arbiter", "timeout_refund", { id: u64Arg(dealId) });
  }

  async recordOverturn(arbiterAddress: string): Promise<TxResult> {
    // ReputationRegistry.record_overturn is writer-only; in MVP the appeal flow
    // is minimal (ArbiterStake deferred). The arbiter key acts as the caller.
    const key = this.config.keys.arbiter;
    const tx = new ContractCallBuilder()
      .from(key.publicKey)
      .chainName(this.config.chainName)
      .byHash(this.config.reputationContractHash)
      .entryPoint("record_overturn")
      .runtimeArgs(args({ arbiter: addressArg(arbiterAddress) }))
      .payment(GAS.contractCall)
      .build();
    tx.sign(key.privateKey);
    return { txHash: await this.submit(tx) };
  }

  // ---- internals ----
  private async callEscrow(
    actor: ChainActor,
    entryPoint: string,
    runtimeArgs: Parameters<typeof args>[0],
  ): Promise<TxResult> {
    const key = this.config.keys[actor];
    const tx = new ContractCallBuilder()
      .from(key.publicKey)
      .chainName(this.config.chainName)
      .byHash(this.config.escrowContractHash)
      .entryPoint(entryPoint)
      .runtimeArgs(args(runtimeArgs))
      .payment(GAS.contractCall)
      .build();
    tx.sign(key.privateKey);
    const txHash = await this.submit(tx);
    log.info({ entryPoint, actor, txHash }, "escrow call submitted");
    return { txHash };
  }

  private async submit(tx: Parameters<RpcClient["putTransaction"]>[0]): Promise<string> {
    try {
      const result = await this.rpc.putTransaction(tx);
      return result.transactionHash.toHex();
    }
    catch (err) {
      throw new UpstreamError("Failed to submit transaction to Casper node", { cause: String(err) });
    }
  }

  private loadProxyWasm(): Uint8Array {
    if (this.proxyWasm)
      return this.proxyWasm;
    if (!this.config.proxyWasmPath)
      throw new ConfigError("PROXY_WASM_PATH is required to open deals in real mode");
    this.proxyWasm = new Uint8Array(readFileSync(this.config.proxyWasmPath));
    return this.proxyWasm;
  }
}
