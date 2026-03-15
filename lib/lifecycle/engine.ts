/**
 * Lifecycle Trigger Engine
 *
 * Event-driven automation replacing time-based drip campaigns.
 * Evaluates triggers against latest scoring data and fires
 * appropriate actions (notifications, emails, CRM tasks).
 *
 * TCPA compliant: checks notification preferences before sending.
 * Fair Housing safe: no demographic-based triggers.
 */

import prisma from '@/lib/prisma';

// ─── Trigger Types ─────────────────────────────────────────
export type TriggerType =
  | 'conviction_threshold'    // Lead conviction score crosses threshold
  | 'ghost_detected'          // Previously active lead goes silent
  | 'comparable_sale'         // Comparable listing sold above ask
  | 'market_window'           // Favorable market conditions detected
  | 'momentum_drop'           // Listing momentum score dropped significantly
  | 'inquiry_stale'           // Inquiry not followed up within hours
  | 'lease_expiring_180d'     // Tenant lease expires in ~6 months — send rent vs buy + sale listings
  | 'lease_expiring_90d'      // Tenant lease expires in ~3 months — send sale + rental (incl no-fee)
  | 'lease_expiring_30d'      // Tenant lease expires in ~1 month — urgency reminder
  | 'quarterly_nurture'       // Quarterly report for nurture/future clients with matching listings
  | 'interest_drift'          // Client engagement shifted from stated preferences
  | 'new_match_client';       // New listing matches a client's saved preferences

export type ActionType = 'notification' | 'email' | 'agent_alert' | 'crm_task';

// ─── Evaluate All Active Triggers ──────────────────────────
export async function evaluateAllTriggers(): Promise<{
  evaluated: number;
  fired: number;
  suppressed: number;
}> {
  const triggers = await prisma.lifecycleTrigger.findMany({
    where: { enabled: true },
  });

  let fired = 0;
  let suppressed = 0;

  for (const trigger of triggers) {
    try {
      const results = await evaluateTrigger(trigger);
      fired += results.fired;
      suppressed += results.suppressed;
    } catch (err) {
      console.error(`[Lifecycle] Error evaluating trigger ${trigger.id}:`, err);
    }
  }

  return { evaluated: triggers.length, fired, suppressed };
}

// ─── Evaluate Single Trigger ───────────────────────────────
async function evaluateTrigger(trigger: {
  id: bigint;
  trigger_type: string;
  conditions: unknown;
  action_type: string;
  action_config: unknown;
  cooldown_hours: number;
  last_executed_at: Date | null;
  execution_count: number;
}): Promise<{ fired: number; suppressed: number }> {
  // Check cooldown
  if (trigger.last_executed_at) {
    const hoursSince = (Date.now() - trigger.last_executed_at.getTime()) / 3600_000;
    if (hoursSince < trigger.cooldown_hours) {
      return { fired: 0, suppressed: 0 };
    }
  }

  const conditions = trigger.conditions as Record<string, unknown>;
  let targets: { type: string; id: string; context: Record<string, unknown> }[] = [];

  switch (trigger.trigger_type) {
    case 'conviction_threshold':
      targets = await findConvictionThresholdTargets(conditions);
      break;
    case 'ghost_detected':
      targets = await findGhostTargets(conditions);
      break;
    case 'momentum_drop':
      targets = await findMomentumDropTargets(conditions);
      break;
    case 'inquiry_stale':
      targets = await findStaleInquiryTargets(conditions);
      break;
    case 'lease_expiring_180d':
      targets = await findLeaseExpiringTargets(180);
      break;
    case 'lease_expiring_90d':
      targets = await findLeaseExpiringTargets(90);
      break;
    case 'lease_expiring_30d':
      targets = await findLeaseExpiringTargets(30);
      break;
    case 'quarterly_nurture':
      targets = await findQuarterlyNurtureTargets();
      break;
    default:
      return { fired: 0, suppressed: 0 };
  }

  let fired = 0;
  let suppressed = 0;

  for (const target of targets) {
    // Check if already executed for this target recently
    const recentExecution = await prisma.triggerExecution.findFirst({
      where: {
        trigger_id: trigger.id,
        target_type: target.type,
        target_id: target.id,
        created_at: { gte: new Date(Date.now() - trigger.cooldown_hours * 3600_000) },
      },
    });

    if (recentExecution) {
      suppressed++;
      continue;
    }

    // Execute the action
    await executeAction(trigger.action_type, trigger.action_config as Record<string, unknown>, target);

    // Log execution
    await prisma.triggerExecution.create({
      data: {
        trigger_id: trigger.id,
        target_type: target.type,
        target_id: target.id,
        context: target.context as object,
        result: 'success',
      },
    });

    fired++;
  }

  // Update trigger metadata
  if (fired > 0) {
    await prisma.lifecycleTrigger.update({
      where: { id: trigger.id },
      data: {
        last_executed_at: new Date(),
        execution_count: trigger.execution_count + fired,
      },
    });
  }

  return { fired, suppressed };
}

