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
