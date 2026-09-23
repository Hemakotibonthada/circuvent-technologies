import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";

/** Tagged-template SQL helper that always resolves to row arrays (Platform + Neon). */
export type AttendanceSql = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T[]>;

const g = globalThis as unknown as { __circuventAttendancePgPool?: Pool };

function usePgDriver(url: string): boolean {
  if (process.env.DATABASE_DRIVER === "pg") return true;
  if (process.env.DATABASE_SSL === "false") return true;
  return !url.toLowerCase().includes("neon.tech");
}

/**
 * Attendance reads HRMS when configured; otherwise falls back to the shop DB.
 * On Platform, prefer node-postgres (Neon HTTP cannot reach internal Postgres).
 */
export function getAttendanceDatabase(): AttendanceSql {
  const connectionString =
    process.env.HRMS_DATABASE_URL ||
    process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Attendance database connection string (HRMS_DATABASE_URL or DATABASE_URL) is not configured.");
  }

  if (usePgDriver(connectionString)) {
    if (!g.__circuventAttendancePgPool) {
      g.__circuventAttendancePgPool = new Pool({
        connectionString,
        max: Number(process.env.DATABASE_POOL_MAX ?? 5),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      });
    }
    const pool = g.__circuventAttendancePgPool;
    const sql: AttendanceSql = async (strings, ...values) => {
      const text = strings.reduce(
        (acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""),
        ""
      );
      const res = await pool.query(text, values as unknown[]);
      return res.rows as never;
    };
    return sql;
  }

  const client = neon(connectionString);
  const sql: AttendanceSql = async (strings, ...values) => {
    const rows = await client(strings, ...values);
    return rows as never;
  };
  return sql;
}