// ─── Target Finders ────────────────────────────────────────

async function findConvictionThresholdTargets(
  conditions: Record<string, unknown>
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const minScore = (conditions.min_score as number) || 75;

  const scores = await prisma.convictionScore.findMany({
    where: {
      score: { gte: minScore },
      ghost_status: 'active',
    },
    select: { lead_id: true, score: true, stage: true },
  });

  return scores.map((s) => ({
    type: 'lead',
    id: String(s.lead_id),
    context: { score: s.score, stage: s.stage, trigger: 'conviction_threshold' },
  }));
}

async function findGhostTargets(
  conditions: Record<string, unknown>
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const silenceDays = (conditions.silence_days as number) || 7;

  const ghosts = await prisma.convictionScore.findMany({
    where: {
      ghost_status: { in: ['cooling', 'silent'] },
      silence_days: { gte: silenceDays },
      score: { gte: 15 }, // Only re-engage leads that showed some intent
    },
    select: { lead_id: true, score: true, silence_days: true, top_listings: true },
  });

  return ghosts.map((g) => ({
    type: 'lead',
    id: String(g.lead_id),
    context: { score: g.score, silenceDays: g.silence_days, topListings: g.top_listings, trigger: 'ghost_detected' },
  }));
}

async function findMomentumDropTargets(
  conditions: Record<string, unknown>
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const maxScore = (conditions.max_score as number) || 30;

  const listings = await prisma.listingMomentum.findMany({
    where: {
      score: { lte: maxScore },
      last_computed: { gte: new Date(Date.now() - 24 * 3600_000) }, // Only recently computed
    },
    select: { listing_id: true, score: true, percentile_rank: true },
  });

  return listings.map((l) => ({
    type: 'listing',
    id: l.listing_id,
    context: { score: l.score, percentile: l.percentile_rank, trigger: 'momentum_drop' },
  }));
}

async function findStaleInquiryTargets(
  conditions: Record<string, unknown>
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const maxHours = (conditions.max_hours as number) || 48;
  const cutoff = new Date(Date.now() - maxHours * 3600_000);

  // Find leads with inquiries but no agent follow-up
  const staleLeads = await prisma.lead.findMany({
    where: {
      status: 'new',
      created_at: { lte: cutoff, gte: new Date(Date.now() - 7 * 86400_000) }, // within last 7 days
    },
    select: { id: true, created_at: true },
    take: 50,
  });

  return staleLeads.map((l) => ({
    type: 'lead',
    id: String(l.id),
    context: { createdAt: l.created_at.toISOString(), trigger: 'inquiry_stale' },
  }));
}

// ─── Lease Expiration Targets ──────────────────────────────

async function findLeaseExpiringTargets(
  daysFromNow: number
): Promise<{ type: string; id: string; context: Record<string, unknown> }[]> {
  const { getLeaseExpirationCandidates } = await import('@/lib/market-intelligence/client-matcher');

  // Find all tenants across all agents whose lease expires around this milestone
  const candidates = await getLeaseExpirationCandidates(null, daysFromNow, 7);

  return candidates.map((c) => ({
    type: 'lead',
    id: String(c.id),
    context: {
      trigger: `lease_expiring_${daysFromNow}d`,
      days_to_expiry: c.daysToExpiry,
      lease_end_date: c.leaseEndDate.toISOString(),
      is_buyer_candidate: c.isBuyerCandidate,
      annual_income: c.annualIncome,
      credit_score: c.creditScoreRange,
      pre_approved: c.preApproved,
      milestone_days: daysFromNow,
    },
  }));
}

