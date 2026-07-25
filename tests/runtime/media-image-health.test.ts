/// <reference types="jest" />
/**
 * P1C5 — table-aware no-image policy (RED→GREEN: module absent on main) +
 * the ghost-log line queued from RC5.
 *
 * ops-health alarmed on the JSON-empty count alone; 1,696 IDX-displayable
 * listings were JSON-empty but TABLE-served (2026-06-10 data audit) — the
 * placeholder alarm fired about listings that render fine. The alarm now keys
 * off no_image_any_layer (JSON empty AND no active listing_media row).
 */

import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const policy = require('../../scripts/media-image-health.js') as {
  THRESHOLDS: { no_image_warn: number; no_image_critical: number };
  deriveImageIssues: (c: { noImageAnyLayer: number }) => Array<{ level: string; msg: string }>;
};

describe('P1C5 — deriveImageIssues policy', () => {
  it('the historical false alarm dies: JSON-empty-but-table-served does not reach the classifier; any-layer 0 → zero issues', () => {
    // Fixture mirrors the 2026-06-10 audit: 1,696 table-served listings were
    // previously counted into the alarm. The classifier only sees the
    // render-path truth.
    expect(policy.deriveImageIssues({ noImageAnyLayer: 0 })).toEqual([]);
  });

  it('boundaries pinned (>= semantics on both, matching the legacy alarm): 999 quiet · 1000 warn · 5000 critical', () => {
    expect(policy.deriveImageIssues({ noImageAnyLayer: 999 })).toEqual([]);
    expect(policy.deriveImageIssues({ noImageAnyLayer: 1000 })).toMatchObject([{ level: 'warning' }]);
    expect(policy.deriveImageIssues({ noImageAnyLayer: 4999 })).toMatchObject([{ level: 'warning' }]);
    expect(policy.deriveImageIssues({ noImageAnyLayer: 5000 })).toMatchObject([{ level: 'critical' }]);
  });

  it('the message names the real condition (no image in ANY layer), never the legacy JSON-empty phrasing', () => {
    const [issue] = policy.deriveImageIssues({ noImageAnyLayer: 6000 });
    expect(issue.msg).toContain('ANY layer');
    expect(issue.msg).toContain('no active listing_media row');
  });
});

describe('P1C5 — structural locks (secondary guards, never the only proof)', () => {
  it('ops-health classifies the split in SQL (table-served vs no-image-any-layer) and alarms via the policy module', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/ops-health.js'), 'utf8');
    expect(src).toContain('json_empty_table_served');
    expect(src).toContain('no_image_any_layer');
    expect(src).toContain('deriveImageIssues');
    // Codex #391 + review: "table-served" must mean a row that can actually
    // supply a CARD image — URL-bearing and photo-eligible under the SAME
    // semantics as isPhotoMedia (listing-card-media.ts: case-insensitive,
    // '' and 'image' eligible) — not any active row (a FloorPlan/Video-only
    // listing still renders the placeholder).
    expect(src).toMatch(/LOWER\(COALESCE\(lm\.media_type, ''\)\) IN \('photo', 'image', ''\) AND COALESCE\(lm\.media_url_cached, lm\.media_url_original\) IS NOT NULL/);
    // Legacy fields retained — re-labeled, never hidden.
    expect(src).toContain('first_image_empty');
    expect(src).toContain('first_image_table_served');
  });

  it('media-sync member logs skipped ghosts (queued from RC5 — the JSON is returned, never logged)', () => {
    // W2 (2026-07-24): the media-sync WORK (incl. the ghost-log line) was
    // extracted from the public route into the in-process member function.
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/idx/media-sync-member.ts'),
      'utf8',
    );
    expect(src).toMatch(/ghost_listings_skipped > 0/);
    expect(src).toMatch(/ghost listings skipped/);
  });
});
