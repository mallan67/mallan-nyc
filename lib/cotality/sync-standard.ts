/**
 * Canonical Cotality synchronization standard — TYPED accessors over the single
 * source of truth `lib/cotality/sync-standard.json`. Application code imports the
 * named constants below; the drift validator (`scripts/validate-cotality-cadence.js`)
 * reads the SAME json via JSON.parse. Neither maintains a second copy of the numbers.
 *
 * Documentation: docs/architecture/COTALITY-COMPLETE-REFERENCE.md §15.0.
 *
 * Refresh vs. poll — DO NOT CONFLATE:
 *  - REFRESH TARGET = how fast Cotality/Trestle reflects the *source MLS* in its
 *    own data. A PROVIDER-SIDE figure, NOT a polling interval. Cited verbatim —
 *    Cotality/Trestle FAQ, "How long does it take for data to update in Trestle?"
 *    (https://trestle-documentation.corelogic.com/faq.html, retrieved 2026-07-14):
 *    "listing data, agent data, etc. should be updated within 5 minutes of it
 *     being changed in the source MLS, and that images should be updated within
 *     15 minutes."
 *  - POLL CADENCE = how often *Mallan* queries Trestle for deltas. Cotality does
 *    NOT publish a required polling interval; the only guidance is a quota-safe
 *    range ("every few minutes to every hour"). Mallan independently chooses the
 *    cadence below to limit the additional consumer-side delay to no more than
 *    roughly the corresponding provider freshness window.
 *
 * Total staleness = source MLS + Cotality ingestion delay (the refresh target)
 *  + time until Mallan's next poll + sync execution time + app/cache propagation.
 *  Therefore 5-min Property polling does NOT guarantee 5-min total freshness, and
 *  15-min Media polling does NOT guarantee 15-min total freshness.
 */
import facts from './sync-standard.json';

/* Provider-side freshness TARGETS (Cotality/Trestle; NOT poll intervals) */
export const COTALITY_PROPERTY_REFRESH_TARGET_MINUTES = facts.cotality_property_refresh_target_minutes;
export const COTALITY_IMAGE_REFRESH_TARGET_MINUTES = facts.cotality_image_refresh_target_minutes;

/* Mallan's independently-chosen consumer POLL cadence */
export const MALLAN_PROPERTY_POLL_MINUTES = facts.mallan_property_poll_minutes;
export const MALLAN_MEDIA_POLL_MINUTES = facts.mallan_media_poll_minutes;

/* Mallan's ACCOUNT-SPECIFIC Trestle request quota (Trestle-11371-20) — NOT public */
export const TRESTLE_ACCOUNT_REQUEST_QUOTA_PER_HOUR = facts.trestle_account_request_quota_per_hour;

/* Execution-health thresholds: age of the last SUCCESSFUL job completion */
export const PROPERTY_RUN_WARNING_MINUTES = facts.property_run_warning_minutes;
export const PROPERTY_RUN_CRITICAL_MINUTES = facts.property_run_critical_minutes;
export const MEDIA_RUN_WARNING_MINUTES = facts.media_run_warning_minutes;
export const MEDIA_RUN_CRITICAL_MINUTES = facts.media_run_critical_minutes;

/* Cursor-freshness thresholds: how far the WATERMARK trails "now" (distinct from
 * run age — a job can complete successfully while the cursor falls behind). */
export const PROPERTY_CURSOR_WARNING_MINUTES = facts.property_cursor_warning_minutes;
export const PROPERTY_CURSOR_CRITICAL_MINUTES = facts.property_cursor_critical_minutes;
export const MEDIA_CURSOR_WARNING_MINUTES = facts.media_cursor_warning_minutes;
export const MEDIA_CURSOR_CRITICAL_MINUTES = facts.media_cursor_critical_minutes;

/* Execution rules */
export const DELTA_ONLY = facts.delta_only;
export const PAGINATE_ON_DEMAND = facts.paginate_on_demand;
export const BACKOFF_ON_429 = facts.backoff_on_429;
export const NO_OVERLAP = facts.no_overlap;
export const SUPPRESS_NOOP_WRITES_BEFORE_CADENCE = facts.suppress_noop_writes_before_cadence;

/* Phased enforcement — 'planned' (COT-1, report-only drift) → 'enforced' (COT-3). */
export const COTALITY_CADENCE_ENFORCEMENT = facts.cotality_cadence_enforcement as 'planned' | 'enforced';

/* COT-3 target vercel.json schedules (enforced once cadence is restored) */
export const EXPECTED_PROPERTY_CRON = facts.expected_property_cron;
export const EXPECTED_MEDIA_CRON = facts.expected_media_cron;