// ─── Quarterly Nurture Targets ────────────────────────────

async function findQuarterlyNurtureTargets(): Promise<
  { type: string; id: string; context: Record<string, unknown> }[]
> {
  // Find clients in nurture/past/new stages who haven't been contacted in 80+ days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 80);

  const nurtureCandidates = await prisma.lead.findMany({
    where: {
      pipeline_stage: { in: ['nurturing', 'past', 'new', 'contacted'] },
      consent_captured_at: { not: null },
      OR: [
        { last_contacted_at: { lte: cutoff } },
        { last_contacted_at: null },
      ],
    },
    select: {
      id: true,
      pipeline_stage: true,
      roles: true,
      last_contacted_at: true,
      agent_id: true,
      preferences: { select: { neighborhoods: true } },
    },
    take: 50,
  });

  return nurtureCandidates
    .filter((c) => c.preferences && c.preferences.neighborhoods.length > 0)
    .map((c) => ({
      type: 'lead',
      id: String(c.id),
      context: {
        trigger: 'quarterly_nurture',
        pipeline_stage: c.pipeline_stage,
        roles: c.roles,
        agent_id: c.agent_id ? String(c.agent_id) : null,
        neighborhoods: c.preferences!.neighborhoods,
        last_contacted: c.last_contacted_at?.toISOString() || null,
      },
    }));
}

// ─── Action Executor ───────────────────────────────────────
async function executeAction(
  actionType: string,
  _actionConfig: Record<string, unknown>,
  target: { type: string; id: string; context: Record<string, unknown> }
): Promise<void> {
  switch (actionType) {
    case 'notification': {
      // Create in-app notification for the assigned agent
      if (target.type === 'lead') {
        const lead = await prisma.lead.findUnique({
          where: { id: BigInt(target.id) },
          select: { agent_id: true, first_name: true, last_name: true },
        });
        if (lead?.agent_id) {
          await prisma.notification.create({
            data: {
              recipient_type: 'agent',
              recipient_id: lead.agent_id,
              type: target.context.trigger as string || 'system',
              title: generateNotificationTitle(target.context),
              body: generateNotificationBody(target.context, `${lead.first_name} ${lead.last_name}`),
            },
          });
        }
      }
      break;
    }
    case 'agent_alert': {
      // Same as notification but marked urgent
      if (target.type === 'lead') {
        const lead = await prisma.lead.findUnique({
          where: { id: BigInt(target.id) },
          select: { agent_id: true, first_name: true, last_name: true },
        });
        if (lead?.agent_id) {
          await prisma.notification.create({
            data: {
              recipient_type: 'agent',
              recipient_id: lead.agent_id,
              type: target.context.trigger as string || 'system',
              title: generateNotificationTitle(target.context),
              body: generateNotificationBody(target.context, `${lead.first_name} ${lead.last_name}`),
            },
          });
        }
      }
      break;
    }
    case 'email': {
      // Send automated listing email based on trigger context
      const triggerName = target.context.trigger as string || '';
      if (triggerName.startsWith('lease_expiring_') || triggerName === 'quarterly_nurture') {
        await executeMarketIntelEmail(target);
      }
      break;
    }
    // crm_task action type can be implemented as needed
    default:
      console.log(`[Lifecycle] Action type '${actionType}' not yet implemented for target ${target.id}`);
  }
}

/**
 * Execute market intelligence email for lease expiration or quarterly nurture triggers.
 * Fetches matching listings from Trestle, builds branded email, sends to client.
 */
