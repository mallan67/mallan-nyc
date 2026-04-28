// lib/compliance/gates.ts
//
// Canonical REBNY RLS distribution-gate evaluation — single source of truth.
//
// ──────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// Before this module, 7 Trestle-ingest code paths evaluated permissions with
// the pattern `raw.InternetEntireListingDisplayYN !== false`. That pattern
// fails OPEN: if Trestle omits the flag (null / undefined), the comparison
// returns true, so missing permission = displayable. The compliance doctrine
// is the opposite: fail CLOSED — any uncertainty defaults to non-displayable.
//
// This module encodes the fail-closed semantics in one function and supplies
// boolean coercion helpers so every ingest/display path agrees on how to
// interpret permission flags.
//
// SCOPE:
// This module is for evaluating permissions on DATA COMING IN from Trestle
// or stored in our DB. It is NOT for CRM form writes where the agent
// explicitly sets the flag via the UI (those use the raw value with a
// UI-level default).
// ──────────────────────────────────────────────────────────────────────────

import {
  Status,
  isActiveDisplayStatus,
  isTerminalStatus,
  type StatusValue,
} from "./status";

/**
 * Strict boolean coercion — fail-closed on ambiguity.
 *
 * `true`      → true
 * `false`     → false
 * `"true"`    → true  (Trestle OData occasionally returns boolean-as-string)
 * `"false"`   → false
 * `null`      → false (permission not specified; deny)
 * `undefined` → false (permission not specified; deny)
 * anything else → false
 *
 * This is the ONLY place boolean coercion on permission flags happens.
 * Every call site that reads an IDX/RLS permission boolean should go
 * through `affirmPermission()` below, which wraps this.
 */
export function coerceStrictBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false) return false;
  if (v === "true" || v === "TRUE") return true;
  if (v === "false" || v === "FALSE") return false;
  return false; // null, undefined, 0, 1, any other type → deny
}

/**
 * Affirm an REBNY permission flag. Returns `true` ONLY if the input was
 * explicitly true (or its string/number equivalent). Any other value —
 * false, null, undefined, missing — returns false.
 *
 * Use this for:
 *   - InternetEntireListingDisplayYN
 *   - InternetAddressDisplayYN
 *   - InternetAutomatedValuationDisplayYN
 *   - InternetConsumerCommentYN
 *   - IDXParticipationYN (if reading from historical data)
 *
 * Do NOT use for:
 *   - CRM form submissions (agent explicitly sets via UI; the checkbox's
 *     runtime-default value is the UI's concern, not this module's)
 */
export function affirmPermission(v: unknown): boolean {
  return coerceStrictBool(v);
}

/**
 * Shape that any gate evaluation accepts. Callers can use raw Trestle
 * records (PascalCase fields), DB rows (snake_case fields), or DTOs
 * (camelCase fields) — the helper normalizes.
 */
export interface PermissionInput {
  // Trestle PascalCase
  Permission?: unknown;
  Permissions?: unknown;
  StandardStatus?: unknown;
  MlsStatus?: unknown;
  InternetEntireListingDisplayYN?: unknown;
  InternetAddressDisplayYN?: unknown;
  CloseDate?: unknown;

  // DB snake_case
  permission?: unknown;
  permissions?: unknown;
  status?: unknown;
  internet_entire_listing_display_yn?: unknown;
  internet_address_display_yn?: unknown;
  close_date?: unknown;
  idx_display_yn?: unknown;
  owner_opt_out?: unknown;
  participant_only?: unknown;

  // DTO camelCase
  standardStatus?: unknown;
  internetEntireListingDisplayYN?: unknown;
  internetAddressDisplayYN?: unknown;
  closeDate?: unknown;
}

function readFirst<T = unknown>(o: PermissionInput, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (v !== undefined) return v as T;
  }
  return undefined;
}

function readPermissionString(o: PermissionInput): string {
  const v = readFirst<unknown>(o, ["Permission", "Permissions", "permission", "permissions"]);
  return typeof v === "string" ? v : "";
}

function readStatus(o: PermissionInput): StatusValue | null {
  const raw = readFirst<unknown>(o, ["StandardStatus", "MlsStatus", "standardStatus", "status"]);
  if (typeof raw !== "string") return null;
  // Import on demand to avoid top-level cycle with status.ts
  // (status.ts has no imports from this module, so this is safe).
   
  const { normalizeStatus } = require("./status") as typeof import("./status");
  return normalizeStatus(raw);
}

// ── Core helpers ─────────────────────────────────────────────────────────

