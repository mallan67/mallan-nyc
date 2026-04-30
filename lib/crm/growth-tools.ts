import { summarizeSellerSignals } from "@/lib/seller-signals/summary";
import type { Prisma } from "@prisma/client";

type JsonObject = Record<string, unknown>;

export type GrowthPriority = "urgent" | "high" | "normal";

export type GrowthLead = {
  id: bigint;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  roles: string[];
  status: string;
  agent_id: bigint | null;
  pipeline_stage: string;
  seller_potential?: string | null;
  seller_potential_reason?: string[];
  vacancy_risk?: string | null;
  relist_reminder_date?: Date | null;
  last_contacted_at?: Date | null;
  next_follow_up?: Date | null;
  last_login_at?: Date | null;
  last_response_at?: Date | null;
  last_click_at?: Date | null;
  last_viewed_listing_at?: Date | null;
  sales_drip_on?: boolean;
  rental_drip_on?: boolean;
  renewal_drip_on?: boolean;
  sales_drip_status?: string | null;
  rental_drip_status?: string | null;
  last_unsubscribe_at?: Date | null;
  closing_date?: Date | null;
  gift_sent_at?: Date | null;
  anniversary_6mo_sent_at?: Date | null;
  anniversary_1yr_sent_at?: Date | null;
  active_sale_listing_id?: string | null;
  active_rental_listing_id?: string | null;
  property_address?: string | null;
  home_address?: string | null;
  buyer_rep_agreement?: boolean;
  docs_readiness?: unknown;
  documents_collected?: unknown;
  disclosures?: unknown;
  marketing_strategy?: unknown;
  is_high_net_worth?: boolean;
  is_investor?: boolean;
  investment_properties?: number | null;
  net_worth_estimate?: unknown;
  portfolio_value_estimate?: unknown;
  created_at: Date;
  updated_at: Date;
};

export type GrowthCampaign = {
  id: bigint;
  name: string;
  audience_type: string;
  campaign_type: string;
  status: string;
  frequency: string | null;
  last_run_at: Date | null;
  next_run_at: Date | null;
  recipient_count: number;
  sent_count: number;
  open_count: number;
  click_count: number;
  response_count: number;
};

export type GrowthTask = {
  id: bigint;
  lead_id: bigint;
  title: string;
  priority: string;
  status: string;
  task_type: string;
  due_date: Date;
};

export type GrowthLease = {
  id: bigint;
  landlord_lead_id: bigint;
  tenant_lead_id: bigint | null;
  address: string;
  status: string;
  lease_end_date: Date;
  renewal_status: string;
  seller_comps_6mo_sent_at: Date | null;
  seller_comps_1yr_sent_at: Date | null;
  outreach_90d_sent_at: Date | null;
  outreach_60d_sent_at: Date | null;
  outreach_30d_sent_at: Date | null;
  relist_target_date?: Date | null;
};

export type GrowthPortalEvent = {
  id: bigint;
  lead_id: bigint | null;
  event_type: string;
  listing_id: string | null;
  metadata: Prisma.JsonValue;
  created_at: Date;
};

export type GrowthActionItem = {
  id: string;
  type: string;
  priority: GrowthPriority;
  segment: "broker" | "agent" | "buyer" | "seller" | "landlord" | "tenant" | "marketing" | "pipeline";
  lead_id?: string;
  campaign_id?: string;
  task_id?: string;
  lease_id?: string;
  title: string;
  detail: string;
  next_action: string;
  due_at?: string | null;
  score?: number;
  reasons?: string[];
};

const PRIORITY_WEIGHT: Record<GrowthPriority, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
};

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function leadName(lead: GrowthLead): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email || `Lead ${lead.id.toString()}`;
}

function hasRole(lead: GrowthLead, role: string): boolean {
  return (lead.roles || []).map((value) => value.toLowerCase()).includes(role);
}

