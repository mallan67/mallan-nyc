import { Pool } from "pg";
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export async function q(text: string, params: any[] = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}
