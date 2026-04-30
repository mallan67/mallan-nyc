/**
 * lib/scanner/contact/aggregator.ts
 *
 * Combines multiple `SourceContactRow` records (from different sources) into
 * a single `ContactRecord` with per-field provenance and cross-source
 * confidence.
 *
 * Cross-source agreement rule:
 *   - A field that appears in 2+ independent sources with matching normalized
 *     values gets bumped to "medium" confidence even without active verification.
 *   - 3+ sources OR active verification → "high" confidence.
 *   - Single source, no verification → "low".
 *   - Unparseable / structural-only → "unverified".
 *
 * Active verification methods (USPS / Twilio Lookup / NeverBounce) are
 * NOT performed here — they're outside-network calls. This module just
 * accepts a `verifications` map keyed by normalized value if the caller
 * has already verified.
 */
import type {
  Confidence,
  ContactField,
  ContactFieldKind,
  ContactRecord,
  ContactSource,
  SourceContactRow,
  VerificationMethod,
} from "@/lib/scanner/contact/types";

/** Trim, lower-case, strip commas/periods, collapse whitespace.
 *  Mirrors dos-corp-filter's normalizeEntityName so PLUTO + ACRIS + DOS
 *  cross-source matches succeed despite formatting variations like
 *  "ACME, LLC" vs "ACME LLC" vs "ACME L.L.C.". */
export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

/** Strip non-digits, drop a leading "1" country code on 11-digit US numbers. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/** Trim, lower-case. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Trim, upper-case, collapse whitespace, normalize common abbrev. */
export function normalizeAddress(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bAPARTMENT\b/g, "APT")
    .replace(/\bUNIT\b/g, "APT")
    .replace(/\.$/, "");
}

function normalize(kind: ContactFieldKind, value: string): string {
  switch (kind) {
    case "phone": return normalizePhone(value);
    case "email": return normalizeEmail(value);
    case "address": return normalizeAddress(value);
    case "name":
    case "owner_entity":
      return normalizeName(value);
  }
}

interface VerificationInfo {
  verified: boolean;
  method: VerificationMethod;
  at?: string;
}

/** Optional verification map keyed by `${kind}:${normalized}`. */
export type VerificationMap = Map<string, VerificationInfo>;

function verificationKey(kind: ContactFieldKind, normalized: string): string {
  return `${kind}:${normalized}`;
}

function deriveConfidence(
  sourceCount: number,
  verified: boolean,
  method: VerificationMethod,
  hasNonStructuralValue: boolean,
): Confidence {
  if (!hasNonStructuralValue) return "unverified";
  // Active verification (USPS / Twilio / NeverBounce / owner-response) → always high
  const activelyVerified =
    verified && method !== "none" && method !== "cross_source_agreement";
  if (activelyVerified) return "high";
  // Cross-source agreement: 3+ → high, 2 → medium
  if (sourceCount >= 3) return "high";
  if (sourceCount >= 2) return "medium";
  return "low";
}

interface FieldAccumulator {
  value: string;          // canonical (first-seen) value
  normalized: string;
  sources: ContactSource[];
  source_urls: (string | undefined)[];
  source_captured_ats: string[];
  source_record_dates: (string | undefined)[];
}

function bestValue(values: string[]): string {
  // Prefer the longest non-empty value (richer formatting wins).
  return values
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || "";
}

function buildField(
  kind: ContactFieldKind,
  acc: FieldAccumulator,
  verifications: VerificationMap,
): ContactField {
  const verifKey = verificationKey(kind, acc.normalized);
  const verifInfo = verifications.get(verifKey) || {
    verified: false,
    method: "none" as VerificationMethod,
  };
  const sourceCount = new Set(acc.sources).size;
  const hasValue = acc.normalized.length > 0;
  // Cross-source agreement upgrade: if no active verification but ≥2 sources
  // agree on the same normalized value, mark verified=cross_source_agreement.
  const finalVerified = verifInfo.verified || sourceCount >= 2;
  const finalMethod: VerificationMethod = verifInfo.verified
    ? verifInfo.method
    : sourceCount >= 2
      ? "cross_source_agreement"
      : "none";
  return {
    kind,
    value: acc.value,
    normalized: acc.normalized,
    source: acc.sources[0],
    source_url: acc.source_urls.find(Boolean),
    source_captured_at: acc.source_captured_ats[0],
    source_record_date: acc.source_record_dates.find(Boolean),
    verified: finalVerified,
    verification_method: finalMethod,
    verification_at: verifInfo.at,
    confidence: deriveConfidence(sourceCount, finalVerified, finalMethod, hasValue),
  };
}