function daysBetween(left: Date, right: Date): number {
  return Math.floor((left.getTime() - right.getTime()) / 86400000);
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function dueWithin(date: Date | null | undefined, now: Date, days: number): boolean {
  if (!date) return false;
  const delta = daysBetween(date, now);
  return delta <= days;
}

function isPast(date: Date | null | undefined, now: Date): boolean {
  return !!date && date.getTime() < now.getTime();
}

function lastTouch(lead: GrowthLead): Date | null {
  return lead.last_response_at || lead.last_contacted_at || lead.last_click_at || lead.last_login_at || lead.last_viewed_listing_at || null;
}

function cadenceDays(value: string | null | undefined): number | null {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "monthly") return 30;
  if (normalized === "quarterly") return 90;
  if (normalized === "biannual") return 180;
  if (normalized === "weekly") return 7;
  return null;
}

function incompleteJsonChecklist(value: unknown): boolean {
  const object = objectValue(value);
  const entries = Object.values(object);
  if (entries.length === 0) return true;
  return entries.some((entry) => entry === false || entry === null || entry === "");
}

function sortItems<T extends GrowthActionItem>(items: T[]): T[] {
  return items.sort((a, b) =>
    PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
    (b.score || 0) - (a.score || 0) ||
    String(a.title).localeCompare(String(b.title))
  );
}

function indexEvents(events: GrowthPortalEvent[]) {
  const byLead = new Map<string, GrowthPortalEvent[]>();
  for (const event of events) {
    if (!event.lead_id) continue;
    const key = event.lead_id.toString();
    const list = byLead.get(key) || [];
    list.push(event);
    byLead.set(key, list);
  }
  return byLead;
}

function indexLeases(leases: GrowthLease[]) {
  const byLead = new Map<string, GrowthLease[]>();
  for (const lease of leases) {
    for (const id of [lease.landlord_lead_id, lease.tenant_lead_id]) {
      if (!id) continue;
      const key = id.toString();
      const list = byLead.get(key) || [];
      list.push(lease);
      byLead.set(key, list);
    }
  }
  return byLead;
}

function buildSellerReasons(lead: GrowthLead, sellerSummary: ReturnType<typeof summarizeSellerSignals>, leases: GrowthLease[], now: Date) {
  const reasons: string[] = [];
  let score = sellerSummary.seller_signal_score || 0;

  const potential = String(lead.seller_potential || "none").toLowerCase();
  if (potential === "high") {
    score += 30;
    reasons.push("Marked high seller potential");
  } else if (potential === "medium") {
    score += 18;
    reasons.push("Marked medium seller potential");
  } else if (potential === "low") {
    score += 8;
    reasons.push("Marked low seller potential");
  }

  if (hasRole(lead, "seller")) {
    score += 15;
    reasons.push("Seller workspace/client role");
  }
  if (hasRole(lead, "landlord")) {
    score += 10;
    reasons.push("Landlord owner relationship");
  }
  if (lead.active_sale_listing_id) {
    score += 10;
    reasons.push("Active sale listing linked");
  }
  if (sellerSummary.event_count > 0) {
    score += Math.min(20, sellerSummary.event_count * 5);
    reasons.push("Seller portal planning activity");
  }
  if (sellerSummary.urgency || sellerSummary.timeline) {
    reasons.push("Timing or motivation captured");
  }
  if (lead.vacancy_risk === "high") {
    score += 10;
    reasons.push("High vacancy risk");
  }
  if (lead.is_high_net_worth || lead.is_investor || (lead.investment_properties || 0) > 0) {
    score += 10;
    reasons.push("Investor or high-net-worth profile");
  }
  if (numberValue(lead.net_worth_estimate) || numberValue(lead.portfolio_value_estimate)) {
    score += 8;
    reasons.push("Owner wealth/portfolio estimate present");
  }
  if (lead.property_address || lead.home_address) {
    score += 5;
    reasons.push("Owned property address captured");
  }
  if (lead.relist_reminder_date && dueWithin(lead.relist_reminder_date, now, 14)) {
    score += 15;
    reasons.push("Relist reminder due");
  }

  for (const lease of leases) {
    const days = daysBetween(lease.lease_end_date, now);
    if (lease.landlord_lead_id === lead.id && days >= 0 && days <= 90) {
      score += 22;
      reasons.push(`Lease expires in ${days} days`);
      break;
    }
    if (lease.landlord_lead_id === lead.id && days > 90 && days <= 180) {
      score += 12;
      reasons.push(`Lease expires in ${days} days`);
      break;
    }
  }

  if (lead.seller_potential_reason?.length) {
    reasons.push(...lead.seller_potential_reason.slice(0, 3));
  }

  return {
    score: Math.min(100, score),
    reasons: Array.from(new Set(reasons)).slice(0, 8),
  };
}

