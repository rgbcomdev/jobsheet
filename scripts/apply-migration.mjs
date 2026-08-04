/**
 * Apply supabase/migrations/001_init.sql using DATABASE_URL or DB password.
 *
 * Usage:
 *   set DATABASE_URL=postgresql://postgres.[REF]:[DB_PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
 *   node --env-file=.env.local scripts/apply-migration.mjs
 *
 * Or:
 *   SUPABASE_DB_PASSWORD=your_db_password node --env-file=.env.local scripts/apply-migration.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sql = fs.readFileSync(
  path.join(root, "supabase", "migrations", "001_init.sql"),
  "utf8"
);

const ref = "sdnvdboqgxwdwviwmjit";
const region = "ap-southeast-1";
const password =
  process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || "";

const connectionString =
  process.env.DATABASE_URL ||
  (password
    ? `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`
    : "");

if (!connectionString) {
  console.error(
    "Set SUPABASE_DB_PASSWORD (Database Settings password) or DATABASE_URL"
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("Connected. Applying migration…");
await client.query(sql);
console.log("Migration applied successfully.");
await client.end();
