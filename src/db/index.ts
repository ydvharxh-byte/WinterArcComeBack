import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import path from "path";
import fs from "fs";
import { MIGRATION_SQL } from "./migrations";

type DbType = ReturnType<typeof drizzle>;

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __studyOsDb?: DbType;
  __studyOsPool?: Pool;
  __studyOsMigrated?: boolean;
};

async function autoMigratePg(pool: Pool) {
  try {
    const res = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subjects' LIMIT 1"
    );
    if (res.rows.length === 0) {
      console.log("Auto-initializing database tables on PostgreSQL...");
      const stmts = MIGRATION_SQL.split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of stmts) {
        await pool.query(stmt);
      }
      console.log("PostgreSQL tables successfully created.");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Auto-migration notice (PostgreSQL):", msg);
  }
}

async function autoMigratePglite(client: PGlite) {
  try {
    const res = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subjects' LIMIT 1"
    );
    if (res.rows.length === 0) {
      const stmts = MIGRATION_SQL.split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of stmts) {
        await client.query(stmt);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Auto-migration notice (PGlite):", msg);
  }
}

function createDatabase(): { db: DbType; pool: Pool } {
  const isPostgresUrl =
    databaseUrl &&
    (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://"));

  if (isPostgresUrl) {
    const isLocalhost =
      databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

    const pool =
      globalForDb.__studyOsPool ??
      new Pool({
        connectionString: databaseUrl,
        ssl: isLocalhost ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

    if (process.env.NODE_ENV !== "production") {
      globalForDb.__studyOsPool = pool;
    }

    if (!globalForDb.__studyOsMigrated) {
      globalForDb.__studyOsMigrated = true;
      autoMigratePg(pool).catch(() => {});
    }

    return { db: drizzle(pool), pool };
  }

  // During Next.js production multi-worker build phases, use clean in-memory PGlite
  const isBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build";

  if (isBuild) {
    const client = new PGlite();
    return { db: drizzlePglite(client) as unknown as DbType, pool: client as unknown as Pool };
  }

  // Vercel serverless environment: only /tmp is writable
  const isVercel = Boolean(process.env.VERCEL);
  const baseDir = isVercel ? "/tmp" : process.cwd();
  const dataDir = path.join(baseDir, ".data", "study-os");

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const client = new PGlite(dataDir);
    const pgliteDb = drizzlePglite(client);

    if (!globalForDb.__studyOsMigrated) {
      globalForDb.__studyOsMigrated = true;
      autoMigratePglite(client).catch(() => {});
    }

    return { db: pgliteDb as unknown as DbType, pool: client as unknown as Pool };
  } catch (err) {
    console.error("PGlite directory unavailable, using in-memory:", err);
    const client = new PGlite();
    autoMigratePglite(client).catch(() => {});
    return { db: drizzlePglite(client) as unknown as DbType, pool: client as unknown as Pool };
  }
}

const instance = globalForDb.__studyOsDb
  ? { db: globalForDb.__studyOsDb, pool: globalForDb.__studyOsPool! }
  : createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__studyOsDb = instance.db;
  globalForDb.__studyOsPool = instance.pool;
}

export const db: DbType = instance.db;
export const pool: Pool = instance.pool;
