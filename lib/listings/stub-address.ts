/**
 * The address JSON of the stub that POST /api/idx/ensure-listing creates for a Cotality listing (another firm's, so that showings and listing-sends have a row to point at).
 *
 * A feed row keeps its address under the provider's own names (StreetNumber, StreetName, UnitNumber, PostalCode, Latitude, Longitude), and the public converter (dbListingToPublicDTO)
 * and the canonical slug read only those. The stub held `full`, `unit`, `zip` and its position under lowercase keys that nothing public reads, so a stub that passed the display gates
 * rendered an empty street number, street name and postal code, no unit and no map, and its canonical URL was `/listing/listing-<id>` instead of the street-based one (found 2026-10-10 by
 * running the converter on the row this route writes; the sync replaces the whole JSON when it loads the real row).
 *
 * The lowercase keys stay, with the values they always had, for any reader that uses them; the provider names are added from what the CRM sent. The CRM sends the street line as
 * mapTrestleToCrmListing builds it: StreetNumber, StreetDirPrefix, StreetName, StreetSuffix and StreetDirSuffix joined by spaces, in capitals ("67 E 82ND STREET"), or the words
 * "ADDRESS AVAILABLE UPON REQUEST" when the feed does not let the address be displayed. The placeholder is never stored as a street: a later display permission would publish it as one.
 * The street line is split after its number; a line without a leading number becomes the street name alone. Nothing here decides whether the address may be shown: the display gates do.
 */

const ADDRESS_WITHHELD = /^address available upon request$/i;

/**
 * "67 E 82ND STREET" -> number "67", rest "E 82ND STREET"; "30-17 ASTORIA BOULEVARD" -> "30-17"; "100A MAIN STREET" -> "100A".
 * An ordinal is not a house number: "5TH AVENUE" has none (a single trailing letter is a house-number suffix, "TH" is not).
 */
const STREET_LINE = /^(\d+(?:-[\dA-Za-z]+)?[A-Za-z]?)\s+(\S.*)$/;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const coordinate = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** The street number and street name of the street line the CRM sent; both empty for the withheld-address placeholder or a blank line. */
export function splitStubStreetLine(line: unknown): { streetNumber: string; streetName: string } {
  const street = text(line);
  if (!street || ADDRESS_WITHHELD.test(street)) return { streetNumber: "", streetName: "" };
  const match = STREET_LINE.exec(street);
  return match ? { streetNumber: match[1], streetName: match[2].trim() } : { streetNumber: "", streetName: street };
}

/** The `address` column of a stub, from the request body of the route. */
export function stubAddressJson(body: Record<string, unknown>): Record<string, unknown> {
  const { streetNumber, streetName } = splitStubStreetLine(body.address);
  const unit = text(body.unit);
  const zip = text(body.zip);
  const latitude = coordinate(body.latitude);
  const longitude = coordinate(body.longitude);
  return {
    // the provider's names: what the public converter and the slug read
    ...(streetNumber ? { StreetNumber: streetNumber } : {}),
    ...(streetName ? { StreetName: streetName } : {}),
    ...(unit ? { UnitNumber: unit } : {}),
    ...(zip ? { PostalCode: zip } : {}),
    ...(latitude !== null ? { Latitude: latitude } : {}),
    ...(longitude !== null ? { Longitude: longitude } : {}),
    // the lowercase shape this route has always written, unchanged
    full: (body.address as string) || "",
    unit: (body.unit as string) || "",
    neighborhood: (body.neighborhood as string) || "",
    borough: (body.borough as string) || "",
    zip: (body.zip as string) || "",
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    cross_street: (body.cross_street as string) || "",
  };
}
