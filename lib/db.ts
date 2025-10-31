import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function q(text: string, params: any[] = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}