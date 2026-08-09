// POST /api/crm/listings/[id]/photos — RETIRED (410 Gone).
//
// WHY THIS ROUTE IS GONE RATHER THAN FIXED.
//
// It was a SECOND, INDEPENDENT media writer. It appended straight into the
// `Listing.media` JSON blob and never created a `listing_media` row, so media
// written here had:
//
//   * no key namespace  — indistinguishable from Cotality feed items in the
//     same JSON array, which is precisely the provenance ambiguity that let
//     feed photos be laundered into the `crm:` namespace (see
//     lib/media/media-provenance.ts);
//   * no relational row — invisible to the canonical resolver, to the R2
//     mirror, to reorder/set-main/delete and to the media summary; and
//   * no R2 object      — the original header called it an "upload
//     placeholder ... until R2 credentials are available". R2 has since been
//     wired, and `POST /api/crm/listings/[id]/media/upload` is the canonical
//     writer: it hashes the bytes, mints a `crm:` key, stores to R2 and
//     creates the relational row.
//
// It also stamped `modification_timestamp: new Date()` on whatever row it
// touched, INCLUDING Trestle-synced rows. `getLastSyncTimestamp()`
// (lib/idx/sync.ts) is MAX(modification_timestamp) over rows with
// `last_synced_from_trestle IS NOT NULL`, so one call against a synced listing
// pushed the incremental cursor to local NOW and the next sync skipped every
// genuine upstream change until real Trestle timestamps caught up. PR-S.7
// closed the CRM-ONLY-row variant of this hazard; this route was the remaining
// synced-row door.
//
// SAFE TO RETIRE: the only client binding, `addPhotos()` in
// public/crm/js/core/api-client.js, has no caller anywhere in the CRM frontend.
// The CRM frontend is a HELD surface (public/crm/**), so the dead client method
// is deliberately left untouched for Maya to remove.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

/** Canonical replacement — relational, namespaced, R2-backed. */
const CANONICAL_UPLOAD_ROUTE = "/api/crm/listings/[id]/media/upload";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // AUTH IS RETAINED even though this handler mutates nothing. A POST route with
  // no auth check is exactly the shape the RBAC validator (idx:validate §12) and
  // the repo's mutation invariant forbid, and dropping the check would also let
  // an unauthenticated caller probe which listing ids exist. Retired ≠ open.
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  return NextResponse.json(
    {
      error:
        `This endpoint is retired. It wrote directly to the Listing.media JSON, ` +
        `bypassing listing_media, and could advance the Trestle sync cursor. ` +
        `Use ${CANONICAL_UPLOAD_ROUTE} instead.`,
      code: "LEGACY_MEDIA_WRITER_RETIRED",
      canonical_route: CANONICAL_UPLOAD_ROUTE,
      listing_id: id,
    },
    { status: 410 },
  );
}
