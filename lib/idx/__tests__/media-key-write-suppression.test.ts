/**
 * MediaKey write-suppression regression suite.
 *
 * DEFECT THIS PINS
 * ----------------
 * `mediaArraysMateriallyEqual` prefers a stable RESO `mediaKey` when BOTH sides carry one and only
 * falls back to URL identity otherwise. The legacy Cotality media writers never selected or
 * serialized `MediaKey`, so the authoritative branch was structurally unreachable and every photo
 * took the URL leg.
 *
 * That leg cannot work against this feed. `rotatingUrlIdentity()` strips only the query/fragment,
 * but Cotality signs in the URL **PATH**: a base64url epoch segment plus a trailing HMAC segment.
 * Live probe (2026-08-14): `origin + pathname` differed for 256/256 rows across two fetches two
 * seconds apart, so `rows_materially_changed === rows_checked` by construction and every
 * photo-bearing listing rewrote its `media` JSON on every cycle.
 *
 * FIXTURE DISCIPLINE — READ BEFORE ADDING CASES
 * ---------------------------------------------
 * The URLs below are the REAL production shape captured live. The two variants differ ONLY in the
 * rotating epoch segment and the trailing signature:
 *
 *   MjAvMjE1MjYvMTc4Njc0NTQzMA  ->  "20/21526/1786745430"  ->  2026-08-14T22:10:30Z
 *   MjAvMjE1MjYvMTc4Njc0NTQzMQ  ->  "20/21526/1786745431"  ->  2026-08-14T22:10:31Z
 *
 * Do NOT write `?sig=AAA`-style fixtures. The pre-existing suite did exactly that, encoding a
 * signature in the QUERY STRING — a URL shape Cotality does not emit. Against that fabricated
 * shape `rotatingUrlIdentity()` works perfectly, which is why the suite stayed green for months
 * while production rewrote every row on every cycle. The fixture encoded an assumption instead of
 * an observation.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mediaArraysMateriallyEqual } from "@/lib/idx/write-suppression";

/** Real Cotality signed-path shape. `epochSeg`/`sig` are the ONLY rotating parts. */
function cotalityUrl(opts: { asset?: string; listingKey?: string; epochSeg: string; sig: string }): string {
  const asset = opts.asset ?? "PHOTO-Jpeg";
  const listingKey = opts.listingKey ?? "1159974141";
  return `https://api.cotality.com/trestle/Media/Property/${asset}/${listingKey}/1/NjA0My8xMTM3MS8yMA/${opts.epochSeg}/${opts.sig}`;
}

/** Same asset, one second later — what every cycle actually observes. */
const URL_T0 = cotalityUrl({ epochSeg: "MjAvMjE1MjYvMTc4Njc0NTQzMA", sig: "8b2IaBQZw4OIhqiDrtfcyw7iBDy3oYBg-2FEm6J1Dgo" });
const URL_T1 = cotalityUrl({ epochSeg: "MjAvMjE1MjYvMTc4Njc0NTQzMQ", sig: "YW2dILJMdOX-66DczohLZ5QHatHmmGglKDRZYx18hj8" });
/** A genuinely DIFFERENT asset (different path segment), not merely a re-signature. */
const URL_OTHER_ASSET = cotalityUrl({ asset: "PHOTO-Jpeg", listingKey: "1159974141", epochSeg: "MjAvMjE1MjYvMTc4Njc0NTQzMA", sig: "8b2IaBQZw4OIhqiDrtfcyw7iBDy3oYBg-2FEm6J1Dgo" }).replace("/1/NjA0My8xMTM3MS8yMA/", "/2/NjA0My8xMTM3MS8yMA/");

const KEY_A = "2005679834920";
const KEY_B = "2005628585006";

const item = (over: Partial<{ url: string; mediaType: string; order: number; mediaKey: string }> = {}) => ({
  url: URL_T0,
  mediaType: "Photo",
  order: 0,
  ...over,
});

const SYNC_SRC = readFileSync(join(__dirname, "..", "sync.ts"), "utf8");

