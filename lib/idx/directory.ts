// lib/idx/directory.ts
// Read-only lookups against the LIVE Cotality Member and Office resources (identity fields only).
//
// Live contract, verified 2026-10-06 against api.cotality.com/trestle/odata with Mallan's own credential (GET only):
//   Member: MemberKey, MemberMlsId, MemberFullName, MemberStatus, OfficeKey, OfficeMlsId, OfficeName
//   Office: OfficeKey, OfficeMlsId, OfficeName, OfficeStatus, MainOfficeKey, MainOfficeMlsId
//   Property.ListAgentKey/-MlsId/-FullName equal Member.MemberKey/-MlsId/-FullName and Property.ListOfficeKey/-MlsId/-Name
//   equal Office.OfficeKey/-MlsId/-Name; the CoList* fields resolve to the same Member and Office rows.
// A firm is not one record: several Office records can share one MainOfficeMlsId (Corcoran Group rolls up to 334), so callers
// must never infer "same company" from office equality. This module returns what Cotality returns and nothing derived.
// Contact fields (email, phones, license numbers, addresses) are never selected.

import { getAccessToken, invalidateToken } from "./auth";
import { parseRetryAfterSeconds } from "./cotality-telemetry";

export const DIRECTORY_MEMBER_SELECT = [
  "MemberKey", "MemberMlsId", "MemberFullName", "MemberStatus", "OfficeKey", "OfficeMlsId", "OfficeName",
] as const;
export const DIRECTORY_OFFICE_SELECT = [
  "OfficeKey", "OfficeMlsId", "OfficeName", "OfficeStatus", "MainOfficeKey", "MainOfficeMlsId",
] as const;

export const DIRECTORY_DEFAULT_LIMIT = 15;
export const DIRECTORY_MAX_LIMIT = 25;
const MAX_TEXT_LENGTH = 60;
const MAX_WORDS = 4;
const MAX_IDS = 5;
const MIN_TEXT_LENGTH = 2;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

export interface DirectoryMember {
  key: string;
  mlsId: string;
  fullName: string;
  status: string;
  officeKey: string;
  officeMlsId: string;
  officeName: string;
}

export interface DirectoryOffice {
  key: string;
  mlsId: string;
  name: string;
  status: string;
  mainOfficeKey: string;
  mainOfficeMlsId: string;
}

export interface DirectoryResult<T> {
  rows: T[];
  total: number | null;
}

export interface MemberQuery {
  nameWords: string[];
  firmWords: string[];
  mlsIds: string[];
  officeMlsIds: string[];
  includeInactive: boolean;
  limit: number;
}

export interface OfficeQuery {
  nameWords: string[];
  mlsIds: string[];
  includeInactive: boolean;
  limit: number;
}

export type ParsedQuery<T> = { ok: true; query: T } | { ok: false; error: string };

export class DirectoryUpstreamError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "DirectoryUpstreamError";
  }
}

const esc = (value: string): string => value.replace(/'/g, "''");

function textWords(raw: string | null): string[] {
  if (!raw) return [];
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
  return cleaned.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
}

function textTooShort(words: string[]): boolean {
  return words.length > 0 && words.join(" ").length < MIN_TEXT_LENGTH;
}

/** Comma-separated MLS IDs. Cotality MLS IDs are digit strings; anything else is rejected, never passed through. */
function parseIds(raw: string | null): string[] | null {
  if (!raw) return [];
  const tokens = raw.split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length > MAX_IDS || !tokens.every((t) => /^\d{1,12}$/.test(t))) return null;
  return [...new Set(tokens)];
}

function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DIRECTORY_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), DIRECTORY_MAX_LIMIT);
}

function truthy(raw: string | null): boolean {
  return raw === "1" || raw === "true";
}

export function parseMemberQuery(params: URLSearchParams): ParsedQuery<MemberQuery> {
  const nameWords = textWords(params.get("name"));
  const firmWords = textWords(params.get("firm"));
  const mlsIds = parseIds(params.get("mlsId"));
  const officeMlsIds = parseIds(params.get("officeMlsId"));
  if (mlsIds === null || officeMlsIds === null) {
    return { ok: false, error: `mlsId and officeMlsId must be up to ${MAX_IDS} comma-separated digit strings` };
  }
  if (textTooShort(nameWords) || textTooShort(firmWords)) {
    return { ok: false, error: `name and firm need at least ${MIN_TEXT_LENGTH} characters` };
  }
  if (!nameWords.length && !firmWords.length && !mlsIds.length && !officeMlsIds.length) {
    return { ok: false, error: "Provide name, firm, mlsId or officeMlsId" };
  }
  return {
    ok: true,
    query: { nameWords, firmWords, mlsIds, officeMlsIds, includeInactive: truthy(params.get("includeInactive")), limit: parseLimit(params.get("limit")) },
  };
}

