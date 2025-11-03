// prefer Vercel's DATABASE_URL_UNPOOLED if present so code always sees DATABASE_URL
if (!process.env.DATABASE_URL && process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * Keep a global holder with the pool + connectionString so we can:
 *  - reuse the pool across hot reloads (dev)
 *  - recreate the pool when DATABASE_URL changes (so password updates take effect)
 */
declare global {
  // eslint-disable-next-line no-var
  var __pgHolder: { pool: Pool; connectionString?: string } | undefined;
}

const sslOption =
  process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false };

// If there's a global holder and its connection string matches, reuse the pool.
// If the connection string changed, shutdown old pool and create a new one.
if (!global.__pgHolder || global.__pgHolder.connectionString !== connectionString) {
  // Try to close the previous pool gracefully (best-effort)
  if (global.__pgHolder && global.__pgHolder.pool) {
    try {
      // end() returns a promise but we don't await here because this file runs during startup
      global.__pgHolder.pool.end().catch(() => {});
    } catch (e) {
      // ignore
    }
  }

  const newPool = new Pool({
    connectionString,
    ssl: sslOption as any,
  });

  global.__pgHolder = { pool: newPool, connectionString };
}

export const pool: Pool = global.__pgHolder!.pool;

/**
 * q(sql, params?) helper — returns rows[].
 */
export async function q<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

/** queryOne: returns first row or null */
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows.length ? rows[0] : null;
}