/** Is this listing owner-opted-out (Gate 1)? */
export function isOwnerOptOut(input: PermissionInput): boolean {
  const p = readPermissionString(input);
  // Permission values per compliance/IDX-VOW-DISPLAY-RULES.md:31
  if (p === "OwnerOptOut" || p === "Owner Opt-Out") return true;
  // Legacy MlsStatus sentinel
  const mls = readFirst<unknown>(input, ["MlsStatus", "status"]);
  if (mls === "OwnerOptOut") return true;
  // DB-cached boolean (cron-populated)
  if (affirmPermission(input.owner_opt_out)) return true;
  return false;
}

/** Is this listing Participant-Only (Gate 2)? Permission='Private'. */
export function isParticipantOnly(input: PermissionInput): boolean {
  const p = readPermissionString(input);
  if (p === "Private") return true;
  if (affirmPermission(input.participant_only)) return true;
  return false;
}

/** Gate 3: Internet entire-listing display. Fail-closed on missing. */
export function isInternetEntireListingDisplayable(input: PermissionInput): boolean {
  return affirmPermission(
    readFirst(input, [
      "InternetEntireListingDisplayYN",
      "internet_entire_listing_display_yn",
      "internetEntireListingDisplayYN",
    ]),
  );
}

/** Gate cascade: address display only when entire-listing display is also true. */
export function isAddressDisplayable(input: PermissionInput): boolean {
  if (!isInternetEntireListingDisplayable(input)) return false;
  return affirmPermission(
    readFirst(input, [
      "InternetAddressDisplayYN",
      "internet_address_display_yn",
      "internetAddressDisplayYN",
    ]),
  );
}

/** Gate 5: Closed >24h ago → remove per REBNY UCBA Art. I §6. */
export function isClosedPast24Hours(input: PermissionInput): boolean {
  const status = readStatus(input);
  if (status !== Status.CLOSED && status !== Status.EXPIRED) return false;
  const rawDate = readFirst<unknown>(input, ["CloseDate", "close_date", "closeDate"]);
  if (!rawDate) return false;
  const closeDate = new Date(String(rawDate));
  if (Number.isNaN(closeDate.getTime())) return false;
  const hoursSince = (Date.now() - closeDate.getTime()) / (1000 * 60 * 60);
  return hoursSince > 24;
}

// ── Unified gate result ──────────────────────────────────────────────────

export interface GateResult {
  /** Can this listing be shown on any public IDX surface? */
  displayable: boolean;
  /** Can the street address be shown (subset of displayable)? */
  addressDisplayable: boolean;
  /** Is this Coming Soon (displayable with §16(C) badge required)? */
  comingSoon: boolean;
  /** Is this status Active-for-display (Active / ActiveUnderContract / ComingSoon)? */
  activeStatus: boolean;
  /** Machine-readable reason if `displayable=false`. */
  reason?: string;
}

/**
 * Single source-of-truth gate evaluation. Used by:
 *   - lib/idx/trestle-mapper.ts (Trestle ingest)
 *   - lib/idx/public-dto.ts (DTO sanitization)
 *   - lib/idx/mapping.ts (secondary Trestle path)
 *   - app/api/open-houses/route.ts (refactored to use this)
 *   - app/api/idx/search/route.ts (Trestle-direct search path)
 *   - app/api/idx/ensure-listing/route.ts (agent-backed listing hydration)
 *   - app/sitemap.ts (indexability decision)
 *
 * FAIL-CLOSED semantics: any missing permission flag = deny.
 */
export function evaluateDisplayGate(input: PermissionInput): GateResult {
  // Gate 1 — Owner Opt-Out (UCBA Art. I §5(A))
  if (isOwnerOptOut(input)) {
    return {
      displayable: false,
      addressDisplayable: false,
      comingSoon: false,
      activeStatus: false,
      reason: "Owner opted out",
    };
  }

  // Gate 2 — Participant-Only (UCBA Def. (W))
  if (isParticipantOnly(input)) {
    return {
      displayable: false,
      addressDisplayable: false,
      comingSoon: false,
      activeStatus: false,
      reason: "Participant-only listing",
    };
  }

  // Gate 3 — Internet entire-listing display (fail-closed on missing)
  if (!isInternetEntireListingDisplayable(input)) {
    return {
      displayable: false,
      addressDisplayable: false,
      comingSoon: false,
      activeStatus: false,
      reason: "Internet display disabled",
    };
  }

  // Gate 5 — Closed >24h
  if (isClosedPast24Hours(input)) {
    return {
      displayable: false,
      addressDisplayable: false,
      comingSoon: false,
      activeStatus: false,
      reason: "Closed listing > 24 hours",
    };
  }

  // Passed all blocking gates. Determine secondary signals.
  const status = readStatus(input);
  const activeStatus = status !== null && isActiveDisplayStatus(status);
  const terminal = status !== null && isTerminalStatus(status);
  const comingSoon = status === Status.COMING_SOON;

  return {
    displayable: !terminal, // terminal statuses are not displayable
    addressDisplayable: !terminal && isAddressDisplayable(input),
    comingSoon,
    activeStatus,
  };
}