function sellerPriority(score: number): GrowthPriority {
  if (score >= 80) return "urgent";
  if (score >= 55) return "high";
  return "normal";
}

function sellerNextAction(lead: GrowthLead, sellerSummary: ReturnType<typeof summarizeSellerSignals>, leases: GrowthLease[], now: Date): string {
  if ((sellerSummary.seller_signal_score || 0) >= 50) return sellerSummary.next_best_action;
  if (leases.some((lease) => lease.landlord_lead_id === lead.id && dueWithin(lease.lease_end_date, now, 180))) {
    return "Send owner valuation and rent-vs-sell options";
  }
  if (!lead.sales_drip_on && !lead.last_unsubscribe_at) return "Add to owner market report cadence";
  if (!lead.last_contacted_at || daysBetween(now, lead.last_contacted_at) > 30) return "Schedule seller check-in";
  return "Confirm selling timeline and pricing motivation";
}

function buildSellerSignalQueue(input: {
  leads: GrowthLead[];
  eventsByLead: Map<string, GrowthPortalEvent[]>;
  leasesByLead: Map<string, GrowthLease[]>;
  now: Date;
}) {
  const items: GrowthActionItem[] = [];
  for (const lead of input.leads) {
    const events = input.eventsByLead.get(lead.id.toString()) || [];
    const leases = input.leasesByLead.get(lead.id.toString()) || [];
    const sellerSummary = summarizeSellerSignals(events);
    const seller = buildSellerReasons(lead, sellerSummary, leases, input.now);
    const hasSellerContext = hasRole(lead, "seller") || hasRole(lead, "landlord") ||
      String(lead.seller_potential || "none") !== "none" || sellerSummary.event_count > 0;
    if (!hasSellerContext || seller.score < 25) continue;

    items.push({
      id: `seller:${lead.id.toString()}`,
      type: "seller_signal",
      priority: sellerPriority(seller.score),
      segment: "seller",
      lead_id: lead.id.toString(),
      title: leadName(lead),
      detail: seller.reasons[0] || "Potential seller signal",
      next_action: sellerNextAction(lead, sellerSummary, leases, input.now),
      due_at: lead.next_follow_up?.toISOString() || lead.relist_reminder_date?.toISOString() || null,
      score: seller.score,
      reasons: seller.reasons,
    });
  }
  return sortItems(items).slice(0, 25);
}

