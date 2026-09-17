/// <reference types="jest" />
/**
 * LANE 3 PACKET 2 — CONVERGENCE, PROVEN BEHAVIOURALLY.
 *
 * The clock itself is proven in crm-canonical-nurture-clock.test.ts. This suite proves the things
 * that only show up once the clock has CONSUMERS: that the lifecycle engine asks it instead of
 * guessing, that one client can no longer silence every other client, that the resulting alert is
 * actually visible to an agent, that no automated client email can resume, and that the two rival
 * cadence engines no longer own a clock.
 *
 * WHY SO MANY OF THESE ARE ASSERTIONS ABOUT ABSENCE. Packet 2 is mostly a deletion: three clocks
 * become one. A deletion is only durable if something fails when it comes back, so each retirement
 * has a guard that bites on reintroduction rather than a comment asking future readers not to.
 *
 * Source-text assertions appear only where the claim IS about source — a retired file, a deleted
 * function, a build artifact. Everything about behaviour drives the behaviour.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
/** Source with comment lines removed: history may name a retired symbol, code may not use it. */
const executable = (rel: string) =>
  read(rel)
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

/**
 * Every server source file, walked from disk.
 *
 * NOT A HAND-PICKED LIST, and that distinction is the whole point of this helper. The first version
 * of the retirement assertion below checked three files — engine.ts, growth-tools.ts and the
 * growth-tools route — none of which had ever written these columns. It therefore asserted nothing
 * while reading as proof, and the real writers (the client PATCH, the prospects PATCH allowlist and
 * the automation tier route) survived untouched and were reported as retired. A census that names
 * its own subjects can only ever confirm what its author already believed.
 */
function walkSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walkSources(rel, acc);
    else if (/\.(ts|tsx|js)$/.test(entry.name)) acc.push(rel);
  }
  return acc;
}