export function parseOfficeQuery(params: URLSearchParams): ParsedQuery<OfficeQuery> {
  const nameWords = textWords(params.get("name"));
  const mlsIds = parseIds(params.get("mlsId"));
  if (mlsIds === null) return { ok: false, error: `mlsId must be up to ${MAX_IDS} comma-separated digit strings` };
  if (textTooShort(nameWords)) return { ok: false, error: `name needs at least ${MIN_TEXT_LENGTH} characters` };
  if (!nameWords.length && !mlsIds.length) return { ok: false, error: "Provide name or mlsId" };
  return { ok: true, query: { nameWords, mlsIds, includeInactive: truthy(params.get("includeInactive")), limit: parseLimit(params.get("limit")) } };
}

function orEquals(field: string, values: string[]): string {
  const terms = values.map((v) => `${field} eq '${esc(v)}'`);
  return terms.length === 1 ? terms[0] : `(${terms.join(" or ")})`;
}

export function buildMemberFilter(q: MemberQuery): string {
  const parts: string[] = [];
  if (!q.includeInactive) parts.push("MemberStatus eq 'Active'");
  if (q.mlsIds.length) parts.push(orEquals("MemberMlsId", q.mlsIds));
  if (q.officeMlsIds.length) parts.push(orEquals("OfficeMlsId", q.officeMlsIds));
  for (const w of q.nameWords) parts.push(`contains(MemberFullName,'${esc(w)}')`);
  for (const w of q.firmWords) parts.push(`contains(OfficeName,'${esc(w)}')`);
  return parts.join(" and ");
}

export function buildOfficeFilter(q: OfficeQuery): string {
  const parts: string[] = [];
  if (!q.includeInactive) parts.push("OfficeStatus eq 'Active'");
  if (q.mlsIds.length) parts.push(orEquals("OfficeMlsId", q.mlsIds));
  for (const w of q.nameWords) parts.push(`contains(OfficeName,'${esc(w)}')`);
  return parts.join(" and ");
}

const str = (value: unknown): string => (value == null ? "" : String(value));

export function toDirectoryMember(row: Record<string, unknown>): DirectoryMember {
  return {
    key: str(row.MemberKey),
    mlsId: str(row.MemberMlsId),
    fullName: str(row.MemberFullName),
    status: str(row.MemberStatus),
    officeKey: str(row.OfficeKey),
    officeMlsId: str(row.OfficeMlsId),
    officeName: str(row.OfficeName),
  };
}

export function toDirectoryOffice(row: Record<string, unknown>): DirectoryOffice {
  return {
    key: str(row.OfficeKey),
    mlsId: str(row.OfficeMlsId),
    name: str(row.OfficeName),
    status: str(row.OfficeStatus),
    mainOfficeKey: str(row.MainOfficeKey),
    mainOfficeMlsId: str(row.MainOfficeMlsId),
  };
}

function baseUrl(): string {
  return process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
}

const cache = new Map<string, { expiresAt: number; value: { rows: Record<string, unknown>[]; total: number | null } }>();

async function request(url: string, token: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function odataGet(
  resource: "Member" | "Office",
  filter: string,
  select: readonly string[],
  orderby: string,
  top: number,
): Promise<{ rows: Record<string, unknown>[]; total: number | null }> {
  const params = new URLSearchParams();
  params.set("$filter", filter);
  params.set("$select", select.join(","));
  params.set("$orderby", orderby);
  params.set("$top", String(top));
  params.set("$count", "true");
  const url = `${baseUrl()}/odata/${resource}?${params.toString()}`;

  const hit = cache.get(url);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let response = await request(url, await getAccessToken());
  if (response.status === 401) {
    invalidateToken();
    response = await request(url, await getAccessToken());
  }
  if (!response.ok) {
    throw new DirectoryUpstreamError(
      response.status,
      `Cotality ${resource} query failed (${response.status})`,
      response.status === 429 ? parseRetryAfterSeconds(response.headers.get("retry-after")) : null,
    );
  }
  const body = (await response.json()) as { value?: Record<string, unknown>[]; "@odata.count"?: number };
  const value = {
    rows: Array.isArray(body.value) ? body.value : [],
    total: body["@odata.count"] != null ? Number(body["@odata.count"]) : null,
  };
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export async function searchMembers(q: MemberQuery): Promise<DirectoryResult<DirectoryMember>> {
  const { rows, total } = await odataGet("Member", buildMemberFilter(q), DIRECTORY_MEMBER_SELECT, "MemberFullName asc", q.limit);
  return { rows: rows.map(toDirectoryMember).filter((m) => m.mlsId), total };
}

export async function searchOffices(q: OfficeQuery): Promise<DirectoryResult<DirectoryOffice>> {
  const { rows, total } = await odataGet("Office", buildOfficeFilter(q), DIRECTORY_OFFICE_SELECT, "OfficeName asc", q.limit);
  return { rows: rows.map(toDirectoryOffice).filter((o) => o.mlsId), total };
}

/** Test seam: the cache is module-level so repeated typeahead keystrokes do not re-hit Cotality. */
export function clearDirectoryCache(): void {
  cache.clear();
}