function buildMarketingQueue(input: {
  leads: GrowthLead[];
  campaigns: GrowthCampaign[];
  leases: GrowthLease[];
  now: Date;
}) {
  const items: GrowthActionItem[] = [];

  for (const campaign of input.campaigns) {
    if ((campaign.status === "scheduled" || campaign.status === "recurring") && dueWithin(campaign.next_run_at, input.now, 0)) {
      items.push({
        id: `campaign:${campaign.id.toString()}`,
        type: "campaign_due",
        priority: "high",
        segment: "marketing",
        campaign_id: campaign.id.toString(),
        title: campaign.name,
        detail: `${campaign.audience_type} ${campaign.campaign_type} is due`,
        next_action: "Review audience and send or reschedule",
        due_at: campaign.next_run_at?.toISOString() || null,
      });
    }
  }

  for (const lead of input.leads) {
    if (lead.last_unsubscribe_at) continue;
    const touch = lastTouch(lead);
    const salesCadence = cadenceDays(lead.sales_drip_status);
    const rentalCadence = cadenceDays(lead.rental_drip_status || (lead.renewal_drip_on ? "monthly" : null));

    if ((hasRole(lead, "seller") || hasRole(lead, "buyer") || String(lead.seller_potential || "none") !== "none") && !lead.sales_drip_on) {
      items.push({
        id: `marketing:sales-drip:${lead.id.toString()}`,
        type: "sales_drip_missing",
        priority: hasRole(lead, "seller") || lead.seller_potential === "high" ? "high" : "normal",
        segment: "marketing",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: "Not on sales market-report cadence",
        next_action: "Add monthly or quarterly market report",
      });
    } else if (salesCadence && (!touch || daysBetween(input.now, touch) >= salesCadence)) {
      items.push({
        id: `marketing:sales-report:${lead.id.toString()}`,
        type: salesCadence <= 30 ? "monthly_report_due" : "quarterly_report_due",
        priority: "normal",
        segment: "marketing",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: `${lead.sales_drip_status} sales report is due`,
        next_action: "Send market update with relevant listings and comps",
      });
    }

    if ((hasRole(lead, "landlord") || hasRole(lead, "tenant")) && !lead.rental_drip_on && !lead.renewal_drip_on) {
      items.push({
        id: `marketing:rental-drip:${lead.id.toString()}`,
        type: "rental_drip_missing",
        priority: "normal",
        segment: "marketing",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: "Not on rental or renewal cadence",
        next_action: "Add lease/renewal market report cadence",
      });
    } else if (rentalCadence && (!touch || daysBetween(input.now, touch) >= rentalCadence)) {
      items.push({
        id: `marketing:rental-report:${lead.id.toString()}`,
        type: rentalCadence <= 30 ? "monthly_report_due" : "quarterly_report_due",
        priority: "normal",
        segment: "marketing",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: `${lead.rental_drip_status || "monthly"} rental report is due`,
        next_action: "Send rental market or renewal report",
      });
    }

    if (lead.closing_date) {
      const sixMonth = addMonths(lead.closing_date, 6);
      const oneYear = addMonths(lead.closing_date, 12);
      if (!lead.anniversary_6mo_sent_at && dueWithin(sixMonth, input.now, 14)) {
        items.push({
          id: `marketing:anniversary-6mo:${lead.id.toString()}`,
          type: "anniversary_6mo_due",
          priority: isPast(sixMonth, input.now) ? "high" : "normal",
          segment: "marketing",
          lead_id: lead.id.toString(),
          title: leadName(lead),
          detail: "6-month closing anniversary touch is due",
          next_action: "Send check-in, valuation, and referral ask",
          due_at: sixMonth.toISOString(),
        });
      }
      if (!lead.anniversary_1yr_sent_at && dueWithin(oneYear, input.now, 21)) {
        items.push({
          id: `marketing:anniversary-1yr:${lead.id.toString()}`,
          type: "anniversary_1yr_due",
          priority: isPast(oneYear, input.now) ? "high" : "normal",
          segment: "marketing",
          lead_id: lead.id.toString(),
          title: leadName(lead),
          detail: "1-year closing anniversary touch is due",
          next_action: "Send anniversary CMA and referral ask",
          due_at: oneYear.toISOString(),
        });
      }
    }
  }

  for (const lease of input.leases) {
    const days = daysBetween(lease.lease_end_date, input.now);
    if (days >= 0 && days <= 180 && !lease.seller_comps_6mo_sent_at) {
      items.push({
        id: `marketing:seller-comps-6mo:${lease.id.toString()}`,
        type: "seller_comps_due",
        priority: days <= 90 ? "high" : "normal",
        segment: "marketing",
        lead_id: lease.landlord_lead_id.toString(),
        lease_id: lease.id.toString(),
        title: lease.address,
        detail: `Lease expires in ${days} days`,
        next_action: "Send landlord seller-comps and renewal-vs-sell report",
        due_at: lease.lease_end_date.toISOString(),
      });
    }
  }

  return sortItems(items).slice(0, 40);
}

