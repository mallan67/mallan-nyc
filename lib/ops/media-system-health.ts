/**
 * media:system-health — permanent, READ-ONLY invariant monitor for the unified
 * media pipeline. This is the "system health check" half of the binding rule
 * (Fix → targeted tests → build/check → system health → PR → prod verify): it
 * asserts cross-row invariants that unit tests on a single function cannot.
 *
 * Phase 1 wires the identity/key invariants (the defects the unified system
 * exists to kill: duplicate identities, colliding R2 keys, non-Photo heroes).
 * Sections that depend on later phases (reconcile backlog, orphan/dup R2
 * inventory, cursor liveness) report status "n/a" until those phases land —
 * they are placeholders so the check surface is stable, never silent.
 *
 * The monitor NEVER mutates. All data arrives through an injected read-only
 * reader so tests run with a stub and CI/prod runs read the real inventory.
 */
import { isListingPhoto, type CanonicalMediaType } from "@/lib/media/media-classifier";

export interface MediaInventoryRow {
  id: string;
  listingId: string;
  /** Trestle Media PK (identity component). */
  mediaKey: string;
  /** Lifecycle status; only 'active' rows participate in active-row invariants. */
  status: string;
  canonicalType: CanonicalMediaType;
  /** Versioned R2 object key, or null if not (yet) mirrored. */
  r2ObjectKey: string | null;
  /** Whether this row is currently resolved as a hero on any surface. */
  isHero: boolean;
}

export interface SystemHealthDeps {
  readInventory: () => Promise<MediaInventoryRow[]> | MediaInventoryRow[];
}

export type HealthStatus = "green" | "red" | "n/a";

export interface HealthCheck {
  id: string;
  status: HealthStatus;
  detail: string;
}

export interface SystemHealthReport {
  checks: HealthCheck[];
  red: number;
}

const isActive = (r: MediaInventoryRow): boolean => r.status === "active";

/** Keys of `map` whose count is > 1 (i.e. duplicated). */
function duplicates(map: Map<string, number>): string[] {
  const out: string[] = [];
  for (const [key, count] of map) if (count > 1) out.push(key);
  return out;
}

function tally(values: Iterable<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

/**
 * Run all invariant checks over the media inventory.
 *
 * @returns the per-check results plus the count of RED checks. `red === 0` is
 * the gate condition; any red is a hard stop for the caller (exit 1).
 */
export async function runSystemHealth(deps: SystemHealthDeps): Promise<SystemHealthReport> {
  const rows = await deps.readInventory();
  const active = rows.filter(isActive);
  const checks: HealthCheck[] = [];

  // 1) No two ACTIVE rows share a MediaKey. A duplicate active identity means
  //    the pipeline wrote the same Trestle media twice instead of updating —
  //    the churn defect the identity comparator exists to prevent.
  const dupKeys = duplicates(tally(active.map((r) => r.mediaKey)));
  checks.push({
    id: "identity.no_duplicate_active_media_key",
    status: dupKeys.length === 0 ? "green" : "red",
    detail:
      dupKeys.length === 0
        ? `${active.length} active rows, all media_key unique`
        : `duplicate active media_key: ${dupKeys.slice(0, 10).join(", ")}`,
  });

  // 2) No two ACTIVE rows share an r2_object_key. A shared key is the R2
  //    collision (position-based keys) that overwrote photos with floorplans.
  const dupR2 = duplicates(
    tally(active.filter((r) => r.r2ObjectKey != null).map((r) => r.r2ObjectKey as string)),
  );
  checks.push({
    id: "identity.no_shared_r2_object_key",
    status: dupR2.length === 0 ? "green" : "red",
    detail:
      dupR2.length === 0
        ? "no colliding r2_object_key among active rows"
        : `shared r2_object_key: ${dupR2.slice(0, 10).join(", ")}`,
  });

  // 3) Every hero-resolved row is a Photo. A hero that is a FloorPlan/Video/
  //    VirtualTour/Document means the single hero resolver was bypassed.
  const badHeroes = active.filter((r) => r.isHero && !isListingPhoto(r.canonicalType));
  checks.push({
    id: "identity.hero_is_photo_only",
    status: badHeroes.length === 0 ? "green" : "red",
    detail:
      badHeroes.length === 0
        ? "all resolved heroes are Photos"
        : `non-Photo heroes: ${badHeroes.slice(0, 10).map((r) => `${r.listingId}:${r.canonicalType}`).join(", ")}`,
  });

  // Later-phase sections — stable placeholders, never silently absent.
  for (const id of [
    "pipeline.cursor_liveness", // Phase 2
    "reconcile.no_stuck_pending_removal", // Phase 2
    "backlog.bounded_depth", // Phase 4
    "r2.no_orphans", // Phase 5
    "r2.no_duplicate_objects", // Phase 5
  ]) {
    checks.push({ id, status: "n/a", detail: "not yet wired (later phase)" });
  }

  return { checks, red: checks.filter((c) => c.status === "red").length };
}
