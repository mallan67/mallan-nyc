#!/usr/bin/env node
/**
 * build-rls-aliases.js — Map all RLS SubdivisionName variants to polygon names
 *
 * Reads:  data/rls/neighborhoods.v1.json (canonical 674 names)
 *         data/rls/geo/rls-neighborhoods.v1.geojson (81 polygon names)
 * Writes: data/rls/geo/neighborhood-aliases.json
 *
 * Strategy (in order):
 *   1. Exact match to polygon name → skip (already mapped)
 *   2. Case-insensitive exact match
 *   3. Known abbreviation code dictionary
 *   4. Manual overrides for compound names, sub-neighborhoods
 *   5. Fuzzy / substring matching
 *
 * Values can be:
 *   - string: single polygon mapping (e.g. "CHELSEA" → "Chelsea")
 *   - array:  multi-polygon mapping (e.g. "Chelsea / Flatiron" → ["Chelsea", "Flatiron"])
 *   - null:   distinct neighborhood with no polygon yet (not a wrong mapping)
 *
 * Usage: node scripts/build-rls-aliases.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANON_FILE = path.join(ROOT, 'data/rls/neighborhoods.v1.json');
const GEO_FILE = path.join(ROOT, 'data/rls/geo/rls-neighborhoods.v1.geojson');
const OUT_FILE = path.join(ROOT, 'data/rls/geo/neighborhood-aliases.json');

const canon = JSON.parse(fs.readFileSync(CANON_FILE, 'utf8'));
const geo = JSON.parse(fs.readFileSync(GEO_FILE, 'utf8'));

const polyNames = geo.features.map(f => f.properties.name);
const polySet = new Set(polyNames);

// Lowercase lookup → polygon name
const polyLower = {};
polyNames.forEach(n => { polyLower[n.toLowerCase()] = n; });

// ── ABBREVIATION CODE → polygon name ──
const ABBREV = {
  // Manhattan
  'BATTERY': 'Battery Park City',
  'BEEKMAN': null, // Beekman is distinct from Sutton Place — no polygon yet
  'CARNEGIE': 'Carnegie Hill',
  'CENTPKSTH': 'Midtown',
  'CHELSEA': 'Chelsea',
  'CLINTON': 'Hell\'s Kitchen',
  'CLINTON DUT': 'Hell\'s Kitchen',
  'COBBLEHL': 'Cobble Hill',
  'COLUMBUSCIR': 'Upper West Side',
  'EASTVILL': 'East Village',
  'EASTWILLIAMSBURG': 'Williamsburg',
  'EHARLEM': 'East Harlem',
  'FASHCNTR': 'Midtown',
  'FINLDIST': 'Financial District',
  'FLATIRON': 'Flatiron',
  'HAMHGTS': 'Hamilton Heights',
  'HARLEM': 'Harlem',
  'HDBH': 'Downtown Brooklyn',
  'HIGHBRIDGE': 'Kingsbridge',
  'HUDHGTS': 'Washington Heights',
  'INWOOD': 'Inwood',
  'ITALCHIN': 'Chinatown',
  'JACOBJAV': 'Hell\'s Kitchen',
  'KIPSBAY': 'Kips Bay',
  'KIPS': 'Kips Bay',
  'LINCOLN': 'Upper West Side',
  'LOEAST': 'Lower East Side',
  'MADISON': 'Midtown East',
  'MIDTOWN': 'Midtown',
  'MORNHGTS': 'Morningside Heights',
  'MURRAY': 'Murray Hill',
  'MSPH': 'Morningside Heights',
  'MV': 'Upper West Side',
  'NOHO': 'NoHo',
  'NOMAD': 'NoMad',
  'SOHO': 'SoHo',
  'SOUTHSTSEAPORT': 'Financial District',
  'SPUYTENDUYVIL': 'Spuyten Duyvil',
  'STUYHEI': null, // Stuyvesant Heights is distinct — no polygon yet
  'SUTTON': 'Sutton Place',
  'TRIBECA': 'Tribeca',
  'TURTLBAY': 'Turtle Bay',
  'UES': 'Upper East Side',
  'UPEAST': 'Upper East Side',
  'UPPER EAST SIDE': 'Upper East Side',
  'UWS': 'Upper West Side',
  'UPWEST': 'Upper West Side',
  'UPPER WEST SIDE': 'Upper West Side',
  'WASHHGTS': 'Washington Heights',
  'WESTVILL': 'West Village',
  'RI': 'Roosevelt Island',

  // Brooklyn
  'BATHBEAC': 'Downtown Brooklyn',
  'BAYRIDGE': 'Downtown Brooklyn',
  'BED-STUY': null, // Bed-Stuy is distinct from Prospect Heights — no polygon yet
  'BENHURST': 'Downtown Brooklyn',
  'BERGENBEACH': 'Downtown Brooklyn',
  'BKLYNHTS': 'Brooklyn Heights',
  'BOERUMHL': 'Boerum Hill',
  'BOROPARK': 'Downtown Brooklyn',
  'BRIGHTON': 'Downtown Brooklyn',
  'BROOKLYN': 'Downtown Brooklyn',
  'BROWVIL': 'Prospect Heights',
  'BUSK': 'Williamsburg',
  'CANARSIE': 'Downtown Brooklyn',
  'CARLGDNS': 'Carroll Gardens',
  'CITYLINE': 'Downtown Brooklyn',
  'CLINTHL': 'Fort Greene',
  'COLUMBIASTWATERFRONT': 'Carroll Gardens',
  'CONEYISL': 'Downtown Brooklyn',
  'CROWNHEI': 'Prospect Heights',
  'CYPRESS': 'Downtown Brooklyn',
  'DITMASPK': 'Windsor Terrace',
  'DTWNBKYN': 'Downtown Brooklyn',
  'DYKERSHT': 'Downtown Brooklyn',
  'EFLATBUS': 'Downtown Brooklyn',
  'ENY': 'Downtown Brooklyn',
  'FLATBUSH': 'Downtown Brooklyn',
  'FLATLAND': 'Downtown Brooklyn',
  'FORTGRNE': 'Fort Greene',
  'GRAVESND': 'Downtown Brooklyn',
  'GREENPT': 'Greenpoint',
  'GREENWD': 'South Slope',
  'HOMECRE': 'Downtown Brooklyn',
  'KENSINGT': 'Windsor Terrace',
  'MANBEACH': 'Downtown Brooklyn',
  'MAPLETON': 'Downtown Brooklyn',
  'MIDWOOD': 'Downtown Brooklyn',
  'MILLBAS': 'Downtown Brooklyn',
  'NEW UTRECHT': 'Downtown Brooklyn',
  'OCEANHIL': 'Prospect Heights',
  'PARKSLOP': 'Park Slope',
  'PROSHEI': 'Prospect Heights',
  'PROSLEFR': 'Prospect Heights',
  'PROSPARK': 'Park Slope',
  'RED HOOK': 'Red Hook',
  'REDHOOK': 'Red Hook',
  'REMSEN': 'Downtown Brooklyn',
  'SEAGATE': 'Downtown Brooklyn',
  'SHEEPBAY': 'Downtown Brooklyn',
  'SUNSETPK': 'South Slope',
  'WILLIAMS': 'Williamsburg',
  'WINDTERR': 'Windsor Terrace',

  // Queens
  'ASTORIA': 'Astoria',
  'BAYSIDE': 'Bayside',
  'BLHARBOR': 'Bayside',
  'FLPK': 'Flushing',
  'FORHILLS': 'Forest Hills',
  'FLUSHING': 'Flushing',
  'FORDHAM': 'Fordham',
  'JKHTS': 'Jackson Heights',
  'JMCA': 'Jackson Heights',
  'JMCAH': 'Jackson Heights',
  'KGARDENS': 'Forest Hills',
  'LNGCTY': 'Long Island City',
  'QUEENS': 'Flushing',
  'RGWD': 'Astoria',
  'SUNNYSIDE': 'Sunnyside',

  // Bronx
  'ALLERTON': 'Fordham',
  'BAYCHESTER': 'Pelham Bay',
  'BEDFORDPARK': 'Fordham',
  'BRONXOTHER': 'Mott Haven',
  'CLASONPOINT': 'Mott Haven',
  'CONCOURSE': 'Mott Haven',
  'CROTONAPARKEAST': 'Mott Haven',
  'FIELDSTON': 'Riverdale',
  'FHAMIL': 'Downtown Brooklyn',
  'GRANDCONCOURSE': 'Mott Haven',
  'GRENVILL': 'Mott Haven',
  'KINGSBRIDGE': 'Kingsbridge',
  'LONGWOOD': 'Mott Haven',
  'MELROSE': 'Mott Haven',
  'MOTTHAVEN': 'Mott Haven',
  'NORTHEAST BRONX': 'Pelham Bay',
  'NORTHWEST BRONX': 'Kingsbridge',
  'NORTH RIVERDALE': 'Riverdale',
  'OLINVILLE': 'Fordham',
  'PARKCHESTER': 'Pelham Bay',
  'SOUTHEAST BRONX': 'Mott Haven',
  'THROGSNECK': 'Pelham Bay',
  'TREMONT': 'Fordham',
  'WAKEFIELD': 'Pelham Bay',
  'WESTFARMS': 'Mott Haven',
  'WILLIAMSBRIDGE': 'Fordham',
  'ZEREGA': 'Pelham Bay',

  // Staten Island
  'ELTINGVILLE': 'Great Kills',
  'RICHMONDTOWN': 'Dongan Hills',
  'ROSEBANK': 'St. George',
  'STATEN ISLAND': 'St. George',
  'STATEN ISLAND (OTHER)': 'St. George',
};

// ── MANUAL OVERRIDES for full-text variants ──
const MANUAL = {
  // Manhattan variants
  'All Midtown': 'Midtown',
  'Alphabet City': 'East Village',
  'Battery Park': 'Battery Park City',
  'Beekman': null, // Beekman is distinct — small area near Beekman Place
  'Beekman Place': null, // distinct from Sutton Place
  'Beekman/Sutton Place': ['Sutton Place'], // combined — Beekman has no polygon, Sutton does
  'Bowery': 'Lower East Side',
  'Bryant Park': 'Midtown',
  'Central Harlem': 'Harlem',
  'Central Park South': 'Midtown',
  'Central Park West': 'Upper West Side',
  'Chelsea / Flatiron': ['Chelsea', 'Flatiron'],
  'Chelsea/Flatiron': ['Chelsea', 'Flatiron'],
  'Chinatown / Little I': ['Chinatown', 'Little Italy'],
  'Chinatown Little Ita': ['Chinatown', 'Little Italy'],
  'Clinton': 'Hell\'s Kitchen',
  'Clinton / Hell\'s Kit': 'Hell\'s Kitchen',
  'Columbia Presb': 'Washington Heights',
  'Columbia St Waterfr': 'Carroll Gardens',
  'Columbia St Waterfr.': 'Carroll Gardens',
  'Columbia St Waterfro': 'Carroll Gardens',
  'Columbia St Waterfront District': 'Carroll Gardens',
  'Columbia St. Waterfront': 'Carroll Gardens',
  'Columbia Street WD': 'Carroll Gardens',
  'Columbia Street Wat': 'Carroll Gardens',
  'Columbia Street Wate': 'Carroll Gardens',
  'Columbia Street Waterfront': 'Carroll Gardens',
  'Columbia Street Waterfront District': 'Carroll Gardens',
  'Columbia Waterfront': 'Carroll Gardens',
  'E. Greenwich Village': 'Greenwich Village',
  'Fashion District': 'Midtown',
  'Financial District (': 'Financial District',
  'Flatiron District': 'Flatiron',
  'Fulton Ferry': 'DUMBO',
  'Fulton/Seaport': 'Financial District',
  'Garment District': 'Midtown',
  'Greenwich Village/We': ['Greenwich Village', 'West Village'],
  'Greenwich Village/West Village': ['Greenwich Village', 'West Village'],
  'Grenwich Village': 'Greenwich Village',
  'Harlem / Morningside': ['Harlem', 'Morningside Heights'],
  'Hells Kitchen': 'Hell\'s Kitchen',
  'Inwood / Washington': ['Inwood', 'Washington Heights'],
  'Inwood/Marble Hill': ['Inwood', 'Marble Hill'],
  'Koreatown': 'Midtown',
  'Lenox Hill-Roosevelt': ['Lenox Hill', 'Roosevelt Island'],
  'Lenox Hill-Roosevelt Island': ['Lenox Hill', 'Roosevelt Island'],
  'Lenox Hill-roosevelt Island': ['Lenox Hill', 'Roosevelt Island'],
  'Lincoln Center': 'Upper West Side',
  'Lincoln Sq': 'Upper West Side',
  'Lincoln Square': 'Upper West Side',
  'lincoln square': 'Upper West Side',
  'Lower East Side/Chin': ['Lower East Side', 'Chinatown'],
  'Lower East Side/Chinatown': ['Lower East Side', 'Chinatown'],
  'Lower Eastside': 'Lower East Side',
  'Lower Manhattan': 'Financial District',
  'Manhattan': 'Midtown',
  'Manhattan Avenue': 'Upper West Side',
  'Manhattan Valley': 'Upper West Side',
  'Meatpacking': 'West Village',
  'Meatpacking District': 'West Village',
  'Middle East Side': 'Midtown East',
  'Middle West Side': 'Midtown West',
  'Midtown Center': 'Midtown',
  'Midtown Central': 'Midtown',
  'Midtown South': 'Midtown',
  'Midtown West / Hell\'': 'Midtown West',
  'midtown': 'Midtown',
  'Murray Hill / Kip\'s': ['Murray Hill', 'Kips Bay'],
  'Murray Hill / Kips B': ['Murray Hill', 'Kips Bay'],
  'Murray Hill Kips Bay': ['Murray Hill', 'Kips Bay'],
  'Murray Hill-kips Bay': ['Murray Hill', 'Kips Bay'],
  'Navy Yard': 'Fort Greene',
  'NoLIta': 'Nolita',
  'NoLita': 'Nolita',
  'Noho': 'NoHo',
  'Noho/Central Village': 'NoHo',
  'Nomad': 'NoMad',
  'Rose Hill': 'Flatiron',
  'Seaport': 'Financial District',
  'Seaport District': 'Financial District',
  'SoHo-Nolita': ['SoHo', 'Nolita'],
  'SoHo/Nolita': ['SoHo', 'Nolita'],
  'Soho': 'SoHo',
  'South Harlem': 'Harlem',
  'South Street Seaport': 'Financial District',
  'South Village': 'Greenwich Village',
  'Stuyvesant': 'Stuyvesant Town',
  'Stuyvesant Heights': 'Prospect Heights',
  'Sutton': 'Sutton Place',
  'Sutton Area': 'Sutton Place',
  'Theater District': 'Midtown West',
  'Times Square Theatre': 'Midtown West',
  'TriBeCa': 'Tribeca',
  'Tudor City': 'Turtle Bay',
  'Turtle Bay-East Midtown': 'Turtle Bay',
  'Union Square Park': 'Union Square',
  'University Heights': 'Kingsbridge',
  'Upper Carnegie': 'Carnegie Hill',
  'Upper Carnegie Hill': 'Carnegie Hill',
  'Upper Fifth': null, // Upper Fifth (Fifth Ave along Central Park) — distinct from UES
  'Upper M': null, // Upper Manhattan — too broad, not a single neighborhood
  'Upper West Sidee': 'Upper West Side',
  'W. Greenwich Village': 'West Village',
  'West 30\'s': 'Midtown West',
  'West 30s - Clinton': 'Midtown West',
  'West Harlem & Manhat': ['West Harlem', 'Manhattanville'],
  'West Harlem & Manhattanville': ['West Harlem', 'Manhattanville'],
  'West Village / Green': ['West Village', 'Greenwich Village'],
  'Fort George': 'Washington Heights',
  'MANHATTAN': 'Midtown',

  // Brooklyn variants
  'Bath Beach': 'Downtown Brooklyn',
  'Bay Ridge': 'Downtown Brooklyn',
  'Bay Terrace': 'Downtown Brooklyn',
  'Bay Terrace 1': 'Downtown Brooklyn',
  'Bed Stuy': null, // Bed-Stuy is distinct from Prospect Heights — no polygon yet
  'Bedford': null, // Bedford/Bed-Stuy is distinct
  'Bedford - Stuyvesant': null, // distinct neighborhood
  'Bedford Park': 'Fordham',
  'Bedford Stuyvesant': null, // Bed-Stuy is distinct
  'Bedford-Stuyvesant': null, // Bed-Stuy is distinct
  'Bedford/Stuyvesant': null, // Bed-Stuy is distinct
  'Bensonhurst': 'Downtown Brooklyn',
  'Bergen Beach': 'Downtown Brooklyn',
  'Beverley Square West': 'Windsor Terrace',
  'Boerum': 'Boerum Hill',
  'Borough Park': 'Downtown Brooklyn',
  'Brighton Beach': 'Downtown Brooklyn',
  'Broad Channel': 'Bayside',
  'Broadway Junction': 'Downtown Brooklyn',
  'Brooklyn': 'Downtown Brooklyn',
  'Brownsville': 'Downtown Brooklyn',
  'Bushwick': 'Williamsburg',
  'Bushwick South': 'Williamsburg',
  'Canarsie': 'Downtown Brooklyn',
  'Caton Park': 'Windsor Terrace',
  'City Line': 'Downtown Brooklyn',
  'Clinton Hill': 'Fort Greene',
  'Clinton Hill/Ft Gree': ['Fort Greene'], // Clinton Hill has no polygon yet
  'Cobble Hill': 'Cobble Hill',
  'Coney Island': 'Downtown Brooklyn',
  'Crown Heights': null, // Crown Heights is distinct from Prospect Heights
  'Crown Heights North': null, // distinct
  'Cypress Hills': 'Downtown Brooklyn',
  'DNU-Brooklyn': 'Downtown Brooklyn',
  'DUMBO / Vinegar Hill': ['DUMBO'],
  'DUMBO-Vinegar Hill-Downtown Brooklyn-Boerum Hill': ['DUMBO', 'Downtown Brooklyn', 'Boerum Hill'],
  'Ditmars Park': 'Astoria',
  'Ditmars Steinway': 'Astoria',
  'Ditmars-Steinway': 'Astoria',
  'Ditmas Park': 'Windsor Terrace',
  'Ditmas Park West': 'Windsor Terrace',
  'Ditmas park': 'Windsor Terrace',
  'Downtown Bklyn': 'Downtown Brooklyn',
  'Dumbo': 'DUMBO',
  'Dumbo - Vinegar Hill': 'DUMBO',
  'Dyker Heights': 'Downtown Brooklyn',
  'East Flatbush': 'Downtown Brooklyn',
  'East Flatbush-Farragut': 'Downtown Brooklyn',
  'East Midwood': 'Downtown Brooklyn',
  'East New York': 'Downtown Brooklyn',
  'East Williamsburg': 'Williamsburg',
  'Erasmus': 'Downtown Brooklyn',
  'Farragut': 'Downtown Brooklyn',
  'Fiske Terrace': 'Downtown Brooklyn',
  'Flatbush': 'Downtown Brooklyn',
  'Flatlands': 'Downtown Brooklyn',
  'Fort Hamilton': 'Downtown Brooklyn',
  'Ft. Greene': 'Fort Greene',
  'Georgetown': 'Downtown Brooklyn',
  'Gerritsen Beach': 'Downtown Brooklyn',
  'Gravesend': 'Downtown Brooklyn',
  'Green Point': 'Greenpoint',
  'Greenwood': 'South Slope',
  'Greenwood Heights': 'South Slope',
  'Highland Park': 'Downtown Brooklyn',
  'Homecrest': 'Downtown Brooklyn',
  'Kensington': 'Windsor Terrace',
  'Kensington / Ocean Pkwy': ['Windsor Terrace'],
  'Kensington and Parkv': 'Windsor Terrace',
  'Kensingtn/Ocean Pkwy': ['Windsor Terrace'],
  'Kings Club District': 'Downtown Brooklyn',
  'Lefferts': 'Prospect Heights',
  'Lefferts Garden': 'Prospect Heights',
  'Lefferts Gardens': 'Prospect Heights',
  'Manhattan Beach': 'Downtown Brooklyn',
  'Mapleton': 'Downtown Brooklyn',
  'Marine Park': 'Downtown Brooklyn',
  'Marine Park/Mill Basin': 'Downtown Brooklyn',
  'Marine Pk/Mill Basin': 'Downtown Brooklyn',
  'Midwood': 'Downtown Brooklyn',
  'Midwood Park': 'Downtown Brooklyn',
  'Mill Basin': 'Downtown Brooklyn',
  'New Lots': 'Downtown Brooklyn',
  'North Side-south Side': 'Williamsburg',
  'North Slope': 'Park Slope',
  'Northeast Flatbush': 'Downtown Brooklyn',
  'Ocean Hill': 'Prospect Heights',
  'Ocean Hill Brownsvil': 'Prospect Heights',
  'Ocean Hill Brownsville': 'Prospect Heights',
  'Ocean Parkway': 'Windsor Terrace',
  'Ocean Parkway South': 'Windsor Terrace',
  'Old Mill Basin': 'Downtown Brooklyn',
  'Pacific Park': 'Prospect Heights',
  'Paerdegat Basin': 'Downtown Brooklyn',
  'Park Hill': 'Downtown Brooklyn',
  'Park Slope South': 'Park Slope',
  'Park Slope-gowanus': 'Park Slope',
  'Park Slope/Prospect': ['Park Slope'],
  'Park Slope/Prospect Park': ['Park Slope'],
  'Prospect - Lefferts': 'Prospect Heights',
  'Prospect Hights': 'Prospect Heights',
  'Prospect Leffert Gdn': 'Prospect Heights',
  'Prospect Lefferts': 'Prospect Heights',
  'Prospect Lefferts G': 'Prospect Heights',
  'Prospect Lefferts Ga': 'Prospect Heights',
  'Prospect Lefferts Gardens': 'Prospect Heights',
  'Prospect Lefferts Gardens-Wingate': 'Prospect Heights',
  'Prospect Park': 'Park Slope',
  'Prospect Park So.': 'Windsor Terrace',
  'Prospect Park South': 'Windsor Terrace',
  'Prospect-Lefferts G': 'Prospect Heights',
  'Ramsen Village': 'Downtown Brooklyn',
  'Redhook': 'Red Hook',
  'Remsen Village': 'Downtown Brooklyn',
  'Ridgewood': 'Williamsburg',
  'Sea Gate': 'Downtown Brooklyn',
  'Seagate': 'Downtown Brooklyn',
  'Sheephead Bay': 'Downtown Brooklyn',
  'Sheepshead Bay': 'Downtown Brooklyn',
  'South Marlboro': 'Downtown Brooklyn',
  'South Midwood': 'Downtown Brooklyn',
  'South Williamsburg': 'Williamsburg',
  'Spring Creek': 'Downtown Brooklyn',
  'Starrett City': 'Downtown Brooklyn',
  'Sunset Park': 'South Slope',
  'Vinegar Hill': 'DUMBO',
  'Weeksville': 'Prospect Heights',
  'West Midwood': 'Downtown Brooklyn',
  'Williamsburg N Side': 'Williamsburg',
  'Williamsburg S Side': 'Williamsburg',
  'Williamsburg,North': 'Williamsburg',
  'Williamsburg,South': 'Williamsburg',
  'Windor Terrace': 'Windsor Terrace',
  'Wingate': 'Prospect Heights',
  'FHAMIL': 'Downtown Brooklyn',

  // Queens variants
  'Astoria Heights': 'Astoria',
  'Auburndale': 'Flushing',
  'Bayswater': 'Bayside',
  'Beechurst': 'Bayside',
  'Bellaire': 'Bayside',
  'Belle Harbor': 'Bayside',
  'Bellerose': 'Bayside',
  'Birchwood Towers': 'Flushing',
  'Blissville': 'Long Island City',
  'Bowne Park': 'Flushing',
  'Breezy Point': 'Bayside',
  'Briarwood': 'Forest Hills',
  'Brickwood Towers': 'Flushing',
  'Brookville': 'Bayside',
  'Cambria Heights': 'Bayside',
  'Clearview': 'Bayside',
  'College Point': 'Flushing',
  'Corona': 'Jackson Heights',
  'Court Square': 'Long Island City',
  'Douglaston': 'Bayside',
  'East Elmhurst': 'Jackson Heights',
  'East Flushing': 'Flushing',
  'Elmhurst': 'Jackson Heights',
  'Far Rockaway': 'Bayside',
  'Flushing Heights': 'Flushing',
  'Forest Hills Garden': 'Forest Hills',
  'Forest Hills Gardens': 'Forest Hills',
  'Forest Hills Ward': 'Forest Hills',
  'Forest Park': 'Forest Hills',
  'Fresh Meadows': 'Flushing',
  'Glen Oaks': 'Bayside',
  'Glendale': 'Forest Hills',
  'Hammels': 'Bayside',
  'Hillcrest': 'Flushing',
  'Hollis': 'Bayside',
  'Hollis Hills': 'Bayside',
  'Holliswood': 'Bayside',
  'Howard Beach': 'Bayside',
  'Howard Beach 1': 'Bayside',
  'Hunters Point': 'Long Island City',
  'Hunters Point-Sunnyside-West Maspeth': ['Long Island City', 'Sunnyside'],
  'Hunters Point-sunnyside-west Maspeth': ['Long Island City', 'Sunnyside'],
  'Jackson heights': 'Jackson Heights',
  'Jamaica': 'Bayside',
  'Jamaica Center': 'Bayside',
  'Jamaica Estate': 'Bayside',
  'Jamaica Estates': 'Bayside',
  'Jamaica Hills': 'Bayside',
  'Kew Garden Hills': 'Forest Hills',
  'Kew Gardens': 'Forest Hills',
  'Kew Gardens Hills': 'Forest Hills',
  'Laurelton': 'Bayside',
  'Lindenwood': 'Bayside',
  'Little Neck': 'Bayside',
  'Malba': 'Flushing',
  'Maspeth': 'Sunnyside',
  'Middle Village': 'Forest Hills',
  'Murray Hill (QNS)': 'Flushing',
  'Neponsit': 'Bayside',
  'North Corona': 'Jackson Heights',
  'Oakland Gardens': 'Bayside',
  'Old Howard Beach': 'Bayside',
  'Ozone Park': 'Bayside',
  'Pomonok': 'Flushing',
  'Queens': 'Flushing',
  'Queens Village': 'Bayside',
  'Queensboro Hill': 'Flushing',
  'Rego Park': 'Forest Hills',
  'Richmond Hill': 'Bayside',
  'Richmond Hills': 'Bayside',
  'Rochdale': 'Bayside',
  'Rosedale': 'Bayside',
  'Saint Albans': 'Bayside',
  'Seaside': 'Bayside',
  'South Jamaica': 'Bayside',
  'South Ozone Park': 'Bayside',
  'South Richmond Hill': 'Bayside',
  'Springfield Garden': 'Bayside',
  'Springfield Gardens': 'Bayside',
  'St Albans': 'Bayside',
  'St. Albans': 'Bayside',
  'Steinway-Ditmars': 'Astoria',
  'Sunnyside Gardens': 'Sunnyside',
  'The Rockaways': 'Bayside',
  'Utopia': 'Flushing',
  'Whitestone': 'Flushing',
  'Woodhaven': 'Forest Hills',
  'Woodside': 'Sunnyside',
  'Edgemere': 'Bayside',
  'Arverne': 'Bayside',
  'Far Rockaway': 'Bayside',

  // Bronx variants
  'Allerton': 'Fordham',
  'Baychester': 'Pelham Bay',
  'Belmont': 'Fordham',
  'Belmont | Little Ita': ['Fordham'], // Bronx Little Italy / Belmont area
  'Belmont | Little Italy': ['Fordham'], // Bronx Little Italy / Belmont area
  'Bronx': 'Mott Haven',
  'Bronx (Other)': 'Mott Haven',
  'Bronxdale': 'Fordham',
  'Bronxwood': 'Fordham',
  'Castle Hill': 'Pelham Bay',
  'Claremont': 'Mott Haven',
  'Claremont Village': 'Mott Haven',
  'Clason Point': 'Mott Haven',
  'Concourse': 'Mott Haven',
  'Concourse Village': 'Mott Haven',
  'Country Club': 'Pelham Bay',
  'Crotona Park': 'Mott Haven',
  'Crotona Park East': 'Mott Haven',
  'East Morrisania': 'Mott Haven',
  'East Tremont': 'Fordham',
  'Eastchester': 'Pelham Bay',
  'Edenwald': 'Pelham Bay',
  'Fieldston': 'Riverdale',
  'Fordham Heights': 'Fordham',
  'Fordham Manor': 'Fordham',
  'High Bridge': 'Kingsbridge',
  'Highbridge': 'Kingsbridge',
  'Hunts Point': 'Mott Haven',
  'Kingsbridge Heights': 'Kingsbridge',
  'Laconia': 'Pelham Bay',
  'Longwood': 'Mott Haven',
  'Melrose': 'Mott Haven',
  'Morris Heights': 'Kingsbridge',
  'Morris Park': 'Pelham Bay',
  'Morrisania': 'Mott Haven',
  'Mount Eden': 'Mott Haven',
  'Mount Hope': 'Fordham',
  'Mt. Morris Park': 'Harlem',
  'North Riverdale': 'Riverdale',
  'Central Riverdale': 'Riverdale',
  'Olinville': 'Fordham',
  'Parkchester': 'Pelham Bay',
  'Pelham Gardens': 'Pelham Bay',
  'Pelham Parkway': 'Pelham Bay',
  'Port Morris': 'Mott Haven',
  'Schuylerville': 'Pelham Bay',
  'Soundview': 'Pelham Bay',
  'The Bronx': 'Mott Haven',
  'The Bronx (Other)': 'Mott Haven',
  'Throggs Neck': 'Pelham Bay',
  'Throgs Neck': 'Pelham Bay',
  'Throgs Neck - Edgewa': 'Pelham Bay',
  'Tremont': 'Fordham',
  'Unionport': 'Pelham Bay',
  'Van Nest': 'Pelham Bay',
  'Wakefield': 'Pelham Bay',
  'West Farms': 'Mott Haven',
  'Westchester Square': 'Pelham Bay',
  'Westchester Village': 'Pelham Bay',
  'Williamsbridge': 'Fordham',
  'Woodlawn': 'Riverdale',
  'Woodlawn Heights': 'Riverdale',

  // Staten Island variants
  'Annadale': 'Great Kills',
  'Arden Heights': 'Great Kills',
  'Arrochar': 'Dongan Hills',
  'Bull\'s Head': 'Dongan Hills',
  'Bulls Head': 'Dongan Hills',
  'Castleton Corners': 'St. George',
  'Charleston': 'Great Kills',
  'Concord': 'Dongan Hills',
  'Elm Park': 'St. George',
  'Eltingville': 'Great Kills',
  'Fresh Kills': 'Great Kills',
  'Grant City': 'Dongan Hills',
  'Graniteville': 'St. George',
  'Grasmere': 'Dongan Hills',
  'Greenridge': 'Great Kills',
  'Grymes Hill': 'St. George',
  'Heartland Village': 'Dongan Hills',
  'Huguenot': 'Great Kills',
  'Manor Heights': 'Dongan Hills',
  'Mariner\'s Harbor': 'St. George',
  'Mariners Harbor': 'St. George',
  'Midland Beach': 'South Beach',
  'New Dorp': 'Dongan Hills',
  'New Dorp Beach': 'Dongan Hills',
  'New Springville': 'Dongan Hills',
  'Oakwood': 'Great Kills',
  'Oakwood Heights': 'Great Kills',
  'Pleasant Plains': 'Great Kills',
  'Port Richmond': 'St. George',
  'Prince\'s Bay': 'Great Kills',
  'Randall Manor': 'St. George',
  'Richmond Town': 'Dongan Hills',
  'Richmond Valley': 'Great Kills',
  'Richmondtown': 'Dongan Hills',
  'Rosebank': 'St. George',
  'Rossville': 'Great Kills',
  'Saint George': 'St. George',
  'Shore Acres': 'St. George',
  'Silver Lake': 'St. George',
  'Stapleton': 'St. George',
  'Stapleton Heights': 'St. George',
  'Staten Island': 'St. George',
  'Tompkinsville': 'St. George',
  'Tottenville': 'Great Kills',
  'Travis': 'Great Kills',
  'Ward Hill': 'St. George',
  'West Brighton': 'St. George',
  'West New Brighton': 'St. George',
  'Westerleigh': 'St. George',
  'Willowbrook': 'Dongan Hills',
  'Woodrow': 'Great Kills',
};

// ── NULL NEIGHBORHOOD CLASSIFICATIONS ──
// Every null alias MUST have a classification entry here.
// Types: "subarea" (sub-part of a recognized area), "micro-area" (very small/niche),
//        "unbounded" (recognized area, no polygon yet — too broad or future expansion)
// parentPolygons: polygon names that geographically overlap or contain this area (empty [] if none)
const NULL_CLASSIFICATIONS = {
  // Bedford-Stuyvesant family — major Brooklyn neighborhood, no polygon yet
  'BED-STUY':              { type: 'unbounded', parentPolygons: [] },
  'Bed Stuy':              { type: 'unbounded', parentPolygons: [] },
  'Bedford':               { type: 'unbounded', parentPolygons: [] },
  'Bedford - Stuyvesant':  { type: 'unbounded', parentPolygons: [] },
  'Bedford Stuyvesant':    { type: 'unbounded', parentPolygons: [] },
  'Bedford-Stuyvesant':    { type: 'unbounded', parentPolygons: [] },
  'Bedford/Stuyvesant':    { type: 'unbounded', parentPolygons: [] },

  // Beekman — micro-area in east Midtown Manhattan
  'BEEKMAN':               { type: 'micro-area', parentPolygons: ['Turtle Bay'] },
  'Beekman':               { type: 'micro-area', parentPolygons: ['Turtle Bay'] },
  'Beekman Place':         { type: 'micro-area', parentPolygons: ['Sutton Place', 'Turtle Bay'] },

  // Crown Heights — major Brooklyn neighborhood, no polygon yet
  'Crown Heights':         { type: 'unbounded', parentPolygons: [] },
  'Crown Heights North':   { type: 'subarea',   parentPolygons: [] },

  // Stuyvesant Heights — small Brooklyn area near Bed-Stuy
  'STUYHEI':               { type: 'micro-area', parentPolygons: [] },

  // Upper Fifth — micro-area along Fifth Ave / Central Park
  'Upper Fifth':           { type: 'micro-area', parentPolygons: ['Upper East Side'] },

  // Upper Manhattan — too broad, spans multiple neighborhoods
  'Upper M':               { type: 'unbounded',  parentPolygons: ['Washington Heights', 'Hamilton Heights', 'Inwood'] },
};

// ── BUILD ALIAS MAP ──
// Values: string (single polygon), string[] (multi-polygon), null (distinct, no polygon)

const aliases = {};
let matched = 0;
let unmatched = 0;
let multiMapped = 0;
let distinctNoPolygon = 0;

for (const entry of canon.neighborhoods) {
  const name = entry.name;

  // Skip if already a polygon name
  if (polySet.has(name)) continue;

  // 1. Case-insensitive exact match
  const lower = name.toLowerCase();
  if (polyLower[lower]) {
    aliases[name] = polyLower[lower];
    matched++;
    continue;
  }

  // 2. Abbreviation code lookup
  if (name in ABBREV) {
    const val = ABBREV[name];
    if (val === null) {
      aliases[name] = null;
      distinctNoPolygon++;
    } else {
      aliases[name] = val;
      matched++;
    }
    continue;
  }

  // 3. Manual override (string, array, or null)
  if (name in MANUAL) {
    const val = MANUAL[name];
    if (val === null) {
      aliases[name] = null;
      distinctNoPolygon++;
    } else if (Array.isArray(val)) {
      // Filter to only polygons that actually exist
      const validPolys = val.filter(p => polySet.has(p));
      if (validPolys.length === 0) {
        aliases[name] = null;
        distinctNoPolygon++;
      } else if (validPolys.length === 1) {
        aliases[name] = validPolys[0];
        matched++;
      } else {
        aliases[name] = validPolys;
        multiMapped++;
      }
    } else {
      aliases[name] = val;
      matched++;
    }
    continue;
  }

  // 4. Fuzzy: strip special chars and try lowercase match
  const stripped = name.replace(/[^a-zA-Z ]/g, '').toLowerCase().trim();
  if (polyLower[stripped]) {
    aliases[name] = polyLower[stripped];
    matched++;
    continue;
  }

  // 5. Contains match — if a polygon name is contained in the variant
  let found = false;
  for (const pn of polyNames) {
    if (lower.includes(pn.toLowerCase()) && pn.length >= 5) {
      aliases[name] = pn;
      matched++;
      found = true;
      break;
    }
  }
  if (found) continue;

  // 6. Reverse contains — if variant is contained in a polygon name
  for (const pn of polyNames) {
    if (pn.toLowerCase().includes(lower) && lower.length >= 5) {
      aliases[name] = pn;
      matched++;
      found = true;
      break;
    }
  }
  if (found) continue;

  // Unmatched — log it
  aliases[name] = null;
  unmatched++;
  console.log('  [UNMATCH] ' + name + ' (' + (entry.boroughHint || entry.borough || '?') + ')');
}

// ── Build classifications for null aliases ──
const classifications = {};
let missingClassifications = [];

for (const [name, val] of Object.entries(aliases)) {
  if (val !== null) continue; // only classify nulls
  if (NULL_CLASSIFICATIONS[name]) {
    const cls = NULL_CLASSIFICATIONS[name];
    // Validate parentPolygons reference real polygon names
    const badParents = cls.parentPolygons.filter(p => !polySet.has(p));
    if (badParents.length > 0) {
      console.log('  [WARN] ' + name + ' has invalid parentPolygons: ' + badParents.join(', '));
    }
    classifications[name] = {
      type: cls.type,
      parentPolygons: cls.parentPolygons,
      hasPolygon: false,
    };
  } else {
    missingClassifications.push(name);
  }
}

if (missingClassifications.length > 0) {
  console.log('\n[ERROR] ' + missingClassifications.length + ' null aliases missing classification:');
  missingClassifications.forEach(n => console.log('  - ' + n));
  console.log('Add entries to NULL_CLASSIFICATIONS in build-rls-aliases.js');
  process.exit(1);
}

// Write output
const output = {
  _meta: {
    version: 3,
    description: 'Maps RLS SubdivisionName variants to polygon names. Values: string (single), array (multi-polygon), null (distinct, no polygon yet). Classifications required for all nulls.',
    totalAliases: Object.keys(aliases).length,
    matched: matched,
    multiMapped: multiMapped,
    distinctNoPolygon: distinctNoPolygon,
    classified: Object.keys(classifications).length,
    unmatched: unmatched,
    generatedAt: new Date().toISOString(),
  },
  aliases: aliases,
  classifications: classifications,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

console.log('\n=== Alias Map Built (v3) ===');
console.log('Total aliases:        ' + Object.keys(aliases).length);
console.log('Matched (single):     ' + matched);
console.log('Multi-mapped (array): ' + multiMapped);
console.log('Distinct (no polygon):' + distinctNoPolygon);
console.log('Classified (null):    ' + Object.keys(classifications).length);
console.log('Unmatched:            ' + unmatched);
console.log('Output:               ' + OUT_FILE);