function accumulate(
  byNormalized: Map<string, FieldAccumulator>,
  kind: ContactFieldKind,
  rawValue: string,
  source: ContactSource,
  sourceUrl: string | undefined,
  sourceCapturedAt: string,
  sourceRecordDate: string | undefined,
) {
  const value = String(rawValue || "").trim();
  if (!value) return;
  const norm = normalize(kind, value);
  if (!norm) return;
  const acc = byNormalized.get(norm) || {
    value,
    normalized: norm,
    sources: [],
    source_urls: [],
    source_captured_ats: [],
    source_record_dates: [],
  };
  // Prefer richer canonical value
  if (value.length > acc.value.length) acc.value = value;
  acc.sources.push(source);
  acc.source_urls.push(sourceUrl);
  acc.source_captured_ats.push(sourceCapturedAt);
  acc.source_record_dates.push(sourceRecordDate);
  byNormalized.set(norm, acc);
}

/**
 * Aggregate multiple SourceContactRow records into one ContactRecord.
 *
 * - Records with the same `bbl` are merged.
 * - Within a bbl, fields are de-duped by normalized value across sources.
 * - Cross-source agreement upgrades confidence automatically.
 */
export function aggregateContacts(
  rows: SourceContactRow[],
  verifications: VerificationMap = new Map(),
  now: Date = new Date(),
): ContactRecord {
  if (rows.length === 0) {
    return emptyRecord(null, now);
  }

  const bbl = rows.find((r) => r.bbl)?.bbl ?? null;
  const ownerEntity = new Map<string, FieldAccumulator>();
  const names = new Map<string, FieldAccumulator>();
  const phones = new Map<string, FieldAccumulator>();
  const emails = new Map<string, FieldAccumulator>();
  const addresses = new Map<string, FieldAccumulator>();
  const sources = new Set<ContactSource>();

  for (const row of rows) {
    sources.add(row.source);
    const capturedAt = row.source_captured_at || now.toISOString();
    if (row.owner_entity) {
      accumulate(ownerEntity, "owner_entity", row.owner_entity, row.source, row.source_url, capturedAt, row.source_record_date);
    }
    for (const n of row.names || []) {
      accumulate(names, "name", n, row.source, row.source_url, capturedAt, row.source_record_date);
    }
    for (const p of row.phones || []) {
      accumulate(phones, "phone", p, row.source, row.source_url, capturedAt, row.source_record_date);
    }
    for (const e of row.emails || []) {
      accumulate(emails, "email", e, row.source, row.source_url, capturedAt, row.source_record_date);
    }
    for (const a of row.addresses || []) {
      accumulate(addresses, "address", a, row.source, row.source_url, capturedAt, row.source_record_date);
    }
  }

  const ownerEntityField = pickFirstByCount(ownerEntity, "owner_entity", verifications);
  const nameFields = sortedByCount(names, "name", verifications);
  const phoneFields = sortedByCount(phones, "phone", verifications);
  const emailFields = sortedByCount(emails, "email", verifications);
  const addressFields = sortedByCount(addresses, "address", verifications);

  const allFields: ContactField[] = [
    ...(ownerEntityField ? [ownerEntityField] : []),
    ...nameFields, ...phoneFields, ...emailFields, ...addressFields,
  ];
  const overall: Confidence = allFields.length === 0
    ? "unverified"
    : highestConfidence(allFields.map((f) => f.confidence));

  return {
    bbl,
    owner_entity: ownerEntityField,
    names: nameFields,
    phones: phoneFields,
    emails: emailFields,
    addresses: addressFields,
    overall_confidence: overall,
    source_count: sources.size,
    sources: [...sources],
    aggregated_at: now.toISOString(),
  };
}

function pickFirstByCount(
  byNormalized: Map<string, FieldAccumulator>,
  kind: ContactFieldKind,
  verifications: VerificationMap,
): ContactField | null {
  const accs = [...byNormalized.values()];
  if (accs.length === 0) return null;
  accs.sort((a, b) => new Set(b.sources).size - new Set(a.sources).size);
  return buildField(kind, accs[0], verifications);
}

function sortedByCount(
  byNormalized: Map<string, FieldAccumulator>,
  kind: ContactFieldKind,
  verifications: VerificationMap,
): ContactField[] {
  const accs = [...byNormalized.values()];
  accs.sort((a, b) => new Set(b.sources).size - new Set(a.sources).size);
  return accs.map((a) => buildField(kind, a, verifications));
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unverified: 0,
};

function highestConfidence(values: Confidence[]): Confidence {
  let best: Confidence = "unverified";
  for (const v of values) {
    if (CONFIDENCE_RANK[v] > CONFIDENCE_RANK[best]) best = v;
  }
  return best;
}

export function emptyRecord(bbl: string | null, now: Date = new Date()): ContactRecord {
  return {
    bbl,
    owner_entity: null,
    names: [],
    phones: [],
    emails: [],
    addresses: [],
    overall_confidence: "unverified",
    source_count: 0,
    sources: [],
    aggregated_at: now.toISOString(),
  };
}
