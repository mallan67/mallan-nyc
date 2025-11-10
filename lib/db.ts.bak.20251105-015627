/**
 * lib/db.ts — runtime-safe db pool and helper.
 * Keeps runtime code untyped to avoid TS2709/TS2347 issues in mixed ESM/CJS environments.
 */
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://dev_user:dev_password@127.0.0.1:5432/mallan';

const PoolConstructor = (pg as any).Pool ?? (pg as any);
const pool = new (PoolConstructor as any)({
  connectionString,
});

export { pool };
export default pool;

export async function q<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await (pool as any).query(text, params);
  return (res && res.rows) ? (res.rows as T[]) : ([] as T[]);
}
