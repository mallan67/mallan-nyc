/**
 * THE ONE NURTURE CLOCK.
 *
 * Packet 1 built the nurture discharge ledger and gave it no reader. The canonical send route
 * wrote `qualifies_nurture` and `delivery_status`; a repo-wide search found no consumer of either.
 * With nothing able to answer "has this client's nurture obligation been discharged?", three
 * independent clocks answered it their own way:
 *
 *   lib/lifecycle/engine.ts       a client is due when their last contact is over 80 days old
 *   app/api/cron/tenant-nurture   a manual anchor advanced through a 6mo/90d/60d/30d ladder
 *   lib/crm/growth-tools.ts       a cadence tier parsed off a drip-status column
 *
 * None of the three could see a report that had actually been sent. This module replaces all
 * three, and it reads exactly one source of truth: the ledger.
 *
 * ── THE ANCHOR ORDER (owner-ruled)
 *
 *   1. newest ACCEPTED ActivityLog `client_report_sent` carrying qualifies_nurture = true
 *   2. otherwise a VERIFIED transition into the canonical Nurture state
 *   3. otherwise UNANCHORED
 *
 * ── MEMBERSHIP
 *
 * 'nurturing' is the canonical Nurture state, and entry into it establishes a baseline. The three
 * other stages the legacy engine swept in are compatibility only: they can produce a DUE
 * obligation on the strength of a real qualifying report, but never an UNANCHORED baseline, since
 * that would assert membership from an unclassified legacy predicate. See
 * LEGACY_NURTURE_COMPAT_STAGES.
 *
 * ── WHY UNANCHORED IS A STATE AND NOT A FALLBACK DATE
 *
 * It lets the platform say the true thing: this client belongs in Nurture, but Mallan has no
 * reliable evidence of when the cycle began. Every available substitute means something else. A
 * last-contact stamp records any contact at all and is written by task completion. A re-engagement
 * anchor is a hand-entered rental date with no automatic writer. A row's update stamp records any
 * field edit. The outreach dates belong to the ladder this packet retires. Anchoring on any of
 * them would invent a six-month obligation out of a timestamp that never meant that, so an
 * unanchored client is reported as needing a baseline rather than given a manufactured due date.
 *
 * ── EXPLICITLY NOT THE CLOCK
 *
 * TriggerExecution. It may dedupe processing so one firing does not alert twice, but it does not
 * decide when a relationship report is due. Listing-view engagement is likewise not an input
 * here: a client browsing listings has not received a report, so engagement may raise priority
 * elsewhere but cannot discharge, reset or suppress this obligation.
 */
import prisma from '@/lib/prisma';

/** The relationship baseline: roughly two meaningful reports a year, rolling six months apart. */
export const NURTURE_INTERVAL_MONTHS = 6;

/** The activity_type the canonical send route writes on an accepted qualifying report. */
export const NURTURE_DISCHARGE_ACTIVITY = 'client_report_sent';

/** The activity_type carrying durable pipeline-stage transition history. */
export const STAGE_TRANSITION_ACTIVITY = 'status_change';

/**
 * The canonical Nurture relationship state. Entry into it establishes a nurture baseline.
 *
 * ONE TOKEN, OWNER-RULED. An earlier revision shipped this EMPTY, on the reasoning that populating
 * it would canonise the legacy engine cohort before the business-state question was settled. That
 * produced a contradiction rather than caution: the engine went on treating
 * nurturing|past|new|contacted as nurture obligations, so the legacy cohort was being used as the
 * membership rule while the code claimed no rule had been chosen. Both could not be true.
 *
 * 'nurturing' is the canonical state. The production status/stage census is needed to CLASSIFY and
 * migrate legacy rows safely — it is not a reason to leave the canonical state undefined.
 */
export const CANONICAL_NURTURE_STAGES: readonly string[] = ['nurturing'];

/**
 * The three extra stages the legacy engine swept into its nurture cohort.
 *
 * RECORDED FOR THE CENSUS TO CLASSIFY AGAINST. NOT a membership rule, and deliberately not used by
 * any decision in this module or by the lifecycle cohort query — a guard in
 * tests/runtime/crm-nurture-convergence.test.ts pins that.
 *
 * An earlier revision of this packet kept these in the engine's operational cohort under the label
 * "compatibility", letting a legacy-stage client with a qualifying report still generate a due
 * obligation. That was a SECOND business rule wearing a compatibility label: it meant a client who
 * had left Nurture, or who had never been in it, could carry a nurture cadence. How these rows
 * should be migrated is a question for the authorized production status/stage census. Until then
 * they acquire no canonical nurture obligations at all.
 */
