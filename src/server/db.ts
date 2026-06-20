import { Pool } from "pg";

declare global {
  var __aminaPgPool: Pool | undefined;
}

/**
 * Percent-encodes the password in a `postgres(ql)://user:pass@host/db` URL if it
 * contains characters that break WHATWG URL parsing (e.g. `?`, `#`, ` `). `pg`
 * parses the connection string with `new URL()`, which throws on an unescaped
 * `?` in the password — a common foot-gun for generated DB passwords (the
 * Supabase pooler password used here contains `??`). We only touch the password
 * segment, leaving the rest of the URL untouched, and only when it's actually
 * needed (a string that already parses is returned verbatim).
 */
function normalizeConnectionString(raw: string): string {
  try {
    new URL(raw);
    return raw;
  } catch {
    const m = raw.match(/^(postgres(?:ql)?:\/\/)([^:@/]+):([^@]*)@(.+)$/);
    if (!m) return raw;
    const [, scheme, user, password, rest] = m;
    return `${scheme}${user}:${encodeURIComponent(password)}@${rest}`;
  }
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
    global.__aminaPgPool = new Pool({
      connectionString: normalizeConnectionString(process.env.DATABASE_URL),
    });
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