function buildPipelineQueue(input: {
  leads: GrowthLead[];
  tasks: GrowthTask[];
  leases: GrowthLease[];
  now: Date;
  isBroker: boolean;
}) {
  const items: GrowthActionItem[] = [];

  for (const task of input.tasks) {
    if (task.status !== "pending" && task.status !== "overdue") continue;
    if (!dueWithin(task.due_date, input.now, 3)) continue;
    items.push({
      id: `task:${task.id.toString()}`,
      type: "task_due",
      priority: task.priority === "urgent" || isPast(task.due_date, input.now) ? "urgent" : task.priority === "high" ? "high" : "normal",
      segment: "pipeline",
      lead_id: task.lead_id.toString(),
      task_id: task.id.toString(),
      title: task.title,
      detail: `${task.task_type} due ${task.due_date.toISOString().slice(0, 10)}`,
      next_action: "Complete or reschedule the task",
      due_at: task.due_date.toISOString(),
    });
  }

  for (const lead of input.leads) {
    const stage = String(lead.pipeline_stage || "new").toLowerCase();
    if (["closed", "past"].includes(stage) || lead.status === "closed") continue;
    const touch = lastTouch(lead);

    if (input.isBroker && !lead.agent_id) {
      items.push({
        id: `pipeline:unassigned:${lead.id.toString()}`,
        type: "unassigned_lead",
        priority: "urgent",
        segment: "broker",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: "Lead is waiting for broker assignment",
        next_action: "Assign an agent",
      });
    }

    if (lead.next_follow_up && isPast(lead.next_follow_up, input.now)) {
      items.push({
        id: `pipeline:follow-up:${lead.id.toString()}`,
        type: "follow_up_overdue",
        priority: "high",
        segment: "pipeline",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: "Next follow-up is overdue",
        next_action: "Contact client and reset next follow-up",
        due_at: lead.next_follow_up.toISOString(),
      });
      continue;
    }

    if (!touch && daysBetween(input.now, lead.created_at) >= 3) {
      items.push({
        id: `pipeline:new-uncontacted:${lead.id.toString()}`,
        type: "new_uncontacted",
        priority: "high",
        segment: "pipeline",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: "New lead has no recorded contact",
        next_action: "Make first contact",
      });
    } else if (touch && daysBetween(input.now, touch) >= 30) {
      items.push({
        id: `pipeline:stale:${lead.id.toString()}`,
        type: "stale_pipeline",
        priority: "normal",
        segment: "pipeline",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: `No meaningful activity for ${daysBetween(input.now, touch)} days`,
        next_action: "Send relevant market update or archive",
      });
    }

    if (hasRole(lead, "buyer") && !lead.buyer_rep_agreement) {
      items.push({
        id: `pipeline:buyer-rep:${lead.id.toString()}`,
        type: "buyer_rep_missing",
        priority: "high",
        segment: "buyer",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: "Buyer representation agreement not marked complete",
        next_action: "Collect buyer agreement before showings",
      });
    }

    if ((hasRole(lead, "seller") || hasRole(lead, "landlord")) && (
      incompleteJsonChecklist(lead.documents_collected) ||
      incompleteJsonChecklist(lead.disclosures) ||
      incompleteJsonChecklist(lead.marketing_strategy)
    )) {
      items.push({
        id: `pipeline:seller-readiness:${lead.id.toString()}`,
        type: "seller_readiness_gap",
        priority: hasRole(lead, "seller") ? "high" : "normal",
        segment: hasRole(lead, "seller") ? "seller" : "landlord",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: "Seller/owner documents, disclosures, or marketing plan are incomplete",
        next_action: "Finish readiness checklist",
      });
    }

    if ((hasRole(lead, "tenant") || hasRole(lead, "renter")) && incompleteJsonChecklist(lead.docs_readiness)) {
      items.push({
        id: `pipeline:tenant-docs:${lead.id.toString()}`,
        type: "tenant_docs_gap",
        priority: "normal",
        segment: "tenant",
        lead_id: lead.id.toString(),
        title: leadName(lead),
        detail: "Tenant document readiness is incomplete",
        next_action: "Request missing rental application documents",
      });
    }
  }

  for (const lease of input.leases) {
    const days = daysBetween(lease.lease_end_date, input.now);
    if (days >= 0 && days <= 90 && !lease.outreach_90d_sent_at) {
      items.push({
        id: `pipeline:lease-90:${lease.id.toString()}`,
        type: "lease_renewal_window",
        priority: days <= 30 ? "urgent" : "high",
        segment: "landlord",
        lead_id: lease.landlord_lead_id.toString(),
        lease_id: lease.id.toString(),
        title: lease.address,
        detail: `Lease expires in ${days} days`,
        next_action: "Start renewal, relist, or sell conversation",
        due_at: lease.lease_end_date.toISOString(),
      });
    }
  }

  return sortItems(items).slice(0, 50);
}

