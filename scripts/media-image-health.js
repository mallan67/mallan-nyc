// P1C5 (deep-review L11): pure image-coverage health policy for ops-health.
//
// The first-image metric previously classified from listings.media JSON ONLY,
// so JSON-empty-but-TABLE-served listings (1,696 at the 2026-06-10 data audit)
// were alarmed as "empty media (placeholder rendered)" while the PR-4 reader
// renders them fine from listing_media — monitoring chased the wrong layer and
// drove corrective work at the wrong place. The alarm now keys off
// no_image_any_layer (JSON empty AND no active listing_media row) — the REAL
// render-path placeholder count, and the number that sizes Phase-3/M4.
//
// Pure CommonJS, same pattern as branch-prune-health.js / r2-retry-health.js.

const THRESHOLDS = {
  no_image_warn: 1000, // >= 1K IDX-displayable render the placeholder on EVERY layer
  no_image_critical: 5000,
};

/**
 * Pure classifier: counts → ops-health issues.
 * Nothing disappears, it is re-labeled (silent-failure principle): the legacy
 * JSON-empty count stays reported/printed by the caller; only the ALARM moves
 * to the real render-path number.
 * @param {{ noImageAnyLayer: number }} counts
 * @returns {Array<{ level: 'warning'|'critical', category: string, msg: string }>}
 */
function deriveImageIssues(counts) {
  const n = Number(counts.noImageAnyLayer) || 0;
  if (n >= THRESHOLDS.no_image_critical) {
    return [{
      level: 'critical',
      category: 'media-sync',
      msg: `${n} IDX-displayable listings have NO image in ANY layer (JSON empty AND no active listing_media row — placeholder rendered; critical >= ${THRESHOLDS.no_image_critical})`,
    }];
  }
  if (n >= THRESHOLDS.no_image_warn) {
    return [{
      level: 'warning',
      category: 'media-sync',
      msg: `${n} IDX-displayable listings have NO image in ANY layer (placeholder rendered; warn >= ${THRESHOLDS.no_image_warn})`,
    }];
  }
  return [];
}

module.exports = { THRESHOLDS, deriveImageIssues };
