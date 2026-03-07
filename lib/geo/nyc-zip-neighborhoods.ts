/**
 * NYC ZIP Code → Neighborhood Library
 *
 * Authoritative mapping of all NYC ZIP codes to their primary neighborhood.
 * Sources: StreetEasy boundaries (March 2026), NYC DCP NTA, USPS delivery areas.
 *
 * Usage:
 *   import { getNeighborhoodForZip, getZipsForNeighborhood } from '@/lib/geo/nyc-zip-neighborhoods';
 *   getNeighborhoodForZip('10017') // => { neighborhood: 'Turtle Bay', borough: 'Manhattan', ... }
 *   getZipsForNeighborhood('Chelsea', 'Manhattan') // => ['10001']
 */

export interface ZipEntry {
  neighborhood: string;
  borough: string;
  area: string;
  alternateNames?: string[];
}

export const NYC_ZIP_MAP: Record<string, ZipEntry> = {
  "10001": {
    "neighborhood": "Chelsea",
    "borough": "Manhattan",
    "area": "Penn Station area, 23rd-34th west",
    "alternateNames": [
      "Hudson Yards south"
    ]
  },
  "10002": {
    "neighborhood": "Lower East Side",
    "borough": "Manhattan",
    "area": "Also covers Two Bridges, east Chinatown",
    "alternateNames": [
      "Two Bridges"
    ]
  },
  "10003": {
    "neighborhood": "East Village",
    "borough": "Manhattan",
    "area": "Astor Place to 14th, 3rd Ave to Broadway",
    "alternateNames": [
      "NoHo north",
      "Ukrainian Village"
    ]
  },
  "10004": {
    "neighborhood": "Financial District",
    "borough": "Manhattan",
    "area": "Broad St, Stone St, Whitehall"
  },
  "10005": {
    "neighborhood": "Financial District",
    "borough": "Manhattan",
    "area": "Wall St, Exchange Place"
  },
  "10006": {
    "neighborhood": "Financial District",
    "borough": "Manhattan",
    "area": "Trinity Church, Cedar St"
  },
  "10007": {
    "neighborhood": "Financial District",
    "borough": "Manhattan",
    "area": "City Hall, Park Row, Civic Center"
  },
  "10009": {
    "neighborhood": "East Village",
    "borough": "Manhattan",
    "area": "Alphabet City, Tompkins Square",
    "alternateNames": [
      "Alphabet City"
    ]
  },
  "10010": {
    "neighborhood": "Flatiron",
    "borough": "Manhattan",
    "area": "14th-23rd, Park Ave S to 5th Ave",
    "alternateNames": [
      "Gramercy west",
      "Union Square north"
    ]
  },
  "10011": {
    "neighborhood": "Chelsea",
    "borough": "Manhattan",
    "area": "14th-23rd, 6th Ave to 8th Ave — overlaps Chelsea/GV border",
    "alternateNames": [
      "Greenwich Village west"
    ]
  },
  "10012": {
    "neighborhood": "SoHo",
    "borough": "Manhattan",
    "area": "Also covers Nolita, NoHo south",
    "alternateNames": [
      "Nolita",
      "NoHo"
    ]
  },
  "10013": {
    "neighborhood": "Tribeca",
    "borough": "Manhattan",
    "area": "Also covers Little Italy, Hudson Square south",
    "alternateNames": [
      "Little Italy",
      "Hudson Square"
    ]
  },
  "10014": {
    "neighborhood": "West Village",
    "borough": "Manhattan",
    "area": "Hudson to 7th Ave, Houston to 14th",
    "alternateNames": [
      "Greenwich Village west"
    ]
  },
  "10016": {
    "neighborhood": "Murray Hill",
    "borough": "Manhattan",
    "area": "27th-40th, Madison to 3rd Ave",
    "alternateNames": [
      "Kips Bay north",
      "NoMad east"
    ]
  },
  "10017": {
    "neighborhood": "Turtle Bay",
    "borough": "Manhattan",
    "area": "42nd-53rd, Lex to East River, Grand Central",
    "alternateNames": [
      "Midtown East south",
      "Tudor City"
    ]
  },
  "10018": {
    "neighborhood": "Midtown West",
    "borough": "Manhattan",
    "area": "Garment District, 34th-40th, west of 5th"
  },
  "10019": {
    "neighborhood": "Hell's Kitchen",
    "borough": "Manhattan",
    "area": "42nd-59th, 8th Ave to river",
    "alternateNames": [
      "Clinton",
      "Midtown West"
    ]
  },
  "10020": {
    "neighborhood": "Midtown West",
    "borough": "Manhattan",
    "area": "Rockefeller Center"
  },
  "10021": {
    "neighborhood": "Upper East Side",
    "borough": "Manhattan",
    "area": "60th-72nd, 5th Ave to East River",
    "alternateNames": [
      "Lenox Hill"
    ]
  },
  "10022": {
    "neighborhood": "Midtown East",
    "borough": "Manhattan",
    "area": "49th-59th, 5th Ave to East River",
    "alternateNames": [
      "Sutton Place",
      "Plaza District"
    ]
  },
  "10023": {
    "neighborhood": "Upper West Side",
    "borough": "Manhattan",
    "area": "59th-72nd, CPW to river",
    "alternateNames": [
      "Lincoln Center area"
    ]
  },
  "10024": {
    "neighborhood": "Upper West Side",
    "borough": "Manhattan",
    "area": "72nd-86th, CPW to river"
  },
  "10025": {
    "neighborhood": "Upper West Side",
    "borough": "Manhattan",
    "area": "86th-110th, CPW to river",
    "alternateNames": [
      "Morningside Heights south",
      "Manhattan Valley"
    ]
  },
  "10026": {
    "neighborhood": "Harlem",
    "borough": "Manhattan",
    "area": "110th-120th, CPW to Lenox",
    "alternateNames": [
      "Central Harlem south"
    ]
  },
  "10027": {
    "neighborhood": "Harlem",
    "borough": "Manhattan",
    "area": "110th-125th, Morningside to Lenox Ave",
    "alternateNames": [
      "Morningside Heights east",
      "Central Harlem"
    ]
  },
  "10028": {
    "neighborhood": "Yorkville",
    "borough": "Manhattan",
    "area": "79th-96th, Lex to East River",
    "alternateNames": [
      "Upper East Side north"
    ]
  },
  "10029": {
    "neighborhood": "East Harlem",
    "borough": "Manhattan",
    "area": "96th-120th, 5th Ave to East River",
    "alternateNames": [
      "El Barrio",
      "Spanish Harlem"
    ]
  },
  "10030": {
    "neighborhood": "Harlem",
    "borough": "Manhattan",
    "area": "135th-145th, west side"
  },
  "10031": {
    "neighborhood": "Harlem",
    "borough": "Manhattan",
    "area": "Hamilton Heights, 140th-155th",
    "alternateNames": [
      "Hamilton Heights",
      "Sugar Hill"
    ]
  },
  "10032": {
    "neighborhood": "Washington Heights",
    "borough": "Manhattan",
    "area": "155th-181st"
  },
  "10033": {
    "neighborhood": "Washington Heights",
    "borough": "Manhattan",
    "area": "175th-190th"
  },
  "10034": {
    "neighborhood": "Inwood",
    "borough": "Manhattan",
    "area": "Inwood, Dyckman St north"
  },
  "10035": {
    "neighborhood": "East Harlem",
    "borough": "Manhattan",
    "area": "120th-135th, east side, Randalls Island"
  },
  "10036": {
    "neighborhood": "Hell's Kitchen",
    "borough": "Manhattan",
    "area": "Times Square, Theater District, 42nd-50th",
    "alternateNames": [
      "Times Square",
      "Theater District"
    ]
  },
  "10037": {
    "neighborhood": "Harlem",
    "borough": "Manhattan",
    "area": "130th-140th, east of Lenox"
  },
  "10038": {
    "neighborhood": "Financial District",
    "borough": "Manhattan",
    "area": "Fulton/Seaport, south of Brooklyn Bridge",
    "alternateNames": [
      "Seaport",
      "South Street Seaport"
    ]
  },
  "10039": {
    "neighborhood": "Harlem",
    "borough": "Manhattan",
    "area": "145th-155th, Bradhurst",
    "alternateNames": [
      "Bradhurst"
    ]
  },
  "10040": {
    "neighborhood": "Washington Heights",
    "borough": "Manhattan",
    "area": "Fort Tryon, Cloisters area",
    "alternateNames": [
      "Fort George",
      "Inwood south"
    ]
  },
  "10044": {
    "neighborhood": "Roosevelt Island",
    "borough": "Manhattan",
    "area": "Roosevelt Island"
  },
  "10065": {
    "neighborhood": "Upper East Side",
    "borough": "Manhattan",
    "area": "59th-68th, 5th to 3rd Ave",
    "alternateNames": [
      "Lenox Hill south"
    ]
  },
  "10069": {
    "neighborhood": "Upper West Side",
    "borough": "Manhattan",
    "area": "West End Ave, 60s-70s"
  },
  "10075": {
    "neighborhood": "Upper East Side",
    "borough": "Manhattan",
    "area": "68th-79th, 5th to 3rd Ave",
    "alternateNames": [
      "Lenox Hill",
      "Carnegie Hill south"
    ]
  },
  "10128": {
    "neighborhood": "Yorkville",
    "borough": "Manhattan",
    "area": "86th-96th, Lex to East River",
    "alternateNames": [
      "Upper East Side north",
      "Carnegie Hill"
    ]
  },
  "10155": {
    "neighborhood": "Midtown East",
    "borough": "Manhattan",
    "area": "PO Box ZIP — Midtown East commercial"
  },
  "10280": {
    "neighborhood": "Battery Park City",
    "borough": "Manhattan",
    "area": "Gateway Plaza, Rector Place"
  },
  "10282": {
    "neighborhood": "Battery Park City",
    "borough": "Manhattan",
    "area": "World Financial Center, north BPC"
  },
  "10301": {
    "neighborhood": "St. George",
    "borough": "Staten Island",
    "area": "St. George, Tompkinsville"
  },
  "10304": {
    "neighborhood": "Todt Hill",
    "borough": "Staten Island",
    "area": "Stapleton, Todt Hill east"
  },
  "10308": {
    "neighborhood": "Great Kills",
    "borough": "Staten Island",
    "area": "Great Kills"
  },
  "10310": {
    "neighborhood": "New Brighton",
    "borough": "Staten Island",
    "area": "West Brighton, New Brighton"
  },
  "10314": {
    "neighborhood": "Todt Hill",
    "borough": "Staten Island",
    "area": "Todt Hill, Castleton Corners"
  },
  "10451": {
    "neighborhood": "Mott Haven",
    "borough": "Bronx",
    "area": "Mott Haven, Hub"
  },
  "10454": {
    "neighborhood": "Mott Haven",
    "borough": "Bronx",
    "area": "Port Morris"
  },
  "10455": {
    "neighborhood": "Mott Haven",
    "borough": "Bronx",
    "area": "Longwood"
  },
  "10457": {
    "neighborhood": "Fordham",
    "borough": "Bronx",
    "area": "Tremont"
  },
  "10458": {
    "neighborhood": "Fordham",
    "borough": "Bronx",
    "area": "Belmont, Fordham"
  },
  "10461": {
    "neighborhood": "Pelham Bay",
    "borough": "Bronx",
    "area": "Morris Park"
  },
  "10462": {
    "neighborhood": "Pelham Bay",
    "borough": "Bronx",
    "area": "Parkchester"
  },
  "10463": {
    "neighborhood": "Riverdale",
    "borough": "Bronx",
    "area": "Kingsbridge, Marble Hill"
  },
  "10464": {
    "neighborhood": "Pelham Bay",
    "borough": "Bronx",
    "area": "City Island, Pelham Bay Park",
    "alternateNames": [
      "City Island"
    ]
  },
  "10465": {
    "neighborhood": "Pelham Bay",
    "borough": "Bronx",
    "area": "Throgs Neck, Country Club"
  },
  "10468": {
    "neighborhood": "Fordham",
    "borough": "Bronx",
    "area": "University Heights, Fordham Heights"
  },
  "10471": {
    "neighborhood": "Riverdale",
    "borough": "Bronx",
    "area": "Riverdale, Fieldston"
  },
  "11101": {
    "neighborhood": "Long Island City",
    "borough": "Queens",
    "area": "Court Square, Hunters Point"
  },
  "11102": {
    "neighborhood": "Astoria",
    "borough": "Queens",
    "area": "Astoria west, Hallets Point"
  },
  "11103": {
    "neighborhood": "Astoria",
    "borough": "Queens",
    "area": "Central Astoria"
  },
  "11104": {
    "neighborhood": "Sunnyside",
    "borough": "Queens",
    "area": "Sunnyside"
  },
  "11105": {
    "neighborhood": "Astoria",
    "borough": "Queens",
    "area": "Ditmars, Astoria Heights"
  },
  "11106": {
    "neighborhood": "Astoria",
    "borough": "Queens",
    "area": "Old Astoria, Ravenswood"
  },
  "11109": {
    "neighborhood": "Long Island City",
    "borough": "Queens",
    "area": "Gantry, LIC waterfront"
  },
  "11120": {
    "neighborhood": "Long Island City",
    "borough": "Queens",
    "area": "LIC PO boxes"
  },
  "11201": {
    "neighborhood": "Brooklyn Heights",
    "borough": "Brooklyn",
    "area": "Also covers DUMBO, Vinegar Hill",
    "alternateNames": [
      "DUMBO",
      "Downtown Brooklyn"
    ]
  },
  "11205": {
    "neighborhood": "Fort Greene",
    "borough": "Brooklyn",
    "area": "Also Clinton Hill west",
    "alternateNames": [
      "Clinton Hill"
    ]
  },
  "11206": {
    "neighborhood": "Bed-Stuy",
    "borough": "Brooklyn",
    "area": "Williamsburg south border"
  },
  "11211": {
    "neighborhood": "Williamsburg",
    "borough": "Brooklyn",
    "area": "South Williamsburg to N 12th"
  },
  "11215": {
    "neighborhood": "Park Slope",
    "borough": "Brooklyn",
    "area": "Prospect Park west"
  },
  "11216": {
    "neighborhood": "Bed-Stuy",
    "borough": "Brooklyn",
    "area": "Crown Heights north"
  },
  "11217": {
    "neighborhood": "Fort Greene",
    "borough": "Brooklyn",
    "area": "Prospect Heights, Boerum Hill",
    "alternateNames": [
      "Prospect Heights",
      "Boerum Hill"
    ]
  },
  "11221": {
    "neighborhood": "Bed-Stuy",
    "borough": "Brooklyn",
    "area": "Bushwick border"
  },
  "11222": {
    "neighborhood": "Greenpoint",
    "borough": "Brooklyn",
    "area": "Greenpoint"
  },
  "11231": {
    "neighborhood": "Cobble Hill",
    "borough": "Brooklyn",
    "area": "Carroll Gardens, Red Hook",
    "alternateNames": [
      "Carroll Gardens",
      "Red Hook"
    ]
  },
  "11233": {
    "neighborhood": "Bed-Stuy",
    "borough": "Brooklyn",
    "area": "Ocean Hill border"
  },
  "11238": {
    "neighborhood": "Prospect Heights",
    "borough": "Brooklyn",
    "area": "Crown Heights north",
    "alternateNames": [
      "Crown Heights"
    ]
  },
  "11249": {
    "neighborhood": "Williamsburg",
    "borough": "Brooklyn",
    "area": "Waterfront, north Williamsburg"
  },
  "11354": {
    "neighborhood": "Flushing",
    "borough": "Queens",
    "area": "Downtown Flushing"
  },
  "11355": {
    "neighborhood": "Flushing",
    "borough": "Queens",
    "area": "East Flushing"
  },
  "11358": {
    "neighborhood": "Flushing",
    "borough": "Queens",
    "area": "Auburndale, north Flushing"
  },
  "11360": {
    "neighborhood": "Bayside",
    "borough": "Queens",
    "area": "Bay Terrace"
  },
  "11361": {
    "neighborhood": "Bayside",
    "borough": "Queens",
    "area": "Bayside central"
  },
  "11364": {
    "neighborhood": "Bayside",
    "borough": "Queens",
    "area": "Oakland Gardens, Bayside Hills"
  },
  "11370": {
    "neighborhood": "Jackson Heights",
    "borough": "Queens",
    "area": "East Elmhurst"
  },
  "11372": {
    "neighborhood": "Jackson Heights",
    "borough": "Queens",
    "area": "Jackson Heights center"
  },
  "11375": {
    "neighborhood": "Forest Hills",
    "borough": "Queens",
    "area": "Forest Hills, Forest Hills Gardens"
  }
};

