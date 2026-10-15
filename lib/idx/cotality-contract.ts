// lib/idx/cotality-contract.ts
// ONE small reader for the LIVE Cotality (Trestle) data contract: which Property fields exist,
// their types, every picklist (enum) member, and which REBNY custom keys are observed inside
// CustomProperty.CustomFields. Nothing is hard-coded here: the contract is read from
// `$metadata` and a CustomProperty sample, cached in-process (TTL) so listing saves do not call
// Cotality each time and the shared account quota stays protected.
//
// Reuses lib/idx/auth.ts for the token. REBNY compliance rules live in
// lib/compliance/rebny-validator.ts; this module only answers "does this field / value exist
// in live Cotality?".

import { getAccessToken } from "./auth";

export interface CotalityPropertyField {
  /** Edm type, e.g. Edm.String, Edm.Decimal, Edm.Boolean, or an enum name. */
  type: string;
  /** Name of the picklist when the field is an enum. */
  enumName?: string;
  /** Multi-select picklist (comma separated / array of members). */
  multi?: boolean;
}

export interface CotalityContract {
  fetchedAt: number;
  fields: Map<string, CotalityPropertyField>;
  enums: Map<string, Set<string>>;
  /** Keys observed inside CustomProperty.CustomFields (REBNY custom keys). */
  customKeys: Set<string>;
}

export class CotalityContractUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CotalityContractUnavailableError";
  }
}

const TTL_MS = Math.max(60_000, Number(process.env.COTALITY_CONTRACT_TTL_MS) || 12 * 60 * 60 * 1000);
/** A stale contract may still be used when Cotality is unreachable, up to this age. */
const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const CUSTOM_SAMPLE = 500;

let cache: CotalityContract | null = null;
let inflight: Promise<CotalityContract> | null = null;

function baseUrl(): string {
  const base = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || "https://api.cotality.com/trestle";
  return `${base.replace(/\/+$/, "")}/odata`;
}

async function getText(path: string): Promise<string> {
  const token = await getAccessToken();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${baseUrl()}/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/xml, application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Cotality ${path.slice(0, 40)} -> HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Parse the Property entity + every EnumType out of a `$metadata` document. */
export function parseMetadata(xml: string): { fields: Map<string, CotalityPropertyField>; enums: Map<string, Set<string>> } {
  const fields = new Map<string, CotalityPropertyField>();
  const enums = new Map<string, Set<string>>();
  const ent = /<EntityType Name="Property">([\s\S]*?)<\/EntityType>/.exec(xml);
  if (ent) {
    const re = /<Property Name="([^"]+)" Type="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ent[1]))) {
      const type = m[2];
      const enumMatch = /Enums\.(Multi\.)?([A-Za-z0-9_]+)\)?$/.exec(type);
      const isCollection = /^Collection\(/.test(type);
      const multi = !!(enumMatch && (enumMatch[1] || isCollection));
      fields.set(m[1], enumMatch ? { type, enumName: enumMatch[2], multi } : { type });
    }
  }
  const reEnum = /<EnumType Name="([^"]+)"[^>]*>([\s\S]*?)<\/EnumType>/g;
  let e: RegExpExecArray | null;
  while ((e = reEnum.exec(xml))) {
    const members = new Set<string>();
    for (const mm of e[2].matchAll(/<Member Name="([^"]+)"/g)) members.add(mm[1]);
    enums.set(e[1], members);
  }
  return { fields, enums };
}

/** Union of the keys found in a sample of CustomProperty.CustomFields JSON blobs. */
export function parseCustomKeys(json: { value?: Array<{ CustomFields?: string | null }> }): Set<string> {
  const keys = new Set<string>();
  for (const row of json.value ?? []) {
    if (!row.CustomFields) continue;
    try {
      for (const k of Object.keys(JSON.parse(row.CustomFields))) keys.add(k);
    } catch {
      /* unparsable blob - ignore */
    }
  }
  return keys;
}

async function load(): Promise<CotalityContract> {
  const xml = await getText("$metadata");
  const { fields, enums } = parseMetadata(xml);
  if (fields.size < 100 || enums.size < 20) throw new Error("Cotality $metadata parsed to an implausibly small contract");
  const cp = await getText(`CustomProperty?$top=${CUSTOM_SAMPLE}&$select=ListingKey,CustomFields`);
  const customKeys = parseCustomKeys(JSON.parse(cp));
  return { fetchedAt: Date.now(), fields, enums, customKeys };
}

/**
 * Live contract, cached for the TTL. When Cotality cannot be reached: a previously cached
 * contract (up to a week old) is returned; with a COLD cache this throws
 * CotalityContractUnavailableError so callers can refuse (never silently pass).
 */
export async function getCotalityContract(): Promise<CotalityContract> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = load()
      .then((c) => {
        cache = c;
        return c;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    return await inflight;
  } catch (err) {
    if (cache && Date.now() - cache.fetchedAt < STALE_MAX_MS) return cache;
    throw new CotalityContractUnavailableError(
      `Live Cotality contract is unavailable (${err instanceof Error ? err.message : "unknown"}); cannot verify field names and picklist values.`,
    );
  }
}

/** Test seam: seed or clear the in-process cache. */
export function __setCotalityContractForTest(c: CotalityContract | null): void {
  cache = c;
  inflight = null;
}

export interface ContractFinding {
  field: string;
  problem: "unknown-field" | "invalid-value" | "unknown-custom-key";
  detail: string;
}

/**
 * Check a payload's Cotality-shaped keys against the live contract.
 *  - key capitalised like a Cotality field (starts upper-case) and not in Property $metadata
 *    nor observed in CustomFields -> flagged
 *  - enum fields: every value must be a live member
 *  - CustomFields keys are only checked for existence (observed list)
 * Mallan-only keys (sale*, rental*, _internal, lower-case) are ignored: they are never sent to Cotality.
 */
export function checkPayloadAgainstContract(
  contract: CotalityContract,
  payload: Record<string, unknown>,
  opts?: { mallanOnlyKeys?: ReadonlySet<string> },
): ContractFinding[] {
  const out: ContractFinding[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (!/^[A-Z]/.test(key) || opts?.mallanOnlyKeys?.has(key)) continue;
    const f = contract.fields.get(key);
    if (!f) {
      if (!contract.customKeys.has(key)) {
        out.push({ field: key, problem: "unknown-field", detail: `${key} is not a Cotality Property field and not an observed CustomFields key` });
      }
      continue;
    }
    if (!f.enumName || value === null || value === undefined || value === "") continue;
    const members = contract.enums.get(f.enumName);
    if (!members) continue;
    const vals = Array.isArray(value) ? value : f.multi && typeof value === "string" ? value.split(",") : [value];
    for (const v of vals) {
      const s = String(v).trim();
      if (s && !members.has(s)) {
        out.push({ field: key, problem: "invalid-value", detail: `${key}="${s}" is not a live ${f.enumName} value` });
      }
    }
  }
  return out;
}
