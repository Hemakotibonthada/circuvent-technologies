// Verify a real Postgres/Neon database is reachable and the schema is ready.
// Non-destructive: creates tables if missing, does an isolated write/read/delete
// on a reserved key, and prints current row counts. Safe on production data.
//
// Usage (PowerShell):
//   $env:DATABASE_URL="postgres://USER:PASS@HOST/db?sslmode=require"; npx tsx scripts/verify-neon.ts
import * as db from "../src/lib/db";

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL is not set. Export it first, then re-run.");
    process.exit(1);
  }
  try {
    const res = await db.dbHealthcheck();
    console.log("✓ Connected and schema is ready.");
    console.log(`  round-trip write/read: ${res.ok ? "ok" : "FAILED"}`);
    console.log(`  existing rows — accounts: ${res.accounts}, admins: ${res.admins}, orders: ${res.orders}`);
    process.exit(res.ok ? 0 : 1);
  } catch (e) {
    console.error("✗ Could not connect / initialize:", (e as Error).message);
    process.exit(1);
  }
})();
