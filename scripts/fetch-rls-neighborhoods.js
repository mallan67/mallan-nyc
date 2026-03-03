#!/usr/bin/env node
/**
 * fetch-rls-neighborhoods.js — Fetch distinct neighborhood values from Trestle RLS
 *
 * Queries the Trestle OData API for distinct values of the configured neighborhood
 * field (default: SubdivisionName, configurable via RLS_NEIGHBOR_FIELD env var).
 *
 * Writes: data/rls/neighborhoods.v1.json (trestleVerified: true)
 *
 * Required env:
 *   IDX_CLIENT_ID, IDX_CLIENT_SECRET, TRESTLE_API_URL
 * Optional env:
 *   RLS_NEIGHBOR_FIELD  — OData field to group by (default: SubdivisionName)
 *
 * Usage: node scripts/fetch-rls-neighborhoods.js
 *   or:  npm run geo:fetch-names
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.resolve(__dirname, '..', 'data', 'rls', 'neighborhoods.v1.json');
const NEIGHBOR_FIELD = process.env.RLS_NEIGHBOR_FIELD || 'SubdivisionName';

// ── OAuth2 client_credentials (mirrors lib/idx/auth.ts) ──

const TRESTLE_BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const TOKEN_URL = TRESTLE_BASE + '/oidc/connect/token';

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : require('http');
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 500)));
        } else {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const clientId = process.env.IDX_CLIENT_ID;
  const clientSecret = process.env.IDX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing IDX_CLIENT_ID or IDX_CLIENT_SECRET');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'api',
  });

  const res = await httpRequest(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, params.toString());

  const data = JSON.parse(res.body);
  if (!data.access_token) throw new Error('No access_token in response');
  return data.access_token;
}

// ── Fetch distinct neighborhood values via OData $apply=groupby ──

async function fetchDistinctNames(token) {
  const names = [];
  let url = TRESTLE_BASE + '/odata/Property?$apply=groupby((' + NEIGHBOR_FIELD + '))&$top=500';

  while (url) {
    console.log('  Fetching:', url.slice(0, 120) + (url.length > 120 ? '...' : ''));
    const res = await httpRequest(url, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
      },
    });

    const data = JSON.parse(res.body);
    const values = data.value || [];
    for (const row of values) {
      const val = row[NEIGHBOR_FIELD];
      if (val && typeof val === 'string' && val.trim()) {
        names.push(val.trim());
      }
    }

    url = data['@odata.nextLink'] || null;
  }

  return [...new Set(names)].sort();
}

// ── Non-NYC exclusion — drop anything outside the 5 boroughs ──

const NON_NYC = /\b(hobok|jersey|yonker|montclair|palisade|somerville|essex|cliffsid|upper saddle|lodi|guttenberg|north bergen|weehawken|union city|bayonne|newark|elizabeth|east orange|orange|irvington|bloomfield|nutley|belleville|kearny|harrison|lyndhurst|rutherford|garfield|linden|rahway|plainfield|westfield|scotch|cranford|roselle|hillside|maplewood|millburn|springfield|summit|chatham|madison|morristown|parsippany|dover|rockaway|denville|boonton|butler|kinnelon|pompton|wayne|paterson|passaic|clifton|garfield|hackensack|teaneck|englewood|fort lee|edgewater|fairview|closter|demarest|norwood|old tappan|rivervale|hillsdale|woodcliff|emerson|westwood|park ridge|montvale|pearl river|nanuet|suffern|spring valley|haverstraw|nyack|tarrytown|sleepy|ossining|croton|peekskill|cortlandt|yorktown|mahopac|carmel|brewster|pawling|rhinebeck|kingston|saugerties|woodstock|catskill|hudson|copake|ancram|old chatham|kinderhook|chatham|hillsdale|millerton|amenia|dover|pawling|long island(?! city)|hempstead|garden city|mineola|freeport|baldwin|oceanside|rockville|lynbrook|valley stream|franklin square|elmont|floral park(?! \(Q)|new hyde|great neck|manhasset|port washington|roslyn|glen cove|oyster bay|huntington|northport|smithtown|commack|hauppauge|central islip|brentwood|bay shore|islip|oakdale|sayville|patchogue|medford|shirley|mastic|riverhead|southampton|bridgehampton|easthampton|sag harbor|shelter island|greenport|southold|mattituck|cutchogue|jamesport|calverton|wading river|mount sinai|port jefferson|stony brook|setauket|east setauket|centereach|selden|lake ronkonkoma|holbrook|bohemia|east meadow|levittown|wantagh|massapequa|farmingdale|bethpage|plainview|syosset|jericho|woodbury|hicksville|westbury|carle place|staten island \(othe|out of town|upstate|new york city)\b/i;

const JUNK = /^\s*$|^null$|^other$|^OTHER$|^Other .+$|^X_B_OTHER$|^CNA$|^GDL$|^NEW YORK$|^New York City$|^NYU$|^North New York$|\[ALL\]$|\[ALL$|^DOWNTOWN \[ALL\]$/i;

function isNYC(name) {
  if (!name || typeof name !== 'string') return false;
  if (JUNK.test(name)) return false;
  if (NON_NYC.test(name)) return false;
  return true;
}

// ── Borough inference from known patterns ──

const BOROUGH_HINTS = {
  Manhattan: /upper east|upper west|tribeca|soho|chelsea|fidi|financial|greenwich|grenwich|midtown|hell.s kitchen|hells kitchen|east village|lower east|harlem|nomad|flatiron|gramercy|battery park|hudson yard|west village|nolita|noho|little italy|chinatown|washington height|inwood|murray hill|kips bay|sutton|morningside|yorkville|two bridges|roosevelt island|lincoln (sq|center)|beekman|turtle bay|tudor city|carnegie|lenox hill|alphabet|civic center|hudson square|peter cooper|stuyvesant|sugar hill|hamilton height|manhattanville|manhattan valley|manhattan ave|marble hill|seaport|south (street|village)|bowery|garment|fashion|theater|times sq|central park|koreatown|rose hill|fort george|navy yard|bryant park|fulton|jacob|lower manhattan|west 30|union square|meatpacking|clinton(?! hill)|middle (east|west) side|upper (fifth|carnegie|m\b)|^Manhattan$|^MANHATTAN$|^RI$|^BATTERY$|^BEEKMAN$|^CARNEGIE$|^CENTPKSTH$|^CLINTON$|^CLINTON DUT$|^COBBLEHL$|^COLUMBUSCIR$|^EASTVILL$|^FASHCNTR$|^FINLDIST$|^HAMHGTS$|^HUDHGTS$|^ITALCHIN$|^JACOBJAV$|^KIPSBAY$|^KIPS$|^LINCOLN$|^LOEAST$|^MADISON$|^MORNHGTS$|^MURRAY$|^MSPH$|^MV$|^HDBH$|^SOUTHSTSEAPORT$|^STUYHEI$|^TURTLBAY$|^UPEAST$|^UPWEST$|^WASHHGTS$|^WESTVILL$|^UES$|^UWS$|columbia (presb|st|street|waterfr)/i,
  Brooklyn: /brooklyn|williamsburg|dumbo|park slope|cobble hill|carroll garden|fort greene|ft\.? greene|prospect|greenpoint|green point|bed.stuy|bedford(?! park)|bushwick|crown height|flatbush|bay ridge|sunset park|gowanus|red hook|boerum|clinton hill|ditmas|kensington|kensingtn|windsor|windor|bensonhurst|borough park|brighton beach|canarsie|coney island|dyker|flatland|gravesend|greenwood|homecrest|marine park|midwood|mill basin|ocean (hill|parkway)|sea ?gate|sheeps?head|south slope|vinegar hill|weeksville|north slope|bergen beach|gerrit?sen|map[l]eton|bath beach|manhattan beach|paerdegat|spring creek|east new york|brownsville|starrett|cypress|highland|city line|new lots|lefferts|caton|beverley|fiske|pacific park|kings club|broadway junction|downtown bklyn|erasmus|farragut|fort hamilton|georgetown|new utrecht|north side.south side|park hill|remsen village|ramsen village|south marlboro|wingate|^BATHBEAC$|^BAYRIDGE$|^BENHURST$|^BERGENBEACH$|^BKLYNHTS$|^BOERUMHL$|^BOROPARK$|^BRIGHTON$|^BROWVIL$|^BUSK$|^CANARSIE$|^CARLGDNS$|^CITYLINE$|^CLINTHL$|^COBBLEHL$|^COLUMBIASTWATERFRONT$|^CONEYISL$|^CROWNHEI$|^CYPRESS$|^DTWNBKYN$|^DYKERSHT$|^EFLATBUS$|^ENY$|^FLATLAND$|^FORTGRNE$|^GRAVESND$|^GREENPT$|^GREENWD$|^KENSINGT$|^MANBEACH$|^MAPLETON$|^MIDWOOD$|^MILLBAS$|^NEW UTRECHT$|^OCEANHIL$|^PARKSLOP$|^PROSHEI$|^PROSLEFR$|^PROSPARK$|^REDHOOK$|^REMSEN$|^SEAGATE$|^SHEEPBAY$|^SUNSETPK$|^WINDTERR$|^WILLIAMS$|^HOMECRE$/i,
  Queens: /astoria|long island city|jackson height|flushing|forest hills|sunnyside|bayside|corona|elmhurst|rego park|kew garden|woodside|ridgewood|jamaica|howard beach|ozone park|richmond hill|south ozone|maspeth|middle village|woodhaven|fresh meadow|queens village|laurelton|rosedale|cambria|hollis|saint alban|st\.? alban|springfield|far rockaway|rockaway|belle harbor|breezy point|neponsit|seaside|arverne|edgemere|hammels|broad channel|college point|whitestone|malba|beech[hu]rst|douglaston|little neck|glen oaks|bellerose|oakland|floral park|auburndale|pomonok|hillcrest|briarwood|queensboro|hunters? point|ditmars|steinway|bellaire|blissville|bay terrace|bayswater|bowne|lindenwood|clearview|court square|glendale|birchwood|brickwood|brookville|forest park|rochdale|utopia|^Queens$|^QUEENS$|^ASTORIA$|^BAYSIDE$|^BLHARBOR$|^FORHILLS$|^JKHTS$|^JMCA$|^JMCAH$|^KGARDENS$|^LNGCTY$|^RGWD$|^FLPK$/i,
  Bronx: /riverdale|city island|mott haven|pelham|fordham|concourse|high ?bridge|kingsbridge|morrisania|norwood|throgs? neck|throggs? neck|allerton|bedford park|woodlawn|wakefield|bronxdale|bronxwood|belmont|tremont|castle hill|clason point|claremont|country club|crotona|edenwald|hunts point|laconia|longwood|melrose|morris (height|park)|mount (eden|hope)|mt\. morris|olinville|parkchester|port morris|schuylerville|soundview|spuyten|unionport|university height|van nest|west farms|westchester (sq|village)|zerega|eastchester|fieldston|baychester|williamsbridge|^The Bronx|^Bronx|^ALLERTON$|^BAYCHESTER$|^BEDFORDPARK$|^BRONXOTHER$|^CLASONPOINT$|^CROTONAPARKEAST$|^FIELDSTON$|^FHAMIL$|^GRENVILL$|^LONGWOOD$|^MELROSE$|^MOTTHAVEN$|^NORTHEAST BRONX$|^NORTHWEST BRONX$|^OLINVILLE$|^PARKCHESTER$|^SOUTHEAST BRONX$|^SPUYTENDUYVIL$|^THROGSNECK$|^TREMONT$|^WAKEFIELD$|^WESTFARMS$|^WILLIAMSBRIDGE$/i,
  'Staten Island': /st\.?\s*george|saint george|todt hill|great kills|new brighton|dongan|south beach|stapleton|rosebank|tottenville|annadale|arden height|arrochar|bull.?s head|castleton|charleston|clifton|concord|elm park|eltingville|emerson hill|fort wadsworth|fresh kills|graniteville|grasmere|grant city|greenridge|grymes hill|heartland|huguenot|manor height|mariner.?s?.? harbor|midland beach|new dorp|new springville|oakwood|pleasant plains|port richmond|prince.?s bay|randall manor|richmond.?town|richmond valley|rossville|shore acres|silver lake|south richmond|tompkinsville|travis|ward hill|westerleigh|willowbrook|woodrow|west brighton|^ELTINGVILLE$|^RICHMONDTOWN$|^STATEN ISLAND$|^Staten Island$/i,
};

function inferBorough(name) {
  for (const [borough, re] of Object.entries(BOROUGH_HINTS)) {
    if (re.test(name)) return borough;
  }
  return 'Unknown';
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Main ──

async function main() {
  console.log('=== RLS Neighborhood Fetcher ===');
  console.log('Field: ' + NEIGHBOR_FIELD);
  console.log('API:   ' + TRESTLE_BASE);
  console.log('');

  console.log('Acquiring OAuth2 token...');
  const token = await getToken();
  console.log('Token acquired.\n');

  console.log('Fetching distinct ' + NEIGHBOR_FIELD + ' values...');
  const names = await fetchDistinctNames(token);
  console.log('Found ' + names.length + ' distinct values.\n');

  if (names.length === 0) {
    console.error('ERROR: No neighborhood values returned. Check field name and API access.');
    process.exit(1);
  }

  // Filter to NYC only — drop NJ, LI, upstate, junk codes
  const nycNames = names.filter(isNYC);
  const dropped = names.length - nycNames.length;
  console.log('NYC filter: kept ' + nycNames.length + ', dropped ' + dropped + ' non-NYC/junk entries.\n');

  // Load existing file to preserve manual aliases
  let existingAliases = {};
  try {
    const existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    for (const n of existing.neighborhoods || []) {
      if (n.aliases && n.aliases.length > 0) {
        existingAliases[n.name] = n.aliases;
      }
    }
  } catch (_) { /* no existing file */ }

  const allMapped = nycNames.map((name) => ({
    name,
    borough: inferBorough(name),
    slug: slugify(name),
    aliases: existingAliases[name] || [],
    source: 'trestle',
  }));

  // Drop entries that still couldn't map to a borough — not recognizable NYC neighborhoods
  const unmapped = allMapped.filter((n) => n.borough === 'Unknown');
  const neighborhoods = allMapped.filter((n) => n.borough !== 'Unknown');

  if (unmapped.length > 0) {
    console.log('Dropped ' + unmapped.length + ' entries with unknown borough:');
    unmapped.forEach((n) => console.log('  - ' + n.name));
    console.log('');
  }

  const output = {
    _meta: {
      version: 1,
      source: 'Trestle OData groupby(' + NEIGHBOR_FIELD + ')',
      trestleVerified: true,
      rlsNeighborField: NEIGHBOR_FIELD,
      generatedAt: new Date().toISOString(),
      count: neighborhoods.length,
    },
    neighborhoods,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
  console.log('Wrote ' + neighborhoods.length + ' neighborhoods to ' + OUTPUT);

  // Borough summary
  const byBorough = {};
  for (const n of neighborhoods) {
    byBorough[n.borough] = (byBorough[n.borough] || 0) + 1;
  }
  console.log('\nBy borough:');
  for (const [b, c] of Object.entries(byBorough).sort()) {
    console.log('  ' + b + ': ' + c);
  }

  if (unmapped.length > 0) {
    console.log('NOTE: ' + unmapped.length + ' values dropped (unknown borough). Review above if needed.');
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