describe("MediaKey identity defeats Cotality rotating-path churn", () => {
  it("SAME MediaKey + rotated signed path => EQUAL (no write) — the whole point of the fix", () => {
    const stored = [item({ url: URL_T0, mediaKey: KEY_A })];
    const incoming = [item({ url: URL_T1, mediaKey: KEY_A })];

    // Guard: the fixtures must genuinely differ, or this test proves nothing.
    expect(URL_T0).not.toEqual(URL_T1);
    expect(new URL(URL_T0).pathname).not.toEqual(new URL(URL_T1).pathname);
    expect(new URL(URL_T0).search).toBe("");

    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(true);
  });

  it("without MediaKey the same rotation is MATERIAL — reproduces the production defect", () => {
    const stored = [item({ url: URL_T0 })];
    const incoming = [item({ url: URL_T1 })];
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(false);
  });

  it("multi-photo gallery with stable keys and fully rotated URLs => EQUAL", () => {
    const stored = [item({ url: URL_T0, mediaKey: KEY_A, order: 0 }), item({ url: URL_T0, mediaKey: KEY_B, order: 1 })];
    const incoming = [item({ url: URL_T1, mediaKey: KEY_A, order: 0 }), item({ url: URL_T1, mediaKey: KEY_B, order: 1 })];
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(true);
  });
});

describe("genuine changes still write", () => {
  it("CHANGED MediaKey (photo replaced in the same slot) => MATERIAL", () => {
    const stored = [item({ mediaKey: KEY_A })];
    const incoming = [item({ mediaKey: KEY_B })];
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(false);
  });

  it("ADDED item => MATERIAL via length", () => {
    const stored = [item({ mediaKey: KEY_A })];
    const incoming = [item({ mediaKey: KEY_A }), item({ mediaKey: KEY_B, order: 1 })];
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(false);
  });

  it("REMOVED item => MATERIAL via length", () => {
    const stored = [item({ mediaKey: KEY_A }), item({ mediaKey: KEY_B, order: 1 })];
    const incoming = [item({ mediaKey: KEY_A })];
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(false);
  });

  it("CHANGED order => MATERIAL (hero/gallery ordering must still write)", () => {
    const stored = [item({ mediaKey: KEY_A, order: 0 })];
    const incoming = [item({ mediaKey: KEY_A, order: 1 })];
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(false);
  });

  it("PreferredPhoto promotion (order 0 -> -1) => MATERIAL", () => {
    const stored = [item({ mediaKey: KEY_A, order: 0 })];
    const incoming = [item({ mediaKey: KEY_A, order: -1 })];
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(false);
  });

  it("CHANGED mediaType (Photo -> FloorPlan) => MATERIAL", () => {
    const stored = [item({ mediaKey: KEY_A, mediaType: "Photo" })];
    const incoming = [item({ mediaKey: KEY_A, mediaType: "FloorPlan" })];
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(false);
  });

  it("REORDERED items (keys swapped between slots) => MATERIAL", () => {
    const stored = [item({ mediaKey: KEY_A, order: 0 }), item({ mediaKey: KEY_B, order: 1 })];
    const incoming = [item({ mediaKey: KEY_B, order: 0 }), item({ mediaKey: KEY_A, order: 1 })];
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(false);
  });

  it("authoritative empty (source deleted every photo) => MATERIAL, so the gallery is cleared", () => {
    const stored = [item({ mediaKey: KEY_A })];
    expect(mediaArraysMateriallyEqual(stored, [])).toBe(false);
    // ...and an already-empty gallery stays suppressed (no pointless write).
    expect(mediaArraysMateriallyEqual([], [])).toBe(true);
  });
});