function buildToolGaps(input: { leads: GrowthLead[]; leases: GrowthLease[]; now: Date }) {
  const buyersMissingRep = input.leads.filter((lead) => hasRole(lead, "buyer") && !lead.buyer_rep_agreement).length;
  const sellersWithoutPlanning = input.leads.filter((lead) =>
    (hasRole(lead, "seller") || String(lead.seller_potential || "none") !== "none") &&
    incompleteJsonChecklist(lead.marketing_strategy)
  ).length;
  const landlordsWithLeaseWindow = input.leases.filter((lease) => {
    const days = daysBetween(lease.lease_end_date, input.now);
    return days >= 0 && days <= 180 && !lease.seller_comps_6mo_sent_at;
  }).length;
  const tenantsMissingDocs = input.leads.filter((lead) =>
    (hasRole(lead, "tenant") || hasRole(lead, "renter")) && incompleteJsonChecklist(lead.docs_readiness)
  ).length;

  return [
    {
      segment: "buyers",
      count: buyersMissingRep,
      tool: "Buyer agreement and financing readiness",
      next_action: "Triage buyers before showings",
    },
    {
      segment: "sellers",
      count: sellersWithoutPlanning,
      tool: "Valuation, proceeds, readiness, and marketing plan",
      next_action: "Tighten seller intake and market-report cadence",
    },
    {
      segment: "landlords",
      count: landlordsWithLeaseWindow,
      tool: "Renewal, relist, vacancy cost, and sell-option reports",
      next_action: "Send owner options before lease deadlines",
    },
    {
      segment: "tenants",
      count: tenantsMissingDocs,
      tool: "Document readiness and rent-vs-buy conversion",
      next_action: "Collect docs and qualify rent-vs-buy intent",
    },
  ];
}

export function summarizeGrowthTools(input: {
  leads: GrowthLead[];
  campaigns?: GrowthCampaign[];
  tasks?: GrowthTask[];
  leases?: GrowthLease[];
  portalEvents?: GrowthPortalEvent[];
  now?: Date;
  isBroker?: boolean;
}) {
  const now = input.now || new Date();
  const leads = input.leads || [];
  const campaigns = input.campaigns || [];
  const tasks = input.tasks || [];
  const leases = input.leases || [];
  const eventsByLead = indexEvents(input.portalEvents || []);
  const leasesByLead = indexLeases(leases);

  const roleCounts = {
    total: leads.length,
    buyers: leads.filter((lead) => hasRole(lead, "buyer")).length,
    sellers: leads.filter((lead) => hasRole(lead, "seller")).length,
    landlords: leads.filter((lead) => hasRole(lead, "landlord")).length,
    tenants: leads.filter((lead) => hasRole(lead, "tenant") || hasRole(lead, "renter")).length,
    unassigned: leads.filter((lead) => !lead.agent_id).length,
  };

  const sellerSignalQueue = buildSellerSignalQueue({ leads, eventsByLead, leasesByLead, now });
  const marketingQueue = buildMarketingQueue({ leads, campaigns, leases, now });
  const pipelineQueue = buildPipelineQueue({
    leads,
    tasks,
    leases,
    now,
    isBroker: !!input.isBroker,
  });
  const allItems = sortItems([...sellerSignalQueue, ...marketingQueue, ...pipelineQueue]);

  return {
    generated_at: now.toISOString(),
    counts: {
      ...roleCounts,
      seller_signals: sellerSignalQueue.length,
      marketing_actions: marketingQueue.length,
      pipeline_actions: pipelineQueue.length,
      urgent_actions: allItems.filter((item) => item.priority === "urgent").length,
      high_actions: allItems.filter((item) => item.priority === "high").length,
    },
    tool_gaps: buildToolGaps({ leads, leases, now }),
    seller_signal_queue: sellerSignalQueue,
    marketing_queue: marketingQueue,
    pipeline_queue: pipelineQueue,
    daily_priority_queue: allItems.slice(0, 25),
  };
}
