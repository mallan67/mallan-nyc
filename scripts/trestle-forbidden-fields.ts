// Pure, side-effect-free data + logic for the server-side Trestle field guard.
//
// Extracted from scripts/audit-server-trestle-coverage.ts so it is importable by
// unit tests (the audit script self-executes a network IIFE + process.exit on
// load and therefore cannot be imported directly). The audit imports these
// symbols; runtime behavior is unchanged.

// Common dead/renamed fields per CLAUDE.md "Fields That DO NOT EXIST on
// Trestle - NEVER USE". If the audit finds any of these in scanned code, it
// flags it. A snapshot live-parity test
// (lib/idx/__tests__/forbidden-fields-live-parity.test.ts) asserts every entry is
// phantom in the captured $metadata snapshot OR is a documented live-but-
// intentional exception (ResourceRecordID). The live-drift guard below
// (detectForbiddenNowLive) catches the same condition against FRESH live metadata
// when the audit runs in trestle-live-audit.yml.
export const FORBIDDEN_FIELDS: Record<string, string> = {
  IDXEntireListingDisplayYN: 'use InternetEntireListingDisplayYN',
  SyndicateYN: 'use SyndicateTo (multi-select)',
  VOWEntireListingDisplayYN: 'not on IDX Plus',
  VOWAutomatedValuationDisplayYN: 'not on IDX Plus',
  VOWConsumerCommentYN: 'not on IDX Plus',
  // MoveInCostsAmountTotal stays forbidden — still absent from live $metadata.
  // (MoveInCostsAmount + MoveInCostsComments were removed 2026-06-04: live Cotality
  // $metadata exposes both as Property fields. Live feed wins over the snapshot.)
  MoveInCostsAmountTotal: 'does not exist; MoveInCosts is a picklist only',
  FirstShowingDate: 'use ActivationDate',
  PossessionDate: 'RESO field, Trestle ignores',
  YearRenovated: 'does not exist',
  // Phantom media URL fields — they look plausible but no live resource exposes
  // them. The real model: Property carries VirtualTourURL* (tours/3D); the Media
  // resource carries item URLs (MediaURL/OriginalMediaUrl) classified by
  // MediaCategory (Photo / Floor Plan / Video / Virtual Tour). Guarded by
  // B26_MEDIA parity too; listed here so the server-code audit also catches them.
  VideoURL: 'phantom; Property uses VirtualTourURLBranded, or Media resource (MediaCategory=Video)',
  FloorPlanURL: 'phantom; use Media resource (MediaCategory="Floor Plan")',
  MatterportURL: 'phantom; 3D/tours are VirtualTourURLBranded/Unbranded on Property',
  InteractiveFloorPlanURL: 'phantom; use Media resource (MediaCategory="Floor Plan")',
  // Phantom social-media URL fields — neither the *URL names nor their old
  // ListingSocialMedia / BuildingSocialMedia rename targets exist on live. The
  // dead phantom→phantom rename entries were removed from lib/idx/trestle-mapper.ts.
  ListingSocialMediaURL: 'phantom; no live resource exposes this',
  BuildingSocialMediaURL: 'phantom; no live resource exposes this',
  ResourceRecordID: 'exists but NOT unique across MLOs — use ResourceRecordKey for Media joins',
};

// Forbidden fields that legitimately EXIST on live Trestle but are still banned
// from use (documented vendor guidance). These must NOT trip the live-drift
// guard — they are knowingly-live-but-forbidden, not vendor drift.
//   - ResourceRecordID: exists but is not unique across MLOs; ResourceRecordKey
//     is the join key (CLAUDE.md vendor-confirmed 2026-04-07).
export const FORBIDDEN_LIVE_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  'ResourceRecordID',
]);

/**
 * Live-drift guard. Returns the forbidden field names that have turned up in the
 * live Trestle $metadata SCHEMA and are NOT in the intentional allowlist — i.e. a
 * phantom the vendor has since made real, which means the guard list (and the
 * code that avoids the field) needs reconciling with proof.
 *
 * Pure: no I/O. The audit passes the live $metadata schema field set (the union
 * of byResource field Names — NOT the record-harvested CustomFields keys, which
 * are non-deterministic sampling); tests pass a simulated set.
 */
export function detectForbiddenNowLive(
  liveSchemaFields: ReadonlySet<string>,
  forbidden: Record<string, string> = FORBIDDEN_FIELDS,
  allowlist: ReadonlySet<string> = FORBIDDEN_LIVE_ALLOWLIST,
): string[] {
  return Object.keys(forbidden).filter(
    (field) => liveSchemaFields.has(field) && !allowlist.has(field),
  );
}