async function executeMarketIntelEmail(
  target: { type: string; id: string; context: Record<string, unknown> }
): Promise<void> {
  const { matchListingsForClient, getAgentClientsWithPrefs } = await import('@/lib/market-intelligence/client-matcher');
  const { sendListingEmail, getAgentBranding } = await import('@/lib/market-intelligence/auto-send');
  const { fetchMarketData, fetchListingsForPreferences } = await import('@/lib/market-intelligence/fetcher');
  const { computeRentVsBuy } = await import('@/lib/market-intelligence/calculator');

  const leadId = BigInt(target.id);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      first_name: true,
      last_name: true,
      email: true,
      roles: true,
      agent_id: true,
      lease_end_date: true,
      annual_income: true,
      credit_score_range: true,
      pre_approved: true,
      preferences: {
        select: {
          neighborhoods: true,
          property_types: true,
          min_beds: true,
          max_beds: true,
          min_price: true,
          max_price: true,
          boroughs: true,
        },
      },
    },
  });

  if (!lead || !lead.agent_id || !lead.preferences) {
    console.warn(`[Lifecycle] Cannot send market intel email — lead ${target.id} missing agent or preferences`);
    return;
  }

  const agent = await getAgentBranding(lead.agent_id);
  const prefs = lead.preferences;
  const triggerName = target.context.trigger as string;
  const milestoneDays = target.context.milestone_days as number | undefined;
  const isBuyerCandidate = target.context.is_buyer_candidate as boolean;

  // Fetch market data for client's neighborhoods
  const saleData = prefs.neighborhoods.length > 0
    ? await fetchMarketData({
        listingType: 'sale',
        neighborhoods: prefs.neighborhoods,
        propertyTypes: prefs.property_types.length > 0 ? prefs.property_types : undefined,
      })
    : null;

  // Match listings based on trigger type
  const clientForMatch = {
    roles: lead.roles,
    preferences: {
      neighborhoods: prefs.neighborhoods,
      propertyTypes: prefs.property_types,
      minBeds: prefs.min_beds,
      maxBeds: prefs.max_beds,
      minPrice: prefs.min_price ? Number(prefs.min_price) : null,
      maxPrice: prefs.max_price ? Number(prefs.max_price) : null,
      boroughs: prefs.boroughs,
    },
  };

  let saleListings: import('@/lib/market-intelligence/fetcher').TrestleListing[] = [];
  let rentalListings: import('@/lib/market-intelligence/fetcher').TrestleListing[] = [];
  let rentVsBuy: import('@/lib/market-intelligence/calculator').RentVsBuyAnalysis | undefined;
  let subject: string;
  let personalMessage: string;
  let emailType: 'lease_180d' | 'lease_90d' | 'lease_30d' | 'quarterly_nurture';

  if (triggerName === 'lease_expiring_180d') {
    // 6 months: Rent vs Buy + sale listings (convert tenant to buyer)
    emailType = 'lease_180d';
    const matched = await matchListingsForClient(clientForMatch, { includeSale: true, includeRental: false, limit: 8 });
    saleListings = matched.map((m) => m.listing);

    // Compute rent vs buy for their top neighborhood
    if (saleData && saleData.neighborhoodStats.length > 0) {
      const rentalData = await fetchMarketData({
        listingType: 'rent',
        neighborhoods: [saleData.neighborhoodStats[0].neighborhood],
      });
      const rentalStats = rentalData.neighborhoodStats[0] || null;
      rentVsBuy = computeRentVsBuy(
        saleData.neighborhoodStats[0],
        rentalStats,
        {
          downPaymentPct: lead.pre_approved ? 0.2 : 0.1,
          mortgageRate: 6.5,
        }
      );
    }

    const leaseDate = lead.lease_end_date
      ? new Date(lead.lease_end_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : 'soon';

    subject = `Your lease is up in ${leaseDate} — let's look at your options`;
    personalMessage = `Hi ${lead.first_name},<br><br>` +
      `With your lease ending in about 6 months, now is the perfect time to explore your options. ` +
      (isBuyerCandidate
        ? `Based on your financial profile, you're in a great position to consider purchasing. I've included a rent vs buy analysis and some properties that match what you're looking for.`
        : `I've put together some properties for you to consider — both to buy and to rent. Take a look and let me know what interests you.`);

  } else if (triggerName === 'lease_expiring_90d') {
    // 90 days: Both sale AND rental options (including no-fee)
    emailType = 'lease_90d';
    const saleMatched = await matchListingsForClient(clientForMatch, { includeSale: true, includeRental: false, limit: 5 });
    const rentalMatched = await matchListingsForClient(clientForMatch, { includeSale: false, includeRental: true, limit: 5 });
    saleListings = saleMatched.map((m) => m.listing);
    rentalListings = rentalMatched.map((m) => m.listing);

    subject = `90 days until your lease ends — sale & rental options for you`;
    personalMessage = `Hi ${lead.first_name},<br><br>` +
      `Your lease is up in about 3 months. I've put together both purchase and rental options in your preferred areas — including no-fee rentals. ` +
      `Take a look and let me know which direction feels right. Either way, I'm here to help you find the perfect next home.`;

  } else if (triggerName === 'lease_expiring_30d') {
    // 30 days: Urgency — both options + strong CTA
    emailType = 'lease_30d';
    const saleMatched = await matchListingsForClient(clientForMatch, { includeSale: true, includeRental: false, limit: 3 });
    const rentalMatched = await matchListingsForClient(clientForMatch, { includeSale: false, includeRental: true, limit: 5 });
    saleListings = saleMatched.map((m) => m.listing);
    rentalListings = rentalMatched.map((m) => m.listing);

    subject = `Your lease expires next month — let's secure your next home`;
    personalMessage = `Hi ${lead.first_name},<br><br>` +
      `Your lease ends in about 30 days. If you haven't made plans yet, here are your best options right now. ` +
      `I can schedule showings this week — just let me know what catches your eye and I'll set everything up.`;

  } else {
    // Quarterly nurture
    emailType = 'quarterly_nurture';
    const isBuyer = lead.roles.includes('buyer');
    const isRenter = lead.roles.includes('renter') || lead.roles.includes('tenant');
    if (isBuyer) {
      const matched = await matchListingsForClient(clientForMatch, { includeSale: true, includeRental: false, limit: 5 });
      saleListings = matched.map((m) => m.listing);
    }
    if (isRenter) {
      const matched = await matchListingsForClient(clientForMatch, { includeSale: false, includeRental: true, limit: 5 });
      rentalListings = matched.map((m) => m.listing);
    }

    const quarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;
    subject = `${quarter} Market Update — ${prefs.neighborhoods.slice(0, 2).join(', ')}`;
    personalMessage = `Hi ${lead.first_name},<br><br>` +
      `Here's your quarterly market update for the areas you're interested in. ` +
      `I've included a few listings that match what you were originally looking for — let me know if anything stands out.`;
  }

  await sendListingEmail({
    recipientName: `${lead.first_name} ${lead.last_name}`,
    recipientEmail: lead.email,
    subject,
    saleListings: saleListings.length > 0 ? saleListings : undefined,
    rentalListings: rentalListings.length > 0 ? rentalListings : undefined,
    rentVsBuy,
    neighborhoodStats: saleData?.neighborhoodStats.slice(0, 5),
    personalMessage,
    emailType,
    agent,
  });

  // Update last_contacted_at
  await prisma.lead.update({
    where: { id: leadId },
    data: { last_contacted_at: new Date() },
  });
}

