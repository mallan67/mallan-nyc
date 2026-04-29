export type BuyerPriorityLevel = "urgent" | "high" | "normal";

export type BuyerPriorityType =
  | "tour_requested"
  | "request_info"
  | "budget_stretch"
  | "outside_listing_liked"
  | "family_discussion"
  | "buyer_note";

export type BuyerPriorityComment = {
  id: bigint;
  external_listing_id?: bigint;
  lead_id: bigint | null;
  agent_id: bigint | null;
  request_type: string;
  created_at: Date;
};

export type BuyerPriorityExternalListing = {
  id: bigint;
  lead_id: bigint;
  title: string | null;
  address: string | null;
  source_host: string | null;
  action_bucket: string;
  family_visible: boolean;
  updated_at: Date;
  comments?: BuyerPriorityComment[];
};

export type BuyerPriorityShowing = {
  id: bigint;
  status: string;
  date: Date;
  created_at: Date;
  listing?: {
    address: string | null;
    listing_id?: string | null;
  } | null;
};

export type BuyerPriorityFinancialIntent = {
  event_count: number;
  last_tool_used_at: Date | null;
  highest_budget_tested: number | null;
  latest_budget_tested: number | null;
  stretch_amount: number | null;
  stretch_percent: number | null;
};

export type BuyerPriorityItem = {
  id: string;
  type: BuyerPriorityType;
  priority: BuyerPriorityLevel;
  title: string;
  detail: string;
  action: "listings" | "financial" | "showings";
  external_listing_id?: string;
  showing_id?: string;
  latest_activity_at: string;
};

const PRIORITY_WEIGHT: Record<BuyerPriorityLevel, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
};

function listingTitle(listing: BuyerPriorityExternalListing): string {
  return listing.title || listing.address || listing.source_host || "Outside listing";
}

function latestDate(dates: Array<Date | null | undefined>): Date {
  return dates.reduce<Date>((latest, current) => {
    if (!current) return latest;
    return current > latest ? current : latest;
  }, new Date(0));
}

function laterThan(left: BuyerPriorityComment | null, right: BuyerPriorityComment | null): boolean {
  if (!left) return false;
  if (!right) return true;
  return left.created_at > right.created_at;
}

function budgetStretchPriority(financialIntent: BuyerPriorityFinancialIntent): BuyerPriorityLevel {
  const stretchAmount = financialIntent.stretch_amount ?? 0;
  const stretchPercent = financialIntent.stretch_percent ?? 0;
  if (stretchAmount >= 250000 || stretchPercent >= 15) return "urgent";
  if (stretchAmount > 0 || stretchPercent > 0) return "high";
  return "normal";
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "unknown";
  return "$" + Math.round(value).toLocaleString("en-US");
}

export function summarizeBuyerDailyPriorities(input: {
  externalListings?: BuyerPriorityExternalListing[];
  financialIntent?: BuyerPriorityFinancialIntent | null;
  showings?: BuyerPriorityShowing[];
}) {
  const items: BuyerPriorityItem[] = [];

  for (const showing of input.showings || []) {
    if (showing.status !== "requested") continue;
    const title = showing.listing?.address || showing.listing?.listing_id || "Showing request";
    items.push({
      id: `showing:${showing.id.toString()}`,
      type: "tour_requested",
      priority: "urgent",
      title: "Tour requested",
      detail: title,
      action: "showings",
      showing_id: showing.id.toString(),
      latest_activity_at: latestDate([showing.created_at, showing.date]).toISOString(),
    });
  }

  for (const listing of input.externalListings || []) {
    const comments = [...(listing.comments || [])].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    const latestAgentComment = [...comments].reverse().find((comment) => comment.agent_id) || null;
    const latestLeadOrFamilyComment = [...comments].reverse().find((comment) => comment.lead_id) || null;
    const latestRequest = [...comments].reverse().find((comment) =>
      comment.lead_id && (comment.request_type === "request_info" || comment.request_type === "showing_request")
    ) || null;
    const latestFamilyComment = [...comments].reverse().find((comment) =>
      listing.family_visible && comment.lead_id && comment.lead_id !== listing.lead_id
    ) || null;
    const needsResponse = laterThan(latestLeadOrFamilyComment, latestAgentComment);
    const title = listingTitle(listing);

    if (latestRequest && laterThan(latestRequest, latestAgentComment)) {
      const isTour = latestRequest.request_type === "showing_request";
      items.push({
        id: `external:${listing.id.toString()}:${latestRequest.request_type}`,
        type: isTour ? "tour_requested" : "request_info",
        priority: isTour ? "urgent" : "high",
        title: isTour ? "Tour requested for outside listing" : "Info requested on outside listing",
        detail: title,
        action: "listings",
        external_listing_id: listing.id.toString(),
        latest_activity_at: latestRequest.created_at.toISOString(),
      });
      continue;
    }

    if (latestFamilyComment && laterThan(latestFamilyComment, latestAgentComment)) {
      items.push({
        id: `external:${listing.id.toString()}:family_discussion`,
        type: "family_discussion",
        priority: "normal",
        title: "Family discussion active",
        detail: title,
        action: "listings",
        external_listing_id: listing.id.toString(),
        latest_activity_at: latestFamilyComment.created_at.toISOString(),
      });
      continue;
    }

    if (needsResponse && latestLeadOrFamilyComment) {
      items.push({
        id: `external:${listing.id.toString()}:buyer_note`,
        type: "buyer_note",
        priority: "normal",
        title: "Buyer note needs response",
        detail: title,
        action: "listings",
        external_listing_id: listing.id.toString(),
        latest_activity_at: latestLeadOrFamilyComment.created_at.toISOString(),
      });
      continue;
    }

    if (listing.action_bucket === "liked") {
      items.push({
        id: `external:${listing.id.toString()}:liked`,
        type: "outside_listing_liked",
        priority: "normal",
        title: "Buyer liked outside listing",
        detail: title,
        action: "listings",
        external_listing_id: listing.id.toString(),
        latest_activity_at: listing.updated_at.toISOString(),
      });
    }
  }

  const financialIntent = input.financialIntent;
  if (financialIntent?.stretch_amount !== null && financialIntent?.stretch_amount !== undefined && financialIntent.stretch_amount > 0) {
    items.push({
      id: "financial:budget_stretch",
      type: "budget_stretch",
      priority: budgetStretchPriority(financialIntent),
      title: "Buyer stretched budget",
      detail: `${money(financialIntent.highest_budget_tested)} tested, ${money(financialIntent.stretch_amount)} above stated budget`,
      action: "financial",
      latest_activity_at: (financialIntent.last_tool_used_at || new Date(0)).toISOString(),
    });
  }

  items.sort((a, b) => {
    return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
      new Date(b.latest_activity_at).getTime() - new Date(a.latest_activity_at).getTime();
  });

  const counts = {
    urgent: items.filter((item) => item.priority === "urgent").length,
    high: items.filter((item) => item.priority === "high").length,
    normal: items.filter((item) => item.priority === "normal").length,
    total: items.length,
    tour_requested: items.filter((item) => item.type === "tour_requested").length,
    request_info: items.filter((item) => item.type === "request_info").length,
    budget_stretch: items.filter((item) => item.type === "budget_stretch").length,
    outside_listing_liked: items.filter((item) => item.type === "outside_listing_liked").length,
    family_discussion: items.filter((item) => item.type === "family_discussion").length,
  };

  return {
    counts,
    highest_priority: items[0]?.priority ?? null,
    items,
  };
}
