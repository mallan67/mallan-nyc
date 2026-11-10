/**
 * Deduplicate findings without losing a citation.
 *
 * Two findings are one when they are filed against the same property AND either cite the same page
 * (after dropping tracking parameters, "www", a fragment and a trailing slash) or name the same
 * organization with the same kind. Different properties and different kinds never merge.
 *
 * A merge keeps every citation and the newest evidence date. When the merged findings disagree on
 * verification it keeps the WEAKEST status, and a conflict wins: a merge can lower confidence, never
 * raise it.
 */
import type { AcquisitionOpportunity, Citation, MergedOpportunity, VerificationStatus } from './types';

const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid)$/i;

// Weakest first: conflicting < unverified < partially_verified < verified.
const STRENGTH: Record<VerificationStatus, number> = { conflicting: 0, unverified: 1, partially_verified: 2, verified: 3 };

export function normalizeSourceUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const search = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    return `${host}${path}${search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

export function normalizeName(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function keysFor(o: AcquisitionOpportunity): string[] {
  const keys = [`u|${o.property_key}|${normalizeSourceUrl(o.source_url)}`];
  const name = normalizeName(o.name);
  if (name) keys.push(`n|${o.property_key}|${o.kind}|${name}`);
  return keys;
}

const union = (lists: string[][]): string[] => [...new Set(lists.flat())];

function merge(items: AcquisitionOpportunity[]): MergedOpportunity {
  const base = items.reduce((best, cur) => (cur.evidence_date > best.evidence_date ? cur : best), items[0]);

  const byUrl = new Map<string, Citation>();
  for (const it of items) {
    const key = normalizeSourceUrl(it.source_url);
    const seen = byUrl.get(key);
    if (!seen || it.evidence_date > seen.evidence_date) {
      byUrl.set(key, { url: seen ? seen.url : it.source_url, evidence_date: it.evidence_date });
    }
  }

  const weakest = items.reduce<VerificationStatus>(
    (w, it) => (STRENGTH[it.verification] < STRENGTH[w] ? it.verification : w),
    items[0].verification,
  );

  return {
    ...base,
    verification: weakest,
    signals: union(items.map((i) => i.signals)),
    unknowns: union(items.map((i) => i.unknowns)),
    is_sample: items.some((i) => i.is_sample === true) || undefined,
    citations: [...byUrl.values()],
  };
}

/** Merge duplicate findings. Input order decides the output order of the groups. */
export function dedupeOpportunities(list: AcquisitionOpportunity[]): MergedOpportunity[] {
  const groups: Array<{ items: AcquisitionOpportunity[]; keys: Set<string> }> = [];
  for (const item of list) {
    const keys = keysFor(item);
    const hits = groups.filter((g) => keys.some((k) => g.keys.has(k)));
    if (hits.length === 0) {
      groups.push({ items: [item], keys: new Set(keys) });
      continue;
    }
    // The finding may bridge two groups: fold them into the first.
    const [first, ...rest] = hits;
    first.items.push(item);
    keys.forEach((k) => first.keys.add(k));
    for (const g of rest) {
      first.items.push(...g.items);
      g.keys.forEach((k) => first.keys.add(k));
      groups.splice(groups.indexOf(g), 1);
    }
  }
  return groups.map((g) => merge(g.items));
}