export const LEGACY_NURTURE_COMPAT_STAGES: readonly string[] = ['past', 'new', 'contacted'];

export type NurtureAnchor =
  | { kind: 'qualifying_report'; at: Date }
  | { kind: 'stage_entry'; at: Date }
  | { kind: 'unanchored' };

export type NurtureDue =
  /** Not currently in the canonical Nurture relationship state. No obligation applies. */
  | { state: 'not_applicable' }
  | { state: 'paused' }
  | { state: 'unanchored'; action: 'nurture_baseline_required' }
  | { state: 'due'; due_at: Date; anchor: NurtureAnchor }
  | { state: 'scheduled'; due_at: Date; anchor: NurtureAnchor };

/**
 * The only Lead facts this evaluation is permitted to see.
 *
 * Narrow on purpose. A wider parameter would let a future edit reach a retired clock without
 * anything failing, which is how the three competing clocks accumulated in the first place.
 *
 * pipeline_stage is here because HISTORY AND APPLICABILITY ARE DIFFERENT FACTS. An earlier revision
 * of this module omitted it, so the clock could only answer "when did the cycle start?" and never
 * "should this clock be running at all?". Two bad cases followed: a client who entered Nurture six
 * months ago and has since moved to active kept generating due obligations off historical records,
 * and a client sitting in new or contacted could acquire a nurture cadence outright because an
 * agent marked one report as nurture follow-up. Both contradict the canonical rule that
 * pipeline_stage 'nurturing' IS the Nurture relationship state.
 */
export type NurtureLead = {
  id: bigint;
  nurture_paused: boolean;
  pipeline_stage: string | null;
};

/** Whether a lead is CURRENTLY in the canonical Nurture relationship state. */
export function isInCanonicalNurture(pipelineStage: string | null | undefined): boolean {
  return CANONICAL_NURTURE_STAGES.includes(String(pipelineStage ?? ''));
}

/** Anchor plus the interval. Six CALENDAR months, so the date of month is preserved. */
export function nurtureDueAt(anchor: Date): Date {
  const due = new Date(anchor.getTime());
  due.setUTCMonth(due.getUTCMonth() + NURTURE_INTERVAL_MONTHS);
  return due;
}

/**
 * Resolve the nurture baseline for one lead from durable history alone.
 *
 * The two JSON-path predicates cannot be sibling keys on one object literal — the second would
 * overwrite the first — so the delivery check rides in an AND. Both forms are established
 * elsewhere in this repository against the same column.
 */
export async function resolveNurtureAnchor(leadId: bigint): Promise<NurtureAnchor> {
  const discharged = await prisma.activityLog.findFirst({
    where: {
      lead_id: leadId,
      activity_type: NURTURE_DISCHARGE_ACTIVITY,
      metadata: { path: ['qualifies_nurture'], equals: true },
      AND: [{ metadata: { path: ['delivery_status'], equals: 'accepted' } }],
    },
    orderBy: { created_at: 'desc' },
    select: { id: true, created_at: true, actor_id: true },
  });
  if (discharged) return { kind: 'qualifying_report', at: discharged.created_at };

  // Step 2. Guarded rather than merely filtered: a membership set that is empty matches nothing
  // by definition, so issuing the query anyway would buy one wasted round trip per lead per sweep.
  if (CANONICAL_NURTURE_STAGES.length > 0) {
    const entered = await prisma.activityLog.findFirst({
      where: {
        lead_id: leadId,
        activity_type: STAGE_TRANSITION_ACTIVITY,
        // An OR of equals rather than an `in`: Prisma's JSON filter has no `in` operator, and
        // discovering that at runtime on a path guarded behind an empty set would have been a very
        // quiet bug indeed.
        OR: CANONICAL_NURTURE_STAGES.map((stage) => ({
          metadata: { path: ['new_pipeline_stage'], equals: stage },
        })),
      },
      orderBy: { created_at: 'desc' },
      select: { id: true, created_at: true },
    });
    if (entered) return { kind: 'stage_entry', at: entered.created_at };
  }

  return { kind: 'unanchored' };
}

/**
 * Batch form of the anchor lookup: ONE query for a whole cohort.
 *
 * WHY THIS EXISTS RATHER THAN A LOOP OVER resolveNurtureAnchor. The lifecycle sweep evaluates a
 * cohort per firing. Asking per lead would be one round trip each, and — worse — it would force
 * the caller to cap the cohort BEFORE knowing who is due, so a page of arbitrary not-due clients
 * could crowd out every due one. That is the starvation shape the retired 80-day predicate
 * partially hid. One query over the cohort keeps the cap on the ANSWER rather than on the question.
 *
 * Deliberately findMany + reduce rather than groupBy. A groupBy carrying two JSON-path predicates
 * is the more elegant statement of this, but the ordered-scan form is proven in this repository
 * and needs no assumption about how the driver composes aggregate JSON filters. Rows arrive
 * newest-first, so the first sighting of a lead is that lead's newest discharge.
 */
