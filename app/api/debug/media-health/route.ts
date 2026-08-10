// GET /api/debug/media-health
// Diagnostic endpoint — tests every step of the photo pipeline.
// Protected: broker/agent session required.
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { hasCredentials, getAccessToken } from "@/lib/idx/auth";
import { hasR2Config } from "@/lib/images/r2";
import { checkCredentials } from "@/lib/monitoring/health-verdict";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const results: Record<string, unknown> = {};

  // 1. Check Trestle credentials
  results.trestleCredentials = hasCredentials() ? "CONFIGURED" : "MISSING";

  // 2. Check Trestle token acquisition
  if (hasCredentials()) {
    try {
      const token = await getAccessToken();
      results.trestleToken = token ? `OK (${token.substring(0, 8)}...)` : "EMPTY";
    } catch (err) {
      results.trestleToken = `FAIL: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // 3. Check R2 configuration
  results.r2Config = hasR2Config() ? "CONFIGURED" : "MISSING";
  results.r2PublicUrl = process.env.R2_PUBLIC_URL || "NOT SET";
  results.r2Bucket = process.env.R2_BUCKET_NAME ? "SET" : "NOT SET";

  // 4. Check DB media state
  try {
    const totalListings = await prisma.listing.count({
      where: { status: { in: ["Active", "ComingSoon", "ActiveUnderContract"] } },
    });
    const emptyMedia = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "listings"
      WHERE status IN ('Active', 'ComingSoon', 'ActiveUnderContract')
        AND (media IS NULL OR media::text = '[]' OR media::text = '{}')
    `;
    const trestleUrls = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "listings"
      WHERE status IN ('Active', 'ComingSoon', 'ActiveUnderContract')
        AND media IS NOT NULL AND media::text != '[]'
        AND (media::text LIKE '%cotality.com%' OR media::text LIKE '%corelogic.com%')
    `;
    const r2Urls = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "listings"
      WHERE status IN ('Active', 'ComingSoon', 'ActiveUnderContract')
        AND media IS NOT NULL AND media::text != '[]'
        AND media::text LIKE '%r2.dev%' OR media::text LIKE '%mallan.nyc/photos%'
    `;

    results.dbState = {
      totalActive: totalListings,
      emptyMedia: Number(emptyMedia[0]?.count ?? 0),
      trestleUrls: Number(trestleUrls[0]?.count ?? 0),
      r2Urls: Number(r2Urls[0]?.count ?? 0),
    };
  } catch (err) {
    results.dbState = `FAIL: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 5. Test actual photo fetch (pick first listing with media)
  try {
    const sample = await prisma.$queryRaw<{ listing_id: string; media: unknown }[]>`
      SELECT listing_id, media FROM "listings"
      WHERE status = 'Active' AND media IS NOT NULL AND media::text != '[]'
      LIMIT 1
    `;
    if (sample.length > 0) {
      const media = sample[0].media as Record<string, unknown>[];
      const firstItem = Array.isArray(media) ? media[0] : null;
      const rawUrl = String(firstItem?.url || firstItem?.MediaURL || "");
      results.sampleListing = sample[0].listing_id;
      results.sampleMediaUrl = rawUrl ? `${rawUrl.substring(0, 80)}...` : "EMPTY";

      if (rawUrl && (rawUrl.includes("cotality.com") || rawUrl.includes("corelogic.com"))) {
        // Actually test fetching this photo from Trestle
        try {
          const token = await getAccessToken();
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 8000);
          try {
            const resp = await fetch(rawUrl, {
              headers: { Authorization: `Bearer ${token}`, Accept: "image/*" },
              signal: controller.signal,
            });
            results.samplePhotoFetch = {
              status: resp.status,
              contentType: resp.headers.get("content-type"),
              size: resp.headers.get("content-length") || "unknown",
              ok: resp.ok,
            };
          } finally {
            clearTimeout(tid);
          }
        } catch (err) {
          results.samplePhotoFetch = `FAIL: ${err instanceof Error ? err.message : String(err)}`;
        }
      } else if (rawUrl) {
        results.samplePhotoFetch = `URL is not Trestle (likely R2 or other): ${rawUrl.substring(0, 50)}`;
      }
    } else {
      results.sampleListing = "NO ACTIVE LISTINGS WITH MEDIA FOUND";
    }
  } catch (err) {
    results.sampleTest = `FAIL: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 6. Test R2 upload/read.
  //
  // The unconfigured branch is NOT optional. This previously had no `else`, so
  // when R2 credentials were absent the `r2Connection` key was simply missing
  // from the response — an operator read the JSON, saw no R2 problem reported,
  // and concluded R2 was healthy. Absence of evidence is not PASS: an
  // unobservable subsystem must say so out loud, naming the credentials that
  // are missing (NEVER their values).
  if (hasR2Config()) {
    try {
      const { existsInR2 } = await import("@/lib/images/r2");
      const testKey = "health-check/test.txt";
      const exists = await existsInR2(testKey);
      results.r2Connection = exists ? "OK (test file exists)" : "OK (connected, test file not found)";
    } catch (err) {
      results.r2Connection = `FAIL: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    const unavailable = checkCredentials(
      "r2-mirror",
      ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL"],
      process.env,
    );
    results.r2Connection = `UNAVAILABLE: ${unavailable?.evidence ?? "R2 not configured"}`;
  }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