describe("mixed-state fallback — the deploy-day convergence path", () => {
  it("STORED row lacks mediaKey (pre-fix JSON) => URL fallback, so it converges with ONE write", () => {
    const stored = [item({ url: URL_T0 })]; // written before this fix
    const incoming = [item({ url: URL_T1, mediaKey: KEY_A })];
    // Rotated URL + no stored key => not equal => exactly one convergence write that stores the key.
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(false);
    // The very next cycle, both sides carry the key and the rotation stops mattering.
    expect(mediaArraysMateriallyEqual(incoming, [item({ url: URL_T0, mediaKey: KEY_A })])).toBe(true);
  });

  it("INCOMING row lacks mediaKey (feed surprise) => URL fallback, never a bypass", () => {
    const stored = [item({ url: URL_T0, mediaKey: KEY_A })];
    const sameAsset = [item({ url: URL_T0 })];
    const rotated = [item({ url: URL_T1 })];
    expect(mediaArraysMateriallyEqual(stored, sameAsset)).toBe(true); // identical URL still equal
    expect(mediaArraysMateriallyEqual(stored, rotated)).toBe(false); // fail-closed on rotation
  });

  it("DOCUMENTED HAZARD: an empty-string key IS accepted as identity — which is exactly why the writer omits the property", () => {
    const stored = [{ url: URL_T0, mediaType: "Photo", order: 0, mediaKey: "" }];
    const incoming = [{ url: URL_OTHER_ASSET, mediaType: "Photo", order: 0, mediaKey: "" }];
    expect(URL_OTHER_ASSET).not.toEqual(URL_T0);

    // `stored.mediaKey ?? null` does NOT catch "": `??` only catches null/undefined. So "" reaches
    // the identity branch, `"" === ""` short-circuits the URL comparison, and two DIFFERENT assets
    // are declared equal — a photo replacement would be silently suppressed.
    //
    // This asserts the comparator's ACTUAL behaviour, not the desired behaviour. Comparator
    // semantics are deliberately OUT OF SCOPE for this PR. The defense lives entirely in the
    // writers: they omit the property rather than serializing "", so "" can never be produced.
    // If a future change ever makes a writer emit "", this test still passes but the source
    // contract below fails — that is the intended tripwire.
    expect(mediaArraysMateriallyEqual(stored, incoming)).toBe(true);

    // The writer-side defense, pinned:
    expect(SYNC_SRC).toContain("...(mediaKey ? { mediaKey } : {})");
    expect(SYNC_SRC).not.toContain('mediaKey: mediaKey ?? ""');
    expect(SYNC_SRC).not.toContain("mediaKey: String(m.MediaKey)");
  });
});

describe("writer source contract — both reachable Cotality media writers", () => {
  const siteA = SYNC_SRC.slice(SYNC_SRC.indexOf("export async function syncListings"), SYNC_SRC.indexOf("export async function syncAgentHistory"));
  const siteC = SYNC_SRC.slice(SYNC_SRC.indexOf("export async function syncAgentHistory"));

  it.each([
    ["Site A syncListings", () => siteA],
    ["Site C syncAgentHistory", () => siteC],
  ])("%s selects MediaKey and serializes it onto the legacy item", (_label, get) => {
    const src = get();
    expect(src).toContain("PreferredPhotoYN,MediaStatus,MediaKey");
    expect(src).toContain('const mediaKey = typeof m.MediaKey === "string" ? m.MediaKey.trim() : "";');
    // Omitted when absent — NOT serialized as "" or undefined.
    expect(src).toContain("...(mediaKey ? { mediaKey } : {})");
    // Untouched behaviour: PreferredPhoto/order mapping is byte-identical.
    expect(src).toContain("order: isPreferred ? -1 : Number(m.Order ?? 0),");
  });

  it("Site A keeps its completeness pre-seed and authoritative-[] deletion reconciliation", () => {
    expect(siteA).toContain("for (const key of batch) mediaByListing.set(String(key), []);");
    expect(siteA).toContain("incomplete ⇒ never clear, never tombstone");
  });

  it("the DEAD backfillEmptyMedia writer was NOT modified (out of scope)", () => {
    // It has no caller; touching it would widen this PR for zero live effect.
    expect(SYNC_SRC).toContain('mediaParams.set("$select", "ResourceRecordKey,ResourceRecordID,MediaURL,MediaCategory,Order,PreferredPhotoYN,MediaStatus");');
  });
});
