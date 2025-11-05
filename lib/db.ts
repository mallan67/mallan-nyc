/**
 * lib/db.ts
 * Export: named 'pool', default pool, and helper 'q<T>()'.
 * Uses runtime casts to avoid TS namespace/type issues with pg's types in mixed ESM/CJS environments.
 */
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://dev_user:dev_password@127.0.0.1:5432/mallan';

const PoolConstructor = (pg as any).Pool ?? (pg as any);
const pool = new (PoolConstructor as any)({
  connectionString,
  // add pool options here if needed
});

export { pool };
export default pool;

/** q<T>(text, params?) - run query and return typed rows */
export async function q<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await (pool as any).query(text, params);
  return (res && res.rows) ? (res.rows as T[]) : ([] as T[]);
}
