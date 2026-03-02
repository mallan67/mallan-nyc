#!/usr/bin/env node
/**
 * fetch-nta-geojson.js — Download NYC Open Data NTA 2020 polygons
 * and generate neighborhood-polygons.js for MapLibre GL JS
 *
 * Data source: https://data.cityofnewyork.us/City-Government/2020-Neighborhood-Tabulation-Areas-NTAs-/9nt8-h7nd
 *
 * Output: js/render/neighborhood-polygons.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'js', 'render', 'neighborhood-polygons.js');

// ── Our neighborhood names → exact NTA 2020 name mapping ──
// null = no NTA match, will use existing polygon data converted to [lng,lat]
const OUR_TO_NTA = {
    // Manhattan
    'Battery Park City': 'Financial District-Battery Park City',
    'Carnegie Hill': 'Upper East Side-Carnegie Hill',
    'Central Harlem': 'Harlem (South)',
    'Central Park South': null,
    'Chelsea': 'Chelsea-Hudson Yards',
    'Chinatown': 'Chinatown-Two Bridges',
    'Civic Center': 'Tribeca-Civic Center',
    'East Harlem': 'East Harlem (North)',
    'East Village': 'East Village',
    'Financial District': 'Financial District-Battery Park City',
    'Flatiron': 'Midtown South-Flatiron-Union Square',
    'Gramercy': 'Gramercy',
    'Gramercy Park': 'Gramercy',
    'Greenwich Village': 'Greenwich Village',
    'Hamilton Heights': 'Hamilton Heights-Sugar Hill',
    "Hell's Kitchen": "Hell's Kitchen",
    'Hudson Square': 'SoHo-Little Italy-Hudson Square',
    'Hudson Yards': 'Chelsea-Hudson Yards',
    'Inwood': 'Inwood',
    'Kips Bay': 'Murray Hill-Kips Bay',
    'Lenox Hill': 'Upper East Side-Lenox Hill-Roosevelt Island',
    'Lincoln Square': 'Upper West Side-Lincoln Square',
    'Little Italy': 'SoHo-Little Italy-Hudson Square',
    'Lower East Side': 'Lower East Side',
    'Manhattan Valley': 'Upper West Side-Manhattan Valley',
    'Manhattanville': 'Manhattanville-West Harlem',
    'Marble Hill': 'Kingsbridge-Marble Hill',
    'Meatpacking District': null,
    'Midtown': 'Midtown-Times Square',
    'Midtown East': 'East Midtown-Turtle Bay',
    'Midtown West': 'Midtown-Times Square',
    'Morningside Heights': 'Morningside Heights',
    'Murray Hill': 'Murray Hill-Kips Bay',
    'NoHo': null,
    'NoMad': null,
    'Nolita': null,
    'Roosevelt Island': 'Upper East Side-Lenox Hill-Roosevelt Island',
    'SoHo': 'SoHo-Little Italy-Hudson Square',
    'Stuyvesant Town': 'Stuyvesant Town-Peter Cooper Village',
    'Sugar Hill': 'Hamilton Heights-Sugar Hill',
    'Sutton Place': null,
    'Times Square': 'Midtown-Times Square',
    'Tribeca': 'Tribeca-Civic Center',
    'Tudor City': null,
    'Turtle Bay': 'East Midtown-Turtle Bay',
    'Two Bridges': 'Chinatown-Two Bridges',
    'Union Square': 'Midtown South-Flatiron-Union Square',
    'Upper East Side': 'Upper East Side-Carnegie Hill',
    'Upper West Side': 'Upper West Side (Central)',
    'Washington Heights': 'Washington Heights (South)',
    'West Harlem': 'Manhattanville-West Harlem',
    'West Village': 'West Village',
    'Yorkville': 'Upper East Side-Yorkville',
    'Peter Cooper Village': 'Stuyvesant Town-Peter Cooper Village',

    // Brooklyn
    'Bay Ridge': 'Bay Ridge',
    'Bedford-Stuyvesant': 'Bedford-Stuyvesant (East)',
    'Boerum Hill': 'Downtown Brooklyn-DUMBO-Boerum Hill',
    'Borough Park': 'Borough Park',
    'Brighton Beach': 'Brighton Beach',
    'Brooklyn Heights': 'Brooklyn Heights',
    'Bushwick': 'Bushwick (East)',
    'Carroll Gardens': 'Carroll Gardens-Cobble Hill-Gowanus-Red Hook',
    'Clinton Hill': 'Clinton Hill',
    'Cobble Hill': 'Carroll Gardens-Cobble Hill-Gowanus-Red Hook',
    'Coney Island': 'Coney Island-Sea Gate',
    'Crown Heights': 'Crown Heights (South)',
    'DUMBO': 'Downtown Brooklyn-DUMBO-Boerum Hill',
    'Ditmas Park': 'Flatbush (West)-Ditmas Park-Parkville',
    'Downtown Brooklyn': 'Downtown Brooklyn-DUMBO-Boerum Hill',
    'East Williamsburg': 'East Williamsburg',
    'Flatbush': 'Flatbush',
    'Fort Greene': 'Fort Greene',
    'Gowanus': 'Carroll Gardens-Cobble Hill-Gowanus-Red Hook',
    'Greenpoint': 'Greenpoint',
    'Kensington': 'Kensington',
    'Park Slope': 'Park Slope',
    'Prospect Heights': 'Prospect Heights',
    'Prospect Lefferts Gardens': 'Prospect Lefferts Gardens-Wingate',
    'Red Hook': 'Carroll Gardens-Cobble Hill-Gowanus-Red Hook',
    'Ridgewood': 'Ridgewood',
    'South Slope': 'Windsor Terrace-South Slope',
    'South Williamsburg': 'South Williamsburg',
    'Sunset Park': 'Sunset Park (Central)',
    'Williamsburg': 'Williamsburg',
    'Windsor Terrace': 'Windsor Terrace-South Slope',

    // Queens
    'Astoria': 'Astoria (Central)',
    'Bayside': 'Bayside',
    'Corona': 'Corona',
    'Elmhurst': 'Elmhurst',
    'Flushing': 'Flushing-Willets Point',
    'Forest Hills': 'Forest Hills',
    'Jackson Heights': 'Jackson Heights',
    'Kew Gardens': 'Kew Gardens',
    'Long Island City': 'Long Island City-Hunters Point',
    'Rego Park': 'Rego Park',
    'Sunnyside': 'Sunnyside',
    'Woodside': 'Woodside',

    // Bronx
    'Allerton': 'Allerton',
    'Bedford Park': 'Bedford Park',
    'City Island': 'Pelham Bay-Country Club-City Island',
    'Co-op City': 'Co-op City',
    'Concourse': 'Concourse-Concourse Village',
    'Fordham': 'Fordham Heights',
    'Highbridge': 'Highbridge',
    'Kingsbridge': 'Kingsbridge-Marble Hill',
    'Kingsbridge Heights': 'Kingsbridge Heights-Van Cortlandt Village',
    'Morrisania': 'Morrisania',
    'Mott Haven': 'Mott Haven-Port Morris',
    'Norwood': 'Norwood',
    'Pelham Bay': 'Pelham Bay-Country Club-City Island',
    'Pelham Gardens': 'Pelham Gardens',
    'Riverdale': 'Riverdale-Spuyten Duyvil',
    'Spuyten Duyvil': 'Riverdale-Spuyten Duyvil',
    'Throgs Neck': 'Throgs Neck-Schuylerville',
    'Woodlawn': 'Wakefield-Woodlawn',

    // Staten Island
    'Dongan Hills': 'Grasmere-Arrochar-South Beach-Dongan Hills',
    'Great Kills': 'Great Kills-Eltingville',
    'Rosebank': 'Rosebank-Shore Acres-Park Hill',
    'South Beach': 'Grasmere-Arrochar-South Beach-Dongan Hills',
    'St. George': 'St. George-New Brighton',
    'Stapleton': 'Tompkinsville-Stapleton-Clifton-Fox Hills',
    'Todt Hill': 'Todt Hill-Emerson Hill-Lighthouse Hill-Manor Heights',
    'Tottenville': 'Tottenville-Charleston',
    'Bensonhurst': 'Bensonhurst'
};

// Aliases that point to canonical neighborhoods
const ALIASES = {
    'Bed-Stuy': 'Bedford-Stuyvesant',
    'FiDi': 'Financial District',
    'LES': 'Lower East Side',
    'UES': 'Upper East Side',
    'UWS': 'Upper West Side',
    'LIC': 'Long Island City',
    'TriBeCa': 'Tribeca'
};

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode !== 200) reject(new Error('HTTP ' + res.statusCode));
                else resolve(JSON.parse(data));
            });
        }).on('error', reject);
    });
}

function computeCentroid(coords) {
    let sumLat = 0, sumLng = 0, n = coords.length;
    for (let i = 0; i < n; i++) {
        sumLng += coords[i][0];
        sumLat += coords[i][1];
    }
    return [sumLat / n, sumLng / n]; // [lat, lng] for NEIGHBORHOOD_CENTERS
}

function getLargestRing(geometry) {
    if (geometry.type === 'MultiPolygon') {
        let best = null, bestArea = 0;
        for (const poly of geometry.coordinates) {
            const ring = poly[0];
            const area = shoelaceArea(ring);
            if (area > bestArea) { bestArea = area; best = ring; }
        }
        return best;
    }
    if (geometry.type === 'Polygon') {
        return geometry.coordinates[0];
    }
    return null;
}

function shoelaceArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return Math.abs(area / 2);
}

function simplifyRing(coords, tolerance) {
    if (coords.length <= 3) return coords;
    function perpDist(p, a, b) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag === 0) return Math.sqrt(Math.pow(p[0] - a[0], 2) + Math.pow(p[1] - a[1], 2));
        const u = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (mag * mag);
        return Math.sqrt(Math.pow(p[0] - (a[0] + u * dx), 2) + Math.pow(p[1] - (a[1] + u * dy), 2));
    }
    function dp(pts, s, e, tol) {
        let mx = 0, mi = 0;
        for (let i = s + 1; i < e; i++) {
            const d = perpDist(pts[i], pts[s], pts[e]);
            if (d > mx) { mx = d; mi = i; }
        }
        if (mx > tol) {
            const l = dp(pts, s, mi, tol);
            const r = dp(pts, mi, e, tol);
            return l.slice(0, -1).concat(r);
        }
        return [pts[s], pts[e]];
    }
    return dp(coords, 0, coords.length - 1, tolerance);
}

// Parse existing polygon data from current file to use as fallback
function parseExistingPolygons(fileContent) {
    const result = {};
    // Match each neighborhood entry: 'Name': [[lat, lng], ...]
    const regex = /'([^']+)':\s*(\[\[[\d\s.,\-\[\]]+\]\])/g;
    let match;
    while ((match = regex.exec(fileContent)) !== null) {
        const name = match[1];
        try {
            const coords = JSON.parse(match[2]);
            // Convert [lat, lng] to [lng, lat]
            const converted = coords.map(c => [c[1], c[0]]);
            // Close ring if needed
            if (converted.length > 2 &&
                (converted[0][0] !== converted[converted.length-1][0] ||
                 converted[0][1] !== converted[converted.length-1][1])) {
                converted.push([...converted[0]]);
            }
            result[name] = converted;
        } catch (e) {
            // skip parse errors
        }
    }
    return result;
}

async function main() {
    console.log('Fetching NTA 2020 boundaries from NYC Open Data...');

    const url = 'https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=300&$where=ntatype%20!=%20%279%27';
    const geojson = await fetchJSON(url);
    console.log('Received', geojson.features.length, 'NTA features');

    // Build NTA lookup
    const ntaLookup = {};
    for (const feature of geojson.features) {
        ntaLookup[feature.properties.ntaname] = feature.geometry;
    }

    // Parse existing polygons as fallback
    const existingFile = fs.readFileSync(OUTPUT, 'utf8');
    const existingPolygons = parseExistingPolygons(existingFile);
    console.log('Parsed', Object.keys(existingPolygons).length, 'existing polygon fallbacks');

    // Parse existing centers
    const existingCenters = {};
    const centerRegex = /'([^']+)':\s*\[([\d.-]+),\s*([\d.-]+)\]/g;
    const centerSection = existingFile.substring(existingFile.indexOf('var NEIGHBORHOOD_CENTERS'));
    let cm;
    while ((cm = centerRegex.exec(centerSection)) !== null) {
        existingCenters[cm[1]] = [parseFloat(cm[2]), parseFloat(cm[3])];
    }

    const polygons = {};
    const centers = {};
    let ntaMatched = 0, fallbackUsed = 0, missing = 0;

    const ourNames = Object.keys(OUR_TO_NTA).sort();
    console.log('\nProcessing', ourNames.length, 'neighborhoods...\n');

    for (const name of ourNames) {
        const ntaName = OUR_TO_NTA[name];

        if (ntaName === null) {
            // Use existing polygon as fallback
            if (existingPolygons[name]) {
                const coords = existingPolygons[name];
                polygons[name] = { type: 'Polygon', coordinates: [coords] };
                centers[name] = existingCenters[name] || computeCentroid(coords);
                fallbackUsed++;
                console.log('  FALLBACK:', name, '(' + coords.length + ' pts)');
            } else {
                missing++;
                console.log('  MISSING:', name);
            }
            continue;
        }

        const geom = ntaLookup[ntaName];
        if (!geom) {
            // NTA name not found — try fallback
            if (existingPolygons[name]) {
                const coords = existingPolygons[name];
                polygons[name] = { type: 'Polygon', coordinates: [coords] };
                centers[name] = existingCenters[name] || computeCentroid(coords);
                fallbackUsed++;
                console.log('  NTA NOT FOUND, FALLBACK:', name, '→', ntaName);
            } else {
                missing++;
                console.log('  NTA NOT FOUND, NO FALLBACK:', name, '→', ntaName);
            }
            continue;
        }

        let ring = getLargestRing(geom);
        if (!ring) {
            missing++;
            console.log('  NO RING:', name);
            continue;
        }

        // Simplify large polygons
        if (ring.length > 80) {
            ring = simplifyRing(ring, 0.0003);
        }

        // Close ring
        if (ring.length > 0 &&
            (ring[0][0] !== ring[ring.length-1][0] ||
             ring[0][1] !== ring[ring.length-1][1])) {
            ring.push([...ring[0]]);
        }

        polygons[name] = { type: 'Polygon', coordinates: [ring] };
        centers[name] = computeCentroid(ring);
        ntaMatched++;
        console.log('  NTA MATCH:', name, '→', ntaName, '(' + ring.length + ' pts)');
    }

    console.log('\nResults:');
    console.log('  NTA matched:', ntaMatched);
    console.log('  Fallback (existing):', fallbackUsed);
    console.log('  Missing:', missing);
    console.log('  Total polygons:', Object.keys(polygons).length);

    // ── Generate output ──
    let out = '';
    out += '// ═══════════════════════════════════════════════════════\n';
    out += '// NEIGHBORHOOD POLYGONS — NYC NTA 2020 boundary data (GeoJSON)\n';
    out += '// Source: NYC Open Data NTA 2020 (data.cityofnewyork.us)\n';
    out += '// Generated by scripts/fetch-nta-geojson.js\n';
    out += '// Coordinate order: [lng, lat] (GeoJSON standard)\n';
    out += '// ═══════════════════════════════════════════════════════\n\n';

    out += 'var _activePolygons = {};  // name -> { sourceId, fillId, lineId, map }\n\n';

    // NEIGHBORHOOD_POLYGONS
    out += 'var NEIGHBORHOOD_POLYGONS = {\n';
    const pNames = Object.keys(polygons).sort();
    pNames.forEach((name, i) => {
        const comma = i < pNames.length - 1 ? ',' : '';
        out += '    ' + JSON.stringify(name) + ': ' + JSON.stringify(polygons[name]) + comma + '\n';
    });
    out += '};\n\n';

    // NEIGHBORHOOD_CENTERS — [lat, lng] for use with flyTo (converted at call site)
    out += 'var NEIGHBORHOOD_CENTERS = {\n';
    const cNames = Object.keys(centers).sort();
    cNames.forEach((name, i) => {
        const c = centers[name];
        const comma = i < cNames.length - 1 ? ',' : '';
        out += '    ' + JSON.stringify(name) + ': [' + c[0].toFixed(4) + ', ' + c[1].toFixed(4) + ']' + comma + '\n';
    });
    out += '};\n\n';

    // Aliases
    out += 'var NEIGHBORHOOD_ALIASES = ' + JSON.stringify(ALIASES, null, 4) + ';\n\n';

    out += 'function resolveNeighborhoodName(name) {\n';
    out += '    return NEIGHBORHOOD_ALIASES[name] || name;\n';
    out += '}\n\n';

    // MapLibre polygon draw functions
    out += '// ═══════════════════════════════════════════════════════\n';
    out += '// Polygon drawing functions — MapLibre GL JS\n';
    out += '// ═══════════════════════════════════════════════════════\n\n';

    out += 'function drawNeighborhoodPolygon(name, targetMap) {\n';
    out += '    var map = targetMap || _gmap;\n';
    out += '    if (!map) return;\n';
    out += '    var resolved = resolveNeighborhoodName(name);\n';
    out += '    if (_activePolygons[resolved]) return;\n';
    out += '    var geom = NEIGHBORHOOD_POLYGONS[resolved];\n';
    out += '    if (!geom) return;\n';
    out += '    var slug = resolved.replace(/[^a-zA-Z0-9]/g, \'-\').toLowerCase();\n';
    out += '    var sourceId = \'nb-src-\' + slug;\n';
    out += '    var fillId = \'nb-fill-\' + slug;\n';
    out += '    var lineId = \'nb-line-\' + slug;\n';
    out += '    try {\n';
    out += '        map.addSource(sourceId, {\n';
    out += '            type: \'geojson\',\n';
    out += '            data: { type: \'Feature\', geometry: geom, properties: { name: resolved } }\n';
    out += '        });\n';
    out += '        map.addLayer({\n';
    out += '            id: fillId, type: \'fill\', source: sourceId,\n';
    out += '            paint: { \'fill-color\': \'rgba(196, 160, 82, 0.25)\', \'fill-opacity\': 0.6 }\n';
    out += '        });\n';
    out += '        map.addLayer({\n';
    out += '            id: lineId, type: \'line\', source: sourceId,\n';
    out += '            paint: { \'line-color\': \'#B8860B\', \'line-width\': 2, \'line-opacity\': 0.85 }\n';
    out += '        });\n';
    out += '        map.on(\'click\', fillId, function(e) {\n';
    out += '            new maplibregl.Popup({ closeButton: false, closeOnClick: true })\n';
    out += '                .setLngLat(e.lngLat)\n';
    out += '                .setHTML(\'<div style=\"font-weight:600;font-size:13px;padding:2px 4px;\">\' + resolved + \'</div>\')\n';
    out += '                .addTo(map);\n';
    out += '        });\n';
    out += '        map.on(\'mouseenter\', fillId, function() { map.getCanvas().style.cursor = \'pointer\'; });\n';
    out += '        map.on(\'mouseleave\', fillId, function() { map.getCanvas().style.cursor = \'\'; });\n';
    out += '        _activePolygons[resolved] = { sourceId: sourceId, fillId: fillId, lineId: lineId, map: map };\n';
    out += '    } catch(e) { console.warn(\'[Polygon]\', resolved, e.message); }\n';
    out += '}\n\n';

    out += 'function removeNeighborhoodPolygon(name, targetMap) {\n';
    out += '    var resolved = resolveNeighborhoodName(name);\n';
    out += '    var entry = _activePolygons[resolved];\n';
    out += '    if (!entry) return;\n';
    out += '    var map = targetMap || entry.map || _gmap;\n';
    out += '    if (!map) return;\n';
    out += '    try {\n';
    out += '        if (map.getLayer(entry.fillId)) map.removeLayer(entry.fillId);\n';
    out += '        if (map.getLayer(entry.lineId)) map.removeLayer(entry.lineId);\n';
    out += '        if (map.getSource(entry.sourceId)) map.removeSource(entry.sourceId);\n';
    out += '    } catch(e) {}\n';
    out += '    delete _activePolygons[resolved];\n';
    out += '}\n\n';

    out += 'function toggleNeighborhoodPolygon(name, show, targetMap) {\n';
    out += '    if (show) drawNeighborhoodPolygon(name, targetMap);\n';
    out += '    else removeNeighborhoodPolygon(name, targetMap);\n';
    out += '}\n\n';

    out += 'function clearAllNeighborhoodPolygons(targetMap) {\n';
    out += '    Object.keys(_activePolygons).forEach(function(n) {\n';
    out += '        removeNeighborhoodPolygon(n, targetMap);\n';
    out += '    });\n';
    out += '    _activePolygons = {};\n';
    out += '}\n\n';

    out += 'function getActivePolygonCount() {\n';
    out += '    return Object.keys(_activePolygons).length;\n';
    out += '}\n';

    fs.writeFileSync(OUTPUT, out, 'utf8');
    const lines = out.split('\n').length;
    const sizeKB = Math.round(Buffer.byteLength(out) / 1024);
    console.log('\nWrote:', OUTPUT);
    console.log('  Lines:', lines);
    console.log('  Size:', sizeKB, 'KB');
    console.log('  Neighborhoods:', pNames.length);
}

main().catch(e => { console.error(e); process.exit(1); });
