import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const g = globalThis as unknown as { pgPool?: Pool };

const sslOption =
  process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false }; // dev fallback

export const pool =
  g.pgPool ??
  new Pool({
    connectionString,
    ssl: sslOption,
  });

if (!g.pgPool) g.pgPool = pool;
