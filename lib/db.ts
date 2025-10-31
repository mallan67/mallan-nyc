// lib/db.ts
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Reuse the pool across hot reloads / serverless invocations
const g = globalThis as unknown as { pgPool?: Pool };

export const pool =
  g.pgPool ??
  new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Neon
  });

if (!g.pgPool) g.pgPool = pool;

/** Tiny SQL helper used by API routes */
export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
