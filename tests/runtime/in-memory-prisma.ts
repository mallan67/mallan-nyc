/**
 * A rollback-only Prisma stand-in: tables live in memory for one test, so the REAL route handlers can be exercised end to end
 * (create → read → edit → read → list) without a database. Nothing it does reaches Neon or any record.
 *
 * It understands the subset of the Prisma query API the CRM routes use: where (equals / in / notIn / not / startsWith / endsWith /
 * contains / gte / gt / lte / lt / has / OR / AND / NOT / null), skip / take, select of relations (answered empty), _count, the
 * relation writes connect / disconnect / set, upsert, the raw MAX(listing_id) query of the id generator, and $transaction.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

export function inMemoryPrisma(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const ids: Record<string, bigint> = {};
  const nextId = (t: string) => { ids[t] = (ids[t] ?? 1000n) + 1n; return ids[t]; };
  const scalar = (v: any) => v === null || v === undefined || typeof v !== 'object' || v instanceof Date || typeof v === 'bigint';
  const same = (a: any, b: any) => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a instanceof Date || b instanceof Date) return new Date(a).getTime() === new Date(b).getTime();
    return typeof a !== 'object' && typeof b !== 'object' && String(a) === String(b);
  };
  const cmp = (a: any, b: any) => (a instanceof Date || b instanceof Date ? new Date(a).getTime() - new Date(b).getTime() : Number(a) - Number(b));
  const matches = (w: any, row: Row): boolean => {
    if (!w) return true;
    return Object.entries(w).every(([k, v]: [string, any]) => {
      if (k === 'OR') return (v as any[]).some((x) => matches(x, row));
      if (k === 'AND') return (v as any[]).every((x) => matches(x, row));
      if (k === 'NOT') return !matches(v, row);
      const cur = row[k];
      if (!scalar(v) && !Array.isArray(v)) {
        return Object.entries(v).every(([op, val]: [string, any]) => {
          switch (op) {
            case 'equals': return same(cur, val);
            case 'not': return val !== null && !scalar(val) ? !matches({ [k]: val }, row) : !same(cur, val);
            case 'in': return (val as any[]).some((x) => same(cur, x));
            case 'notIn': return !(val as any[]).some((x) => same(cur, x));
            case 'startsWith': return typeof cur === 'string' && cur.startsWith(val);
            case 'endsWith': return typeof cur === 'string' && cur.endsWith(val);
            case 'contains': return typeof cur === 'string' && cur.toLowerCase().includes(String(val).toLowerCase());
            case 'gte': return cur != null && cmp(cur, val) >= 0;
            case 'gt': return cur != null && cmp(cur, val) > 0;
            case 'lte': return cur != null && cmp(cur, val) <= 0;
            case 'lt': return cur != null && cmp(cur, val) < 0;
            case 'has': return Array.isArray(cur) && cur.includes(val);
            case 'hasSome': return Array.isArray(cur) && (val as any[]).some((x) => cur.includes(x));
            case 'isEmpty': return (Array.isArray(cur) ? cur.length === 0 : true) === val;
            case 'mode': return true;
            default: return true;
          }
        });
      }
      if (v === null) return cur == null;
      return same(cur, v);
    });
  };
  const applyData = (row: Row, data: Row) => {
    for (const [k, v] of Object.entries(data ?? {})) {
      if (!scalar(v) && !Array.isArray(v)) {
        if ('connect' in v) { row[k + '_id'] = (v as any).connect.id; continue; }
        if ('disconnect' in v) { row[k + '_id'] = null; continue; }
        if ('set' in v && Object.keys(v).length === 1) { row[k] = (v as any).set; continue; }
        if ('increment' in v) { row[k] = (row[k] ?? 0) + (v as any).increment; continue; }
      }
      row[k] = v;
    }
    return row;
  };
  const shape = (row: Row, select: any) => {
    const out: Row = { ...row };
    for (const [k, v] of Object.entries(select ?? {})) {
      if (k === '_count' && v && typeof v === 'object') { out._count = Object.fromEntries(Object.keys((v as any).select ?? {}).map((x) => [x, 0])); continue; }
      if (v && typeof v === 'object' && !(k in out)) out[k] = [];
    }
    return out;
  };
  const model = (t: string) => {
    const rows = () => (tables[t] ??= []);
    const find = (w: any) => rows().filter((r) => matches(w, r));
    return {
      findUnique: async (a: any) => { const r = find(a?.where)[0]; return r ? shape(r, a?.select) : null; },
      findFirst: async (a: any) => { const r = find(a?.where)[0]; return r ? shape(r, a?.select) : null; },
      findMany: async (a: any) => { let r = find(a?.where); if (a?.skip) r = r.slice(a.skip); if (a?.take) r = r.slice(0, a.take); return r.map((x) => shape(x, a?.select)); },
      count: async (a: any) => find(a?.where).length,
      create: async (a: any) => { const row = applyData({ id: nextId(t), created_at: new Date(), updated_at: new Date() }, a.data); rows().push(row); return { ...row }; },
      update: async (a: any) => { const row = find(a.where)[0]; if (!row) throw new Error(`${t}: no row for ${JSON.stringify(a.where, (_, v) => (typeof v === 'bigint' ? String(v) : v))}`); applyData(row, a.data); row.updated_at = new Date(); return { ...row }; },
      updateMany: async (a: any) => { const r = find(a?.where); r.forEach((x) => applyData(x, a.data)); return { count: r.length }; },
      upsert: async (a: any) => { const row = find(a.where)[0]; if (row) { applyData(row, a.update); return { ...row }; } const n = applyData({ id: nextId(t), created_at: new Date(), updated_at: new Date() }, a.create); rows().push(n); return { ...n }; },
      delete: async (a: any) => { const i = rows().findIndex((r) => matches(a.where, r)); return i >= 0 ? rows().splice(i, 1)[0] : null; },
      deleteMany: async (a: any) => { const before = rows().length; tables[t] = rows().filter((r) => !matches(a?.where, r)); return { count: before - rows().length }; },
      aggregate: async () => ({}),
      groupBy: async () => [],
    };
  };
  const prisma: any = new Proxy({}, {
    get(_, name: string | symbol) {
      if (typeof name === 'symbol' || name === 'then') return undefined;
      if (name === '$transaction') return async (cb: any) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb));
      if (name === '$queryRaw' || name === '$queryRawUnsafe') return async () => {
        const seqs = (tables.listing ?? []).map((l) => parseInt(String(l.listing_id ?? '').replace(/^[A-Za-z]+-/, ''), 10)).filter((n) => !isNaN(n));
        return [{ max_seq: seqs.length ? Math.max(...seqs) : null }];
      };
      if (name === '$executeRaw' || name === '$executeRawUnsafe') return async () => 0;
      if (name === '$connect' || name === '$disconnect') return async () => undefined;
      return model(name);
    },
  });
  return { prisma, tables };
}