export async function resolveNurtureAnchorsBatch(
  leadIds: bigint[],
): Promise<Map<string, NurtureAnchor>> {
  const anchors = new Map<string, NurtureAnchor>();
  if (leadIds.length === 0) return anchors;

  const rows = await prisma.activityLog.findMany({
    where: {
      lead_id: { in: leadIds },
      activity_type: NURTURE_DISCHARGE_ACTIVITY,
      metadata: { path: ['qualifies_nurture'], equals: true },
      AND: [{ metadata: { path: ['delivery_status'], equals: 'accepted' } }],
    },
    orderBy: { created_at: 'desc' },
    select: { lead_id: true, created_at: true },
  });

  for (const row of rows) {
    const key = String(row.lead_id);
    if (!anchors.has(key)) anchors.set(key, { kind: 'qualifying_report', at: row.created_at });
  }

  // ── STEP 2, AND WHY IT IS HERE RATHER THAN ONLY IN THE SINGLE-LEAD PATH.
  //
  //    An earlier revision implemented step 2 only in resolveNurtureAnchor and let this function
  //    mark every remaining lead unanchored. Since the lifecycle engine and Growth Tools BOTH use
  //    this batch path, that was a second set of semantics hiding inside the "one clock": the
  //    moment CANONICAL_NURTURE_STAGES became non-empty, a single-lead lookup could find a
  //    stage-entry anchor that the actual scheduling and dashboard paths could not. One canonical
  //    clock has to mean identical answers however it is asked, so the two paths resolve the same
  //    order and there are parity tests that drive both and compare.
  const stillUnanchored = leadIds.filter((id) => !anchors.has(String(id)));
  if (stillUnanchored.length > 0 && CANONICAL_NURTURE_STAGES.length > 0) {
    const entries = await prisma.activityLog.findMany({
      where: {
        lead_id: { in: stillUnanchored },
        activity_type: STAGE_TRANSITION_ACTIVITY,
        OR: CANONICAL_NURTURE_STAGES.map((stage) => ({
          metadata: { path: ['new_pipeline_stage'], equals: stage },
        })),
      },
      orderBy: { created_at: 'desc' },
      select: { lead_id: true, created_at: true },
    });
    for (const row of entries) {
      const key = String(row.lead_id);
      if (!anchors.has(key)) anchors.set(key, { kind: 'stage_entry', at: row.created_at });
    }
  }

  for (const id of leadIds) {
    if (!anchors.has(String(id))) anchors.set(String(id), { kind: 'unanchored' });
  }
  return anchors;
}

/**
 * Turn a resolved anchor into a verdict. Shared by the single and batch paths, in ONE order:
 *
 *     current membership -> pause -> qualifying report -> stage entry -> unanchored
 *
 * Membership comes first because it decides whether any of the rest is even a question. Leaving
 * Nurture stops future obligations without deleting a single history row, and re-entering Nurture
 * writes a fresh stage-entry anchor, so the clock restarts from the re-entry rather than from a
 * cycle the client has since left.
 */
export function verdictFromAnchor(
  lead: NurtureLead,
  anchor: NurtureAnchor,
  now: Date,
): NurtureDue {
  if (!isInCanonicalNurture(lead.pipeline_stage)) return { state: 'not_applicable' };
  if (lead.nurture_paused) return { state: 'paused' };
  if (anchor.kind === 'unanchored') {
    return { state: 'unanchored', action: 'nurture_baseline_required' };
  }
  const due_at = nurtureDueAt(anchor.at);
  return due_at.getTime() <= now.getTime()
    ? { state: 'due', due_at, anchor }
    : { state: 'scheduled', due_at, anchor };
}

/**
 * The canonical nurture-due decision. Every consumer — the lifecycle engine, the agent action
 * surfaces, Growth Tools — asks this and displays the answer. None of them recomputes it.
 */
export async function evaluateNurtureDue(lead: NurtureLead, now: Date): Promise<NurtureDue> {
  // Membership and pause BOTH short-circuit before the ledger read. Neither is a cheaper due
  // calculation; each is the absence of one.
  if (!isInCanonicalNurture(lead.pipeline_stage)) return { state: 'not_applicable' };
  if (lead.nurture_paused) return { state: 'paused' };
  return verdictFromAnchor(lead, await resolveNurtureAnchor(lead.id), now);
}
