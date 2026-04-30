/**
 * lib/scanner/compliance/suppression.ts
 *
 * The compliance gate. Single entry point for "may we surface this prospect
 * to a Mallan agent / broker for outreach?"
 *
 * Composes:
 *   1. NY DOS C&D zone geographic check (19 NYCRR § 175.17[b])
 *   2. Per-Mallan suppression list (BBL / owner_name / phone / email / address)
 *
 * NOT included in v0:
 *   - NYS DNC + FTC DNC phone-list check. Phone outreach is deferred per
 *     the v1 plan (letter + email only). When phone outreach is enabled,
 *     wire the DNC check in here.
 *
 * Fail-CLOSED on bad input: missing/invalid input fields are not treated
 * as "all-clear" — they're treated as "incomplete check, do not surface."
 * This matches the pattern in `lib/compliance/gates.ts` for distribution
 * gates (null permission flags = NOT displayable).
 */
import suppressionFile from "@/data/scanner/compliance/mallan-suppression-list.json";
import type {
  SuppressionEntry,
  SuppressionInput,
  SuppressionListFile,
  SuppressionVerdict,
} from "@/lib/scanner/compliance/types";
import { isInCeaseDesistZone } from "@/lib/scanner/compliance/cease-desist";

const LIST = suppressionFile as SuppressionListFile;

/** Lower-case + trim + collapse whitespace. */
function normalize(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

/** Strip non-digits, drop a leading "1" country code on 11-digit US numbers. */
function normalizePhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/** Lower + trim. */
function normalizeEmail(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).trim().toLowerCase();
}

/** Returns true if the entry's expires_at is in the future relative to `now`. */
function isLive(entry: SuppressionEntry, now: Date): boolean {
  const expires = Date.parse(entry.expires_at);
  if (!Number.isFinite(expires)) return false;
  return expires > now.getTime();
}

/**
 * Match a single suppression entry against the input.
 * Returns the reason string if matched, otherwise null.
 */
function matchEntry(entry: SuppressionEntry, input: SuppressionInput): string | null {
  switch (entry.type) {
    case "bbl": {
      const v = normalize(entry.value);
      const q = normalize(input.bbl);
      if (v && q && v === q) return `BBL ${entry.value} (${entry.reason})`;
      return null;
    }
    case "owner_name": {
      const v = normalize(entry.value);
      const q = normalize(input.owner_name);
      if (v && q && v === q) return `Owner "${entry.value}" (${entry.reason})`;
      return null;
    }
    case "phone": {
      const v = normalizePhone(entry.value);
      const q = normalizePhone(input.phone);
      if (v && q && v === q) return `Phone ${entry.value} (${entry.reason})`;
      return null;
    }
    case "email": {
      const v = normalizeEmail(entry.value);
      const q = normalizeEmail(input.email);
      if (v && q && v === q) return `Email ${entry.value} (${entry.reason})`;
      return null;
    }
    case "address": {
      const v = normalize(entry.value);
      const q = normalize(input.address);
      if (v && q && v === q) return `Address ${entry.value} (${entry.reason})`;
      return null;
    }
    default:
      return null;
  }
}

/**
 * Compliance gate. Returns `{ suppressed: true, reasons: [...] }` if the
 * prospect should NOT be surfaced for outreach.
 *
 * Returns `{ suppressed: false, reasons: [] }` only when no zone, no
 * suppression list entry matches.
 */
export function isSuppressed(input: SuppressionInput, now: Date = new Date()): SuppressionVerdict {
  const reasons: string[] = [];
  const matched_entries: SuppressionVerdict["matched_entries"] = [];

  // 1. Geographic — NY DOS C&D zone
  if (input.lat != null && input.lng != null) {
    const cd = isInCeaseDesistZone(input.lat, input.lng);
    if (cd.in_zone) {
      const r = `NY DOS Cease & Desist Zone: ${cd.zone_name || cd.zone_id || "unnamed"} (${cd.boro || "boro unknown"})`;
      reasons.push(r);
      matched_entries.push({ source: "cease_desist_zone", detail: r });
    }
  }

  // 2. Per-Mallan suppression list (live entries only)
  for (const entry of LIST.entries || []) {
    if (!isLive(entry, now)) continue;
    const matchReason = matchEntry(entry, input);
    if (matchReason) {
      reasons.push(matchReason);
      matched_entries.push({ source: "suppression_list", detail: matchReason });
    }
  }

  return { suppressed: reasons.length > 0, reasons, matched_entries };
}

/** Number of live (non-expired) entries on the per-Mallan suppression list. */
export function suppressionListLiveCount(now: Date = new Date()): number {
  return (LIST.entries || []).filter((e) => isLive(e, now)).length;
}

/** Total entries (including expired) on the per-Mallan list. */
export function suppressionListTotalCount(): number {
  return (LIST.entries || []).length;
}

/** Minimum exclusion period configured in the policy. */
export function suppressionMinExclusionDays(): number {
  return LIST.policy?.minimum_exclusion_period_days || 365;
}
