import fs from "node:fs";
import path from "node:path";
import {
  LISTING_PLACEHOLDER_IMAGE,
  countPhotoMedia,
  getHeroPhoto,
  getValidPhotoMedia,
} from "@/lib/media/listing-card-media";
import { classifyMediaItem, resolveListingMedia } from "@/lib/media/listing-media-resolver";
import { dbListingToPublicDTO, type DbListing } from "@/lib/idx/db-to-public-dto";

const root = path.resolve(__dirname, "../../..");

function source(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function buildDbListing(media: unknown): DbListing {
  return {
    id: "1",
    listing_id: "RLS-P0",
    status: "Active",
    listing_type: "sale",
    property_type: "Residential",
    property_sub_type: "Condo",
    list_price: "1000000",
    bedrooms_total: 1,
    bathrooms_full: 1,
    bathrooms_half: 0,
    living_area: null,
    borough: "Manhattan",
    neighborhood: "Chelsea",
    address: {
      StreetNumber: "1",
      StreetName: "MAIN",
      UnitNumber: "1A",
      City: "New York",
      PostalCode: "10011",
      Borough: "manhattan",
    },
    features: {},
    media,
    agent_info: { ListOfficeName: "Test Office" },
    rls_eligible: true,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
    listing_contract_date: "2026-01-01T00:00:00.000Z",
    modification_timestamp: "2026-01-02T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };
}

describe("Media Display P0", () => {
  it("floorplan first but photo second -> card hero shows photo", () => {
    const hero = getHeroPhoto([
      { url: "https://cdn.example.com/floorplan.jpg", mediaType: "FloorPlan", order: 1 },
      { url: "https://cdn.example.com/photo.jpg", mediaType: "Photo", order: 2 },
    ]);

    expect(hero).toBe("https://cdn.example.com/photo.jpg");
  });

  it("classifies all known FloorPlan variants as FloorPlan", () => {
    for (const value of ["FloorPlan", "Floor Plan", "floor_plan", "floorplan", "FLOORPLAN"]) {
      expect(classifyMediaItem({ MediaCategory: value })).toBe("floorplan");
    }
  });

  it("skips blank, null, malformed, and non-photo URLs", () => {
    expect(getValidPhotoMedia([
      { url: "", mediaType: "Photo" },
      { url: null, mediaType: "Photo" },
      { url: "not-a-url", mediaType: "Photo" },
      { url: "https://cdn.example.com/fp.jpg", mediaType: "FloorPlan" },
      { url: "https://cdn.example.com/video.mp4", mediaType: "Video" },
      { url: "https://cdn.example.com/photo.jpg", mediaType: "Photo" },
    ])).toEqual([{ url: "https://cdn.example.com/photo.jpg", mediaType: "Photo" }]);
  });

  it("failed first photo advances to the next valid photo", () => {
    const media = [
      { url: "https://cdn.example.com/first.jpg", mediaType: "Photo", order: 1 },
      { url: "https://cdn.example.com/second.jpg", mediaType: "Photo", order: 2 },
    ];

    expect(getHeroPhoto(media, new Set(["https://cdn.example.com/first.jpg"]))).toBe("https://cdn.example.com/second.jpg");
  });

  it("uses the placeholder when no valid photos exist", () => {
    expect(getHeroPhoto([
      { url: "https://cdn.example.com/fp.jpg", mediaType: "FloorPlan" },
      { url: "bad url", mediaType: "Photo" },
    ])).toBe(LISTING_PLACEHOLDER_IMAGE);
  });

  it("photosCount excludes floorplans and videos on the DB-first DTO path", () => {
    const dto = dbListingToPublicDTO(buildDbListing([
      { url: "https://cdn.example.com/fp.jpg", mediaType: "FloorPlan", order: 1 },
      { url: "https://cdn.example.com/photo.jpg", mediaType: "Photo", order: 2 },
      { url: "https://cdn.example.com/tour.mp4", mediaType: "Video", order: 3 },
    ]));

    expect(dto.photosCount).toBe(1);
    expect(dto.media[0]).toMatchObject({ url: "https://cdn.example.com/photo.jpg", mediaType: "Photo" });
  });

  it("FeaturedListings and SearchListingCard use the shared helper", () => {
    expect(source("app/components/SearchListingCard.tsx")).toContain("@/lib/media/listing-card-media");
    expect(source("app/components/FeaturedListings.tsx")).toContain("@/lib/media/listing-card-media");
  });

  it("listing detail gallery separates photos and floorplans through the shared resolver", () => {
    const detailSource = source("app/listing/[id]/page.tsx");
    expect(detailSource).toContain("resolveListingMedia");

    const media = resolveListingMedia([
      { MediaURL: "https://cdn.example.com/fp.jpg", MediaCategory: "floor_plan", Order: 1 },
      { MediaURL: "https://cdn.example.com/photo.jpg", MediaCategory: "Photo", Order: 2 },
    ], { mapUrl: rawUrl => rawUrl });

    expect(media.map(m => m.mediaType)).toEqual(["Photo", "FloorPlan"]);
    expect(countPhotoMedia(media)).toBe(1);
  });
});
