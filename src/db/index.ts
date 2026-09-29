import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import path from "path";
import fs from "fs";

type DbType = ReturnType<typeof drizzle>;

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __studyOsDb?: DbType;
  __studyOsPool?: Pool;
};

function createDatabase(): { db: DbType; pool: Pool } {
  const isPostgresUrl =
    databaseUrl &&
    (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://"));

  if (isPostgresUrl) {
    const pool =
      globalForDb.__studyOsPool ??
      new Pool({
        connectionString: databaseUrl,
      });

    if (process.env.NODE_ENV !== "production") {
      globalForDb.__studyOsPool = pool;
    }

    return { db: drizzle(pool), pool };
  }

  // During multi-worker production builds, use in-memory PGlite to avoid file locks
  const isBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build";

  if (isBuild) {
    const client = new PGlite();
    const pgliteDb = drizzlePglite(client);
    return { db: pgliteDb as unknown as DbType, pool: client as unknown as Pool };
  }

  // Fallback to local persistent PGlite database
  const dataDir = path.join(process.cwd(), ".data", "study-os");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const client = new PGlite(dataDir);
  const pgliteDb = drizzlePglite(client);

  return { db: pgliteDb as unknown as DbType, pool: client as unknown as Pool };
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