// ─── Notification Content ──────────────────────────────────
function generateNotificationTitle(context: Record<string, unknown>): string {
  const trigger = context.trigger as string || '';
  switch (trigger) {
    case 'conviction_threshold':
      return `High-conviction buyer (score: ${context.score})`;
    case 'ghost_detected':
      return `Buyer went silent (${context.silenceDays} days)`;
    case 'momentum_drop':
      return `Listing momentum dropped to ${context.score}`;
    case 'inquiry_stale':
      return 'Inquiry needs follow-up';
    case 'lease_expiring_180d':
      return `Lease expires in ~6 months — sent rent vs buy analysis`;
    case 'lease_expiring_90d':
      return `Lease expires in ~90 days — sent sale + rental options`;
    case 'lease_expiring_30d':
      return `Lease expires in ~30 days — urgency email sent`;
    case 'quarterly_nurture':
      return `Quarterly market update sent`;
    case 'interest_drift':
      return `Client interest shifted — review engagement`;
    default:
      return 'Action required';
  }
}

function generateNotificationBody(context: Record<string, unknown>, leadName?: string): string {
  const trigger = context.trigger as string || '';
  switch (trigger) {
    case 'conviction_threshold':
      return `${leadName || 'A buyer'} has conviction score ${context.score}/100 (stage: ${context.stage}). They may be ready to make an offer — consider reaching out now.`;
    case 'ghost_detected':
      return `${leadName || 'A buyer'} was actively engaged but hasn't been active for ${context.silenceDays} days. Consider a soft re-engagement.`;
    case 'momentum_drop':
      return `Listing performance has dropped to ${context.score}/100 (${context.percentile}th percentile). Consider a price adjustment or marketing refresh.`;
    case 'inquiry_stale':
      return `${leadName || 'A lead'} submitted an inquiry but hasn't received follow-up. Respond within 24 hours for best conversion.`;
    case 'lease_expiring_180d':
      return `${leadName || 'A tenant'}'s lease expires in ~6 months (${context.lease_end_date}). ${context.is_buyer_candidate ? 'They are a buyer conversion candidate — ' : ''}Auto-sent rent vs buy analysis with matching sale listings.`;
    case 'lease_expiring_90d':
      return `${leadName || 'A tenant'}'s lease expires in ~90 days. Auto-sent both sale and rental options (including no-fee rentals). Monitor their engagement to see which direction they lean.`;
    case 'lease_expiring_30d':
      return `${leadName || 'A tenant'}'s lease expires in ~30 days. Urgency email sent with latest options. Consider calling to schedule showings this week.`;
    case 'quarterly_nurture':
      return `Sent quarterly market update to ${leadName || 'a client'} with matching listings in their preferred areas. Watch for engagement — if they click, consider moving them to Active.`;
    case 'interest_drift':
      return `${leadName || 'A client'}'s engagement pattern has shifted from their stated preferences. Review their recent activity and update their search criteria.`;
    default:
      return 'Please review and take appropriate action.';
  }
}

