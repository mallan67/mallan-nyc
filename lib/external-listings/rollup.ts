export type ExternalListingRollupComment = {
  id: bigint;
  external_listing_id: bigint;
  lead_id: bigint | null;
  agent_id: bigint | null;
  request_type: string;
  created_at: Date;
};

export type ExternalListingRollupListing = {
  id: bigint;
  lead_id: bigint;
  title: string | null;
  address: string | null;
  source_host: string | null;
  action_bucket: string;
  family_visible: boolean;
  updated_at: Date;
  comments?: ExternalListingRollupComment[];
};

export type ExternalListingPriorityItem = {
  external_listing_id: string;
  title: string;
  reason: string;
  priority: "urgent" | "high" | "normal";
  latest_activity_at: string;
};

function listingTitle(listing: ExternalListingRollupListing): string {
  return listing.title || listing.address || listing.source_host || "Outside listing";
}

export function summarizeExternalListingActivity(listings: ExternalListingRollupListing[]) {
  const buckets = {
    saved: 0,
    seen: 0,
    liked: 0,
    disliked: 0,
    discuss: 0,
  };
  const requests = {
    request_info: 0,
    showing_request: 0,
  };
  const priorityItems: ExternalListingPriorityItem[] = [];
  let familyVisible = 0;
  let familyDiscussionActive = 0;

  for (const listing of listings) {
    const bucket = listing.action_bucket as keyof typeof buckets;
    if (bucket in buckets) buckets[bucket] += 1;
    if (listing.family_visible) familyVisible += 1;

    const comments = [...(listing.comments || [])].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    let hasFamilyComment = false;
    let latestLeadOrFamilyComment: ExternalListingRollupComment | null = null;
    let latestAgentComment: ExternalListingRollupComment | null = null;

    for (const comment of comments) {
      if (comment.request_type === "request_info") requests.request_info += 1;
      if (comment.request_type === "showing_request") requests.showing_request += 1;
      if (comment.lead_id) {
        latestLeadOrFamilyComment = comment;
        if (listing.family_visible && comment.lead_id !== listing.lead_id) hasFamilyComment = true;
      }
      if (comment.agent_id) latestAgentComment = comment;
    }

    if (hasFamilyComment) familyDiscussionActive += 1;

    const latestRequest = [...comments].reverse().find((comment) =>
      comment.lead_id && (comment.request_type === "request_info" || comment.request_type === "showing_request")
    );
    const latestNeedsResponseComment =
      latestLeadOrFamilyComment &&
      (!latestAgentComment || latestLeadOrFamilyComment.created_at > latestAgentComment.created_at)
        ? latestLeadOrFamilyComment
        : null;

    if (latestNeedsResponseComment) {
      const requestType = latestRequest?.request_type;
      priorityItems.push({
        external_listing_id: listing.id.toString(),
        title: listingTitle(listing),
        reason: requestType === "showing_request"
          ? "Tour requested"
          : requestType === "request_info"
            ? "Info requested"
            : listing.family_visible
              ? "Family discussion active"
              : "Buyer note needs response",
        priority: requestType === "showing_request" ? "urgent" : requestType === "request_info" ? "high" : "normal",
        latest_activity_at: latestNeedsResponseComment.created_at.toISOString(),
      });
    }
  }

  priorityItems.sort((a, b) => {
    const weight = { urgent: 3, high: 2, normal: 1 };
    return weight[b.priority] - weight[a.priority] ||
      new Date(b.latest_activity_at).getTime() - new Date(a.latest_activity_at).getTime();
  });

  return {
    total: listings.length,
    buckets,
    requests,
    family_visible: familyVisible,
    family_discussion_active: familyDiscussionActive,
    needs_agent_response: priorityItems.length,
    priority_items: priorityItems,
  };
}
