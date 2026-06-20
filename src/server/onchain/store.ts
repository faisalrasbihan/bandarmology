import { defineSchema, getPool } from "../db";
import type { OnchainTx } from "./types";

/**
 * Layer 1 store for public on-chain transactions. Physically separate from the
 * Layer 2 `aml_transactions` table — public ledger data must never be merged
 * into the internal feed (data-separation guardrail). The two meet only at the
 * read-only investigation join.
 */
const ensureSchema = defineSchema(`
  CREATE TABLE IF NOT EXISTS onchain_transactions (
    id UUID PRIMARY KEY,
    entity_name TEXT NOT NULL,
    address TEXT NOT NULL,
    chain TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    asset TEXT NOT NULL,
    amount_usd NUMERIC NOT NULL,
    direction TEXT NOT NULL,
    counterparty_address TEXT NOT NULL,
    counterparty_label TEXT,
    risk_flag TEXT,
    tx_hash TEXT NOT NULL,
    synthetic BOOLEAN NOT NULL DEFAULT true
  );
  CREATE INDEX IF NOT EXISTS onchain_tx_entity_idx ON onchain_transactions (lower(entity_name));
  CREATE INDEX IF NOT EXISTS onchain_tx_ts_idx ON onchain_transactions (ts);
`);

/** Bulk-insert a synthetic on-chain feed; replaces any existing rows for the entity. */
export async function replaceOnchainTx(entityName: string, txns: OnchainTx[]): Promise<number> {
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM onchain_transactions WHERE lower(entity_name) = lower($1)`, [entityName]);
    for (const t of txns) {
      await client.query(
        `INSERT INTO onchain_transactions
           (id, entity_name, address, chain, ts, asset, amount_usd, direction,
            counterparty_address, counterparty_label, risk_flag, tx_hash, synthetic)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
        [
          t.id,
          t.entityName,
          t.address,
          t.chain,
          t.ts,
          t.asset,
          t.amountUsd,
          t.direction,
          t.counterpartyAddress,
          t.counterpartyLabel,
          t.riskFlag,
          t.txHash,
        ]
      );
    }
    await client.query("COMMIT");
    return txns.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

interface OnchainRow {
  id: string;
  entity_name: string;
  address: string;
  chain: string;
  ts: string | Date;
  asset: string;
  amount_usd: string;
  direction: OnchainTx["direction"];
  counterparty_address: string;
  counterparty_label: string | null;
  risk_flag: string | null;
  tx_hash: string;
}

function rowToTx(r: OnchainRow): OnchainTx {
  return {
    id: r.id,
    entityName: r.entity_name,
    address: r.address,
    chain: r.chain,
    ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
    asset: r.asset,
    amountUsd: Number(r.amount_usd),
    direction: r.direction,
    counterpartyAddress: r.counterparty_address,
    counterpartyLabel: r.counterparty_label,
    riskFlag: r.risk_flag,
    txHash: r.tx_hash,
    synthetic: true,
  };
}

export async function getOnchainTx(entityName: string): Promise<OnchainTx[]> {
  await ensureSchema();
  const { rows } = await getPool().query<OnchainRow>(
    `SELECT * FROM onchain_transactions WHERE lower(entity_name) = lower($1) ORDER BY ts ASC`,
    [entityName]
  );
  return rows.map(rowToTx);
}