/** Files that WRITE a Lead field, by the shapes this repository actually uses to write one. */
function writersOf(field: string): string[] {
  const hits: string[] = [];
  for (const rel of [...walkSources('app'), ...walkSources('lib')]) {
    const src = executable(rel);
    if (
      src.includes(`update.${field} =`) ||
      src.includes(`updateData.${field} =`) ||
      src.includes(`${field}: tier`) ||
      new RegExp(`["']${field}["']\\s*,`).test(src) && /const allowed = \[/.test(src)
    ) {
      hits.push(rel);
    }
  }
  return hits;
}

// ═════════════════════════════════════════════════════════════════════════════
// A — the lifecycle engine asks the canonical clock
// ═════════════════════════════════════════════════════════════════════════════
describe('A · the lifecycle engine no longer keeps its own nurture clock', () => {
  it('the nurture finder reads the ledger, not a contact stamp', () => {
    const src = executable('lib/lifecycle/engine.ts');
    expect(src).toContain('resolveNurtureAnchorsBatch');
    expect(src).toContain('verdictFromAnchor');
  });

  it('last_contacted_at is gone from the engine entirely', () => {
    // It was the nurture due detector at engine.ts:333-336, and it is the wrong question: any
    // contact satisfied it, including a completed task, so an agent could defer a client's nurture
    // review by 80 days without sending them anything.
    expect(executable('lib/lifecycle/engine.ts')).not.toContain('last_contacted_at');
  });

  it('the 80-day window is gone', () => {
    const src = executable('lib/lifecycle/engine.ts');
    expect(src).not.toContain('getDate() - 80');
    expect(src).not.toMatch(/cutoff\.setDate/);
  });

  it('the finder honours the one pause control', () => {
    expect(executable('lib/lifecycle/engine.ts')).toContain('nurture_paused: false');
  });

  it('the cohort is the canonical Nurture state and nothing else', () => {
    const src = executable('lib/lifecycle/engine.ts');
    expect(src).toContain('pipeline_stage: { in: [...CANONICAL_NURTURE_STAGES] }');
    // The legacy tokens must not reappear as an operational predicate. An earlier revision kept
    // them here labelled "compatibility", which let a client who had left Nurture — or never been
    // in it — carry a nurture cadence: a second business rule wearing a compatibility label.
    expect(src).not.toContain('LEGACY_NURTURE_COMPAT_STAGES');
    // SCOPED TO THE COHORT QUERY, not to the file. The first version of this assertion searched the
    // whole of engine.ts for each legacy token and failed on 'new' — which now appears in the
    // notification's `status: 'new'`, a field this very packet added. A whole-file substring search
    // cannot tell a cohort predicate from an unrelated string literal.
    const finderStart = src.indexOf('async function findQuarterlyNurtureTargets');
    const finderEnd = src.indexOf('preferences: { select:', finderStart);
    const cohort = src.slice(finderStart, finderEnd);
    expect(cohort).toContain('pipeline_stage');
    for (const legacy of ['past', 'new', 'contacted']) {
      expect({ legacy, inCohort: cohort.includes(`'${legacy}'`) }).toEqual({ legacy, inCohort: false });
    }
  });

  it('the legacy stage set exists as census data and is used by no decision', () => {
    // Kept as a record of what the legacy predicate WAS, so the production census has something to
    // classify against. A constant nobody reads is a candidate for someone to wire up, so this pins
    // that no decision path imports it.
    expect(executable('lib/crm/nurture-due.ts')).toContain('LEGACY_NURTURE_COMPAT_STAGES');
    for (const rel of ['lib/lifecycle/engine.ts', 'app/api/crm/growth-tools/route.ts',
      'app/api/crm/clients/[id]/report-send/route.ts']) {
      expect({ rel, uses: executable(rel).includes('LEGACY_NURTURE_COMPAT_STAGES') })
        .toEqual({ rel, uses: false });
    }
  });

  it('the finder passes current stage into the verdict', () => {
    // Without this the clock could answer when a cycle started but never whether it applies.
    expect(executable('lib/lifecycle/engine.ts')).toContain('pipeline_stage: c.pipeline_stage');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — one client cannot silence the whole brokerage
// ═════════════════════════════════════════════════════════════════════════════
describe('B · the trigger-global cooldown no longer gates nurture', () => {
  it('the global gate explicitly exempts quarterly_nurture', () => {
    const src = executable('lib/lifecycle/engine.ts');
    // `last_executed_at` is a single column on the TRIGGER, so the pre-Packet-2 gate returned
    // before any target was examined: with cooldown_hours at 2016, ONE client's report suppressed
    // every other client's nurture review for twelve weeks.
    expect(src).toContain("trigger.trigger_type !== 'quarterly_nurture' && trigger.last_executed_at");
  });

  it('per-target dedupe survives — it is the gate that was always meant to space clients', () => {
    expect(executable('lib/lifecycle/engine.ts')).toContain('prisma.triggerExecution.findFirst');
  });

  it('TriggerExecution is NOT consulted by the canonical clock', () => {
    // It may dedupe processing. It does not decide when a relationship report is due.
    expect(executable('lib/crm/nurture-due.ts')).not.toContain('triggerExecution');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — the alert is visible, and says something true
// ═════════════════════════════════════════════════════════════════════════════
describe('C · the nurture alert reaches a surface an agent actually reads', () => {
  const src = () => executable('lib/lifecycle/engine.ts');

  it('goes through the canonical notification engine, so preferences apply', () => {
    expect(src()).toContain('createNotification');
  });

  it("carries channel 'alert' — the only channel the rendered reader returns", () => {
    // app/api/crm/alerts/route.ts filters channel:"alert". Without it the row took the schema
    // default 'in_app' and no reachable reader ever returned it.
    expect(read('app/api/crm/alerts/route.ts')).toContain('channel: "alert"');
    expect(src()).toContain("channel: 'alert'");
  });

  it("carries status 'new' — the only status the bell badge COUNTS", () => {
    // The list shows anything unresolved, but alerts.js counts only 'new', so a row can be
    // visible in the list and still leave the badge reading zero.
    expect(read('public/crm/js/dashboard/alerts.js')).toContain("a.status === 'new'");
    expect(src()).toContain("status: 'new'");
  });

  it('carries entityType/entityId, so the client workspace can match it', () => {
    expect(src()).toContain("entityType: 'client'");
    expect(src()).toContain('entityId: target.id');
  });

  it('no longer claims an update was sent', () => {
    // The old title was 'Quarterly market update sent' and the body said 'Watch for engagement'.
    // After Packet 1 nothing is sent and the agent is the one who must act.
    const raw = read('lib/lifecycle/engine.ts');
    expect(raw).not.toContain('return `Quarterly market update sent`');
    expect(executable('lib/lifecycle/engine.ts')).not.toContain('Watch for engagement');
  });

  it('records an undeliverable alert instead of dropping it', () => {
    expect(src()).toContain('lifecycle_alert_undeliverable_no_agent');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — no automatic generic nurture email can resume
// ═════════════════════════════════════════════════════════════════════════════
describe('D · automated client nurture mail cannot come back quietly', () => {
  it('the engine still coerces the nurture email action to an agent alert', () => {
    expect(executable('lib/lifecycle/engine.ts')).toContain(
      "target.context.trigger === 'quarterly_nurture' && actionType === 'email'",
    );
  });

  it('the client-facing nurture template REFUSES rather than falling through', () => {
    // Deleting the case would have been worse than leaving it: execution would reach the generic
    // branch and still send a client something. It throws so a reopened path fails loudly.
    const src = read('lib/email/templates.ts');
    expect(src).toContain("case 'quarterly_nurture':");
    expect(src).toContain('throw new Error(');
    expect(src).not.toContain('brief update on the New York market');
  });

  it('the lead-facing nurture subject is gone', () => {
    expect(read('lib/lifecycle/engine.ts')).not.toContain('Quarterly market update from Mallan');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E — Growth Tools displays the canonical fact and owns no cadence
// ═════════════════════════════════════════════════════════════════════════════
describe('E · Growth Tools is a projection, not a second authority', () => {
  it('its own cadence vocabulary is deleted', () => {
    const src = executable('lib/crm/growth-tools.ts');
    for (const gone of ['cadenceDays', 'monthly_report_due', 'quarterly_report_due', 'biannual']) {
      expect({ gone, present: src.includes(gone) }).toEqual({ gone, present: false });
    }
  });

  it('it renders the canonical verdict instead', () => {
    const src = executable('lib/crm/growth-tools.ts');
    expect(src).toContain('input.nurture');
    expect(src).toContain('nurture_report_due');
    expect(src).toContain('nurture_baseline_required');
  });

  it('it issues no database QUERY — the caller resolves and hands down', () => {
    // A projection that can reach the database is how it grew a second clock the first time.
    //
    // Note the precision, because the first version of this assertion was wrong: it banned the
    // string 'prisma' outright and failed on `import type { Prisma } from "@prisma/client"`, a
    // type-only import with no runtime effect that is used for Prisma.JsonValue. A type is not a
    // database reach. What must stay absent is a client instance and any query call.
    const src = executable('lib/crm/growth-tools.ts');
    expect(src).not.toMatch(/\bprisma\./);
    for (const query of ['findMany(', 'findFirst(', 'findUnique(', '.create(', '.update(', 'groupBy(']) {
      expect({ query, present: src.includes(query) }).toEqual({ query, present: false });
    }
  });

  it('the route resolves the verdict once for the whole page', () => {
    const src = executable('app/api/crm/growth-tools/route.ts');
    expect(src).toContain('resolveNurtureAnchorsBatch');
    expect(src).toContain('nurture_paused: true');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F — the second scheduler is retired
// ═════════════════════════════════════════════════════════════════════════════
describe('F · the tenant nurture ladder no longer owns a cadence', () => {
  it('the cron route is gone', () => {
    expect(existsSync(resolve(ROOT, 'app/api/cron/tenant-nurture/route.ts'))).toBe(false);
  });

  it('its schedule is gone, so it cannot fire', () => {
    expect(read('vercel.json')).not.toContain('/api/cron/tenant-nurture');
  });

  it.each([
    'outreach_6mo_date',
    'outreach_90d_date',
    'outreach_60d_date',
    'outreach_30d_date',
    'sales_drip_status',
    'rental_drip_status',
    'sales_drip_on',
    'rental_drip_on',
    'renewal_drip_on',
  ])('no file under app/ or lib/ writes %s', (field) => {
    // Walked from disk, not from a list. See walkSources above for why that matters here.
    expect({ field, writers: writersOf(field) }).toEqual({ field, writers: [] });
  });

  it('the client PATCH no longer accepts the retired cadence fields', () => {
    const src = executable('app/api/crm/clients/[id]/route.ts');
    for (const field of ['outreach_6mo_date', 'sales_drip_on', 'renewal_drip_on']) {
      expect({ field, accepted: src.includes(`body.${field} !== undefined`) }).toEqual({
        field,
        accepted: false,
      });
    }
  });

  it('it still RETURNS them, because they are real history', () => {
    // Read-only, not erased. No schema change: stored history is not deleted casually.
    const src = executable('app/api/crm/clients/[id]/route.ts');
    expect(src).toContain('outreach_6mo_date: lead.outreach_6mo_date');
    expect(src).toContain('sales_drip_status: lead.sales_drip_status');
  });

  it('the prospects PATCH allowlist no longer carries them', () => {
    const src = executable('app/api/crm/rentals/prospects/route.ts');
    // This allowlist copied caller values straight through with no validation, which made it a
    // second unvalidated writer of the legacy cadence — including the drip-status column whose two
    // incompatible vocabularies were the defect this packet removed.
    for (const field of ['outreach_6mo_date', 'sales_drip_status', 'rental_drip_on']) {
      expect({ field, present: src.includes(`"${field}"`) }).toEqual({ field, present: false });
    }
  });

  it('the manual cadence-tier route is retired', () => {
    // Its only job was writing the retired tier vocabulary, and it had zero callers repo-wide.
    expect(existsSync(resolve(ROOT, 'app/api/crm/automation/adjust-tier/route.ts'))).toBe(false);
  });

  it('Growth Tools no longer recommends joining the retired cadence', () => {
    expect(executable('lib/crm/growth-tools.ts')).not.toContain('Add to owner market report cadence');
  });

  it('listing-view engagement is NOT an input to the nurture clock', () => {
    // The retired cron froze its ladder on any recent view. That is backwards: a client browsing
    // listings has not received a report, so engagement may raise priority but must never
    // discharge, reset or suppress the obligation.
    expect(executable('lib/crm/nurture-due.ts')).not.toContain('listingView');
    expect(executable('lib/crm/nurture-due.ts')).not.toContain('ListingView');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G — the agent can now state nurture intent, and pause
// ═════════════════════════════════════════════════════════════════════════════
describe('G · the loop is closed at the agent end', () => {
  it('a real reportPurpose control exists in the CRM source', () => {
    expect(read('public/crm/html/modals/reports.html')).toContain('id="reportPurpose"');
  });

  it('it offers the nurture option the server understands', () => {
    const src = read('public/crm/html/modals/reports.html');
    expect(src).toContain('value="nurture"');
    expect(src).toContain('value="other"');
  });

  it('it is present in the BUILT artifact, so it is actually live', () => {
    // index-built.html inlines everything; a source-only change is not live until build.js runs.
    expect(read('public/crm/index-built.html')).toContain('id="reportPurpose"');
  });

  it('both send paths still read it', () => {
    const src = read('public/crm/js/output/reports.js');
    expect(src.split("getElementById('reportPurpose')").length - 1).toBe(2);
  });

  it('the pause control follows canonical Nurture membership, not legacy drip flags', () => {
    // nurture_paused became canonical server state in this packet while the UI still used retired
    // drip flags to decide whether its control was even rendered — so a client in the canonical
    // Nurture stage with no drip flag had no pause button at all. Split truth, one layer down.
    const src = read('public/crm/js/dashboard/panels/rentals-crm/tenant-workspace.js');
    expect(src).toContain("cl.pipeline_stage === 'nurturing'");
    expect(src).toContain('var inNurture');
  });

  it('nurture_paused is readable and writable end to end', () => {
    const src = executable('app/api/crm/clients/[id]/route.ts');
    expect(src).toContain('nurture_paused: lead.nurture_paused');
    expect(src).toContain('update.nurture_paused = Boolean(body.nurture_paused)');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H — stage transitions become durable history
// ═════════════════════════════════════════════════════════════════════════════
describe('H · a pipeline-stage change is now recoverable', () => {
  const src = () => executable('app/api/crm/clients/[id]/route.ts');

  it('writes a status_change row when the stage actually changes', () => {
    expect(src()).toContain("activity_type: \"status_change\"");
    expect(src()).toContain('update.pipeline_stage !== lead.pipeline_stage');
  });

  it('records BOTH the old and the new stage', () => {
    // The audit call records `fields: Object.keys(update)` — the field NAMES only — so it could say
    // that the stage changed but never what it changed TO. That is why there was no first anchor.
    expect(src()).toContain('old_pipeline_stage');
    expect(src()).toContain('new_pipeline_stage');
  });

  it('attributes the change to the acting agent', () => {
    expect(src()).toContain('actor_id: auth.userId');
  });

  it('does not write history when the stage did not change', () => {
    // Guarded on inequality, not merely on presence: a PATCH that resends the current stage is not
    // a transition, and treating it as one would litter the ledger with false baselines.
    expect(src()).toContain('update.pipeline_stage !== undefined && update.pipeline_stage !== lead.pipeline_stage');
  });
});
