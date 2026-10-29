/**
 * Address clause — streets with a direction SUFFIX.
 *
 * Live Cotality (probed read-only 2026-10-28): "425 Park Avenue South" is served as
 * StreetName PARK / StreetSuffix Avenue / StreetDirSuffix S; "116 Central Park South"
 * as CENTRAL / Park / S; "60 Sutton Place South" as SUTTON / Place / S. StreetDirSuffix
 * is in $metadata and set on 13,595 rows. The clause only knew direction PREFIXES, so
 * the Building search sent contains(StreetName,'PARK AVENUE SOUTH') and found nothing.
 */
import { buildCrmIdxQuery } from "../crm-idx-filter";

const q = (params: Record<string, string>) => buildCrmIdxQuery(new URLSearchParams(params));

describe("addressClause — direction suffix", () => {
  it("425 Park Avenue South → PARK + StreetDirSuffix S", () => {
    const f = q({ address: "425 Park Avenue South" }).filter;
    expect(f).toContain("(StreetNumber eq '425' or startswith(StreetNumber,'425-'))");
    expect(f).toContain("contains(StreetName,'PARK')");
    expect(f).toContain("StreetDirSuffix eq 'S'");
    expect(f).not.toContain("PARK AVENUE SOUTH");
  });

  it("116 Central Park South → CENTRAL + S (Park is the street type)", () => {
    const f = q({ address: "116 Central Park South" }).filter;
    expect(f).toContain("contains(StreetName,'CENTRAL')");
    expect(f).toContain("StreetDirSuffix eq 'S'");
  });

  it("60 Sutton Pl S → SUTTON + S (abbreviations)", () => {
    const f = q({ address: "60 Sutton Pl S" }).filter;
    expect(f).toContain("contains(StreetName,'SUTTON')");
    expect(f).toContain("StreetDirSuffix eq 'S'");
  });

  it("a direction PREFIX address is unchanged", () => {
    const f = q({ address: "400 East 90th Street" }).filter;
    expect(f).toContain("StreetDirPrefix eq 'E'");
    expect(f).not.toContain("StreetDirSuffix");
  });

  it("a leading direction word is still a prefix, never a suffix", () => {
    const f = q({ address: "20 South Street" }).filter;
    expect(f).toContain("StreetDirPrefix eq 'S'");
    expect(f).not.toContain("StreetDirSuffix");
  });
});
