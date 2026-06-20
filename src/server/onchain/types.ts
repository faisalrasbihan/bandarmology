/**
 * Layer 1 — PUBLIC blockchain ledger data. Crucially, public-ledger transactions
 * are *public* information, so they belong to Layer 1 and live in their own store
 * (`onchain_transactions`), entirely separate from the Layer 2 internal AMINA
 * transaction feed (`aml_transactions`). The two are merged ONLY at the
 * read-only investigation display join (src/server/investigation/), never in a
 * fetcher and never written back into each other — same data-separation rule as
 * the dashboard join. Counterparty attribution (mixer/sanctioned labels) is
 * itself public chain-analytics data, so it stays Layer 1 too.
 */

export type OnchainDirection = "inbound" | "outbound";

export interface OnchainTx {
  id: string;
  entityName: string;
  /** The client's own known wallet address involved in this transfer. */
  address: string;
  chain: string; // "ethereum" | "bitcoin" | …
  ts: string; // ISO timestamp
  asset: string; // "ETH" | "BTC" | "USDT" | …
  amountUsd: number;
  direction: OnchainDirection;
  counterpartyAddress: string;
  /** Public chain-analytics attribution, when the counterparty is known. */
  counterpartyLabel: string | null;
  /** Public risk attribution: "mixer" | "sanctioned" | "high_risk_exchange" | null. */
  riskFlag: string | null;
  txHash: string;
  /** Always true — this is a simulated public-ledger feed, not a live chain index. */
  synthetic: true;
}
