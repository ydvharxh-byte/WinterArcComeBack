const { PGlite } = require("@electric-sql/pglite");
const { drizzle } = require("drizzle-orm/pglite");
const { migrate } = require("drizzle-orm/pglite/migrator");
const path = require("path");
const fs = require("fs");

async function ensureDb() {
  const databaseUrl = process.env.DATABASE_URL;
  const isPostgresUrl = databaseUrl && (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://"));

  if (isPostgresUrl) {
    console.log("Using PostgreSQL at:", databaseUrl.replace(/:[^:@]+@/, ":***@"));
    return;
  }

  const dataDir = path.join(process.cwd(), ".data", "study-os");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const client = new PGlite(dataDir);
  const db = drizzle(client);
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (fs.existsSync(migrationsFolder)) {
    console.log("Applying database migrations to local embedded database...");
    await migrate(db, { migrationsFolder });
    console.log("Database schema is up to date.");
  }

  await client.close();
}

ensureDb().catch((err) => {
  console.error("Database preparation warning:", err.message);
});
