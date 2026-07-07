// P1C3 (ledger M3): pure records→card-media mapping for the agent listings
// route's live Media batch. Extracted from app/api/agents/[slug]/listings/
// route.ts batchFetchPhotos so the classification is testable (route files
// cannot export helpers in the App Router).
//
// Cards carry ONLY canonical Photos: floorplans are skipped (the old
// `cat.includes('floor plan')` never matched the feed's no-space enum member
// 'FloorPlan', so floorplans leaked onto cards as photos), and Videos /
// VirtualTours no longer masquerade as card photos either (declared behavior
// change — previously every kept record was hard-coded mediaType:'Photo').

import { classifyMediaItem } from "@/lib/media/listing-media-resolver";

export interface AgentCardMediaItem {
  url: string;
  mediaType: string;
  order: number;
}

export function mapAgentCardMedia(
  records: Array<Record<string, unknown>>,
): Map<string, AgentCardMediaItem[]> {
  const byKey = new Map<string, AgentCardMediaItem[]>();
  for (const m of records) {
    // Prefer ResourceRecordKey (unique), fall back to ResourceRecordID
    const mkey = String(m.ResourceRecordKey || m.ResourceRecordID || "");
    if (!mkey || !m.MediaURL) continue;
    // Canonical classifier (URL-shape aware — catches null-category DOCUMENT- floorplans).
    if (classifyMediaItem(m) !== "photo") {
      continue;
    }
    const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === "true";
    if (!byKey.has(mkey)) byKey.set(mkey, []);
    byKey.get(mkey)!.push({
      url: String(m.MediaURL),
      mediaType: "Photo",
      order: isPreferred ? -1 : Number(m.Order ?? 0),
    });
  }
  return byKey;
}
