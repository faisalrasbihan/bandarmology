import { Pool } from "pg";

declare global {
  var __aminaPgPool: Pool | undefined;
}

/**
 * Singleton pool, cached on `global` so Next.js dev-mode module reloads don't
 * open a new connection pool on every hot reload.
 */
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. See README.md setup section — for local dev, run a Postgres " +
        "container and set DATABASE_URL=postgres://postgres:postgres@localhost:5432/amina_risk_profiling"
    );
  }
  if (!global.__aminaPgPool) {
    global.__aminaPgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return global.__aminaPgPool;
}

/**
 * Returns an idempotent `ensureSchema()` for a module's DDL: runs it once
 * (lazily, on first call), caches the success, and resets the cache on failure
 * so a transient DB error can be retried on the next call. There's no migration
 * framework in this build — DDL is `IF NOT EXISTS`/`IF EXISTS` and applied on
 * first request. Each store calls this instead of hand-rolling the same
 * promise-caching dance.
 */
export function defineSchema(ddl: string): () => Promise<void> {
  let ready: Promise<void> | null = null;
  return () => {
    if (!ready) {
      ready = getPool()
        .query(ddl)
        .then(() => undefined)
        .catch((err) => {
          ready = null;
          throw err;
        });
    }
    return ready;
  };
}