/** Get primary neighborhood for a ZIP code */
export function getNeighborhoodForZip(zip: string): ZipEntry | undefined {
  return NYC_ZIP_MAP[zip];
}

/** Get all ZIP codes for a given neighborhood + borough */
export function getZipsForNeighborhood(neighborhood: string, borough: string): string[] {
  return Object.entries(NYC_ZIP_MAP)
    .filter(([, v]) => v.neighborhood === neighborhood && v.borough === borough)
    .map(([zip]) => zip);
}

/** Get all ZIP codes where a neighborhood name appears (primary or alternate) */
export function getZipsForArea(name: string): string[] {
  const lower = name.toLowerCase();
  return Object.entries(NYC_ZIP_MAP)
    .filter(([, v]) =>
      v.neighborhood.toLowerCase() === lower ||
      v.alternateNames?.some(a => a.toLowerCase() === lower)
    )
    .map(([zip]) => zip);
}

/** Get all unique neighborhoods for a borough */
export function getNeighborhoodsInBorough(borough: string): string[] {
  const set = new Set<string>();
  for (const v of Object.values(NYC_ZIP_MAP)) {
    if (v.borough === borough) set.add(v.neighborhood);
  }
  return [...set].sort();
}

/** Get all boroughs */
export function getAllBoroughs(): string[] {
  const set = new Set<string>();
  for (const v of Object.values(NYC_ZIP_MAP)) set.add(v.borough);
  return [...set].sort();
}