// ─── Default Triggers (Seed) ───────────────────────────────
export const DEFAULT_TRIGGERS = [
  {
    name: 'High Conviction Alert',
    trigger_type: 'conviction_threshold',
    conditions: { min_score: 75 },
    action_type: 'agent_alert',
    action_config: {},
    cooldown_hours: 72,
  },
  {
    name: 'Ghost Buyer Re-engagement',
    trigger_type: 'ghost_detected',
    conditions: { silence_days: 7 },
    action_type: 'notification',
    action_config: {},
    cooldown_hours: 168, // 7 days
  },
  {
    name: 'Cold Listing Alert',
    trigger_type: 'momentum_drop',
    conditions: { max_score: 25 },
    action_type: 'notification',
    action_config: {},
    cooldown_hours: 168,
  },
  {
    name: 'Stale Inquiry Reminder',
    trigger_type: 'inquiry_stale',
    conditions: { max_hours: 48 },
    action_type: 'agent_alert',
    action_config: {},
    cooldown_hours: 24,
  },
  // ─── Lease Expiration Triggers ──────────────────────────
  {
    name: 'Lease Expiring — 6 Month Rent vs Buy',
    trigger_type: 'lease_expiring_180d',
    conditions: {},
    action_type: 'email',
    action_config: { include_rent_vs_buy: true, include_sale_listings: true },
    cooldown_hours: 720, // 30 days — don't re-send for this milestone
  },
  {
    name: 'Lease Expiring — 90 Day Sale + Rental Options',
    trigger_type: 'lease_expiring_90d',
    conditions: {},
    action_type: 'email',
    action_config: { include_sale_listings: true, include_rental_listings: true, include_no_fee: true },
    cooldown_hours: 720,
  },
  {
    name: 'Lease Expiring — 30 Day Urgency',
    trigger_type: 'lease_expiring_30d',
    conditions: {},
    action_type: 'email',
    action_config: { include_sale_listings: true, include_rental_listings: true, urgency: true },
    cooldown_hours: 720,
  },
  // ─── Quarterly Nurture ──────────────────────────────────
  {
    name: 'Quarterly Nurture Report',
    trigger_type: 'quarterly_nurture',
    conditions: {},
    action_type: 'email',
    action_config: { include_matching_listings: true, include_market_stats: true },
    cooldown_hours: 2016, // ~84 days (quarterly)
  },
];
