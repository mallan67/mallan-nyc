#!/usr/bin/env node
// Fetch NYC NTA (Neighborhood Tabulation Areas) boundaries from NYC Open Data
// and generate neighborhood-polygons.js with accurate coordinates
// Uses NTA 2020 dataset: https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson
const https = require('https');

const NTA_URL = 'https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=500';

// Map NTA 2020 names → REBNY/search neighborhood names
// Format: 'NTA Name': 'REBNY Name' OR ['Name1', 'Name2']
const NTA_TO_REBNY = {
    // ═══ Manhattan ═══
    'Chelsea-Hudson Yards': ['Chelsea', 'Hudson Yards'],
    'Chinatown-Two Bridges': ['Chinatown', 'Two Bridges'],
    'East Harlem (North)': 'East Harlem',
    'East Harlem (South)': 'East Harlem',
    'East Midtown-Turtle Bay': ['Midtown East', 'Turtle Bay', 'Sutton Place'],
    'East Village': 'East Village',
    'Financial District-Battery Park City': ['Financial District', 'Battery Park City'],
    'Gramercy': ['Gramercy', 'Gramercy Park'],
    'Greenwich Village': 'Greenwich Village',
    'Hamilton Heights-Sugar Hill': ['Hamilton Heights', 'Sugar Hill'],
    'Harlem (North)': 'Central Harlem',
    'Harlem (South)': 'Central Harlem',
    "Hell's Kitchen": "Hell's Kitchen",
    'Inwood': 'Inwood',
    'Lower East Side': 'Lower East Side',
    'Manhattanville-West Harlem': ['West Harlem', 'Manhattanville'],
    'Midtown South-Flatiron-Union Square': ['Flatiron', 'NoMad', 'Union Square'],
    'Midtown-Times Square': ['Midtown', 'Times Square'],
    'Morningside Heights': 'Morningside Heights',
    'Murray Hill-Kips Bay': ['Murray Hill', 'Kips Bay'],
    'SoHo-Little Italy-Hudson Square': ['SoHo', 'Little Italy', 'Nolita', 'Hudson Square'],
    'Stuyvesant Town-Peter Cooper Village': ['Stuyvesant Town', 'Peter Cooper Village'],
    'Tribeca-Civic Center': ['Tribeca', 'Civic Center'],
    'Upper East Side-Carnegie Hill': ['Upper East Side', 'Carnegie Hill'],
    'Upper East Side-Lenox Hill-Roosevelt Island': ['Lenox Hill', 'Roosevelt Island'],
    'Upper East Side-Yorkville': 'Yorkville',
    'Upper West Side (Central)': 'Upper West Side',
    'Upper West Side-Lincoln Square': 'Lincoln Square',
    'Upper West Side-Manhattan Valley': 'Manhattan Valley',
    'Washington Heights (North)': 'Washington Heights',
    'Washington Heights (South)': 'Washington Heights',
    'West Village': 'West Village',
    // ═══ Brooklyn ═══
    'Bay Ridge': 'Bay Ridge',
    'Bedford-Stuyvesant (East)': 'Bedford-Stuyvesant',
    'Bedford-Stuyvesant (West)': 'Bedford-Stuyvesant',
    'Brooklyn Heights': 'Brooklyn Heights',
    'Bushwick (East)': 'Bushwick',
    'Bushwick (West)': 'Bushwick',
    'Carroll Gardens-Cobble Hill-Gowanus-Red Hook': ['Carroll Gardens', 'Cobble Hill', 'Gowanus', 'Red Hook'],
    'Clinton Hill': 'Clinton Hill',
    'Crown Heights (North)': 'Crown Heights',
    'Crown Heights (South)': 'Crown Heights',
    'Downtown Brooklyn-DUMBO-Boerum Hill': ['Downtown Brooklyn', 'DUMBO', 'Boerum Hill'],
    'Fort Greene': 'Fort Greene',
    'Greenpoint': 'Greenpoint',
    'Park Slope': 'Park Slope',
    'Prospect Heights': 'Prospect Heights',
    'South Williamsburg': 'South Williamsburg',
    'Williamsburg': 'Williamsburg',
    'Windsor Terrace-South Slope': ['Windsor Terrace', 'South Slope'],
    'East Williamsburg': 'East Williamsburg',
    'Flatbush': 'Flatbush',
    'Flatbush (West)-Ditmas Park-Parkville': ['Ditmas Park'],
    'Prospect Lefferts Gardens-Wingate': 'Prospect Lefferts Gardens',
    'Sunset Park (Central)': 'Sunset Park',
    'Sunset Park (West)': 'Sunset Park',
    'Borough Park': 'Borough Park',
    'Bensonhurst': 'Bensonhurst',
    'Kensington': 'Kensington',
    'Coney Island-Sea Gate': 'Coney Island',
    'Brighton Beach': 'Brighton Beach',
    // ═══ Queens ═══
    'Astoria (Central)': 'Astoria',
    'Astoria (North)-Ditmars-Steinway': 'Astoria',
    'Astoria (East)-Woodside (North)': 'Astoria',
    'Old Astoria-Hallets Point': 'Astoria',
    'Long Island City-Hunters Point': 'Long Island City',
    'Queensbridge-Ravenswood-Dutch Kills': 'Long Island City',
    'Forest Hills': 'Forest Hills',
    'Jackson Heights': 'Jackson Heights',
    'Woodside': 'Woodside',
    'Sunnyside': 'Sunnyside',
    'Flushing-Willets Point': 'Flushing',
    'Corona': 'Corona',
    'North Corona': 'Corona',
    'Rego Park': 'Rego Park',
    'Kew Gardens': 'Kew Gardens',
    'Bayside': 'Bayside',
    'Elmhurst': 'Elmhurst',
    'Ridgewood': 'Ridgewood',
    // ═══ Bronx ═══
    'Riverdale-Spuyten Duyvil': ['Riverdale', 'Spuyten Duyvil'],
    'Throgs Neck-Schuylerville': 'Throgs Neck',
    'Pelham Bay-Country Club-City Island': ['Pelham Bay', 'City Island'],
    'Allerton': 'Allerton',
    'Pelham Gardens': 'Pelham Gardens',
    'Bedford Park': 'Bedford Park',
    'University Heights (North)-Fordham': 'Fordham',
    'Co-op City': 'Co-op City',
    'Kingsbridge-Marble Hill': ['Kingsbridge', 'Marble Hill'],
    'Kingsbridge Heights-Van Cortlandt Village': 'Kingsbridge Heights',
    'Mott Haven-Port Morris': 'Mott Haven',
    'Morrisania': 'Morrisania',
    'Concourse-Concourse Village': 'Concourse',
    'Highbridge': 'Highbridge',
    'Norwood': 'Norwood',
    'Wakefield-Woodlawn': 'Woodlawn',
    // ═══ Staten Island ═══
    'St. George-New Brighton': 'St. George',
    'Rosebank-Shore Acres-Park Hill': 'Rosebank',
    'Tompkinsville-Stapleton-Clifton-Fox Hills': 'Stapleton',
    'Todt Hill-Emerson Hill-Lighthouse Hill-Manor Heights': 'Todt Hill',
    'Great Kills-Eltingville': 'Great Kills',
    'Grasmere-Arrochar-South Beach-Dongan Hills': ['South Beach', 'Dongan Hills'],
    'Tottenville-Charleston': 'Tottenville',
};

// Douglas-Peucker line simplification — preserves corners and shape
function perpendicularDistance(point, lineStart, lineEnd) {
    var dx = lineEnd[0] - lineStart[0];
    var dy = lineEnd[1] - lineStart[1];
    var mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) return Math.sqrt(Math.pow(point[0] - lineStart[0], 2) + Math.pow(point[1] - lineStart[1], 2));
    var u = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (mag * mag);
    var closestX = lineStart[0] + u * dx;
    var closestY = lineStart[1] + u * dy;
    return Math.sqrt(Math.pow(point[0] - closestX, 2) + Math.pow(point[1] - closestY, 2));
}

function douglasPeucker(points, epsilon) {
    if (points.length <= 2) return points;
    var maxDist = 0, maxIdx = 0;
    for (var i = 1; i < points.length - 1; i++) {
        var d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
        if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > epsilon) {
        var left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
        var right = douglasPeucker(points.slice(maxIdx), epsilon);
        return left.slice(0, -1).concat(right);
    }
    return [points[0], points[points.length - 1]];
}

function simplifyCoords(coords, targetPoints) {
    if (coords.length <= targetPoints) return coords;
    // Binary search for the right epsilon to hit ~targetPoints
    var lo = 0, hi = 0.01;
    var result = coords;
    for (var iter = 0; iter < 20; iter++) {
        var mid = (lo + hi) / 2;
        result = douglasPeucker(coords, mid);
        if (result.length > targetPoints) {
            lo = mid;
        } else {
            hi = mid;
        }
        if (Math.abs(result.length - targetPoints) <= 3) break;
    }
    // Ensure polygon is closed
    var last = coords[coords.length - 1];
    if (result[result.length-1][0] !== last[0] || result[result.length-1][1] !== last[1]) {
        result.push(last);
    }
    return result;
}

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('Fetching NTA boundaries from NYC Open Data...');
    const geo = await fetchJSON(NTA_URL);
    console.log(`Got ${geo.features.length} features`);

    const polygons = {};
    const matched = [];
    const unmatched = [];

    for (const feature of geo.features) {
        // Skip non-neighborhood NTAs (parks, airports, etc.)
        if (feature.properties.ntatype !== '0') continue;

        const ntaName = feature.properties.ntaname || '';
        if (!ntaName) continue;

        const mapping = NTA_TO_REBNY[ntaName];
        if (!mapping) {
            unmatched.push(ntaName);
            continue;
        }
        matched.push(ntaName);

        // Extract coordinates (handle MultiPolygon and Polygon)
        let allCoords = [];
        const geom = feature.geometry;
        if (geom.type === 'Polygon') {
            allCoords = geom.coordinates[0]; // outer ring
        } else if (geom.type === 'MultiPolygon') {
            // Merge all polygon parts into one combined boundary
            // First, find the largest polygon (main body)
            let maxArea = 0, mainPoly = [];
            for (const poly of geom.coordinates) {
                const ring = poly[0];
                // Approximate area using shoelace formula
                let area = 0;
                for (let k = 0; k < ring.length - 1; k++) {
                    area += ring[k][0] * ring[k+1][1] - ring[k+1][0] * ring[k][1];
                }
                area = Math.abs(area) / 2;
                if (area > maxArea) {
                    maxArea = area;
                    mainPoly = ring;
                }
            }
            allCoords = mainPoly;
        }

        if (allCoords.length < 3) continue;

        // Convert [lng, lat] to [lat, lng] and simplify with Douglas-Peucker
        const latLng = allCoords.map(c => [
            Math.round(c[1] * 100000) / 100000,
            Math.round(c[0] * 100000) / 100000
        ]);
        const simplified = simplifyCoords(latLng, 40);

        // Assign to REBNY name(s)
        const names = Array.isArray(mapping) ? mapping : [mapping];
        for (const name of names) {
            if (!polygons[name]) {
                polygons[name] = simplified;
            }
            // If we already have this name (e.g., two NTAs map to same name),
            // merge by using the one with more points for better shape
        }
    }

    // Generate JS output
    let js = '// ═══════════════════════════════════════════════════════\n';
    js += '// NEIGHBORHOOD POLYGONS — NYC NTA boundary data\n';
    js += '// Source: NYC Open Data NTA 2020 (data.cityofnewyork.us)\n';
    js += '// Auto-generated by scripts/fetch-nta-polygons.js — do not edit manually\n';
    js += '// ═══════════════════════════════════════════════════════\n\n';
    js += 'var _activePolygons = {};  // name -> google.maps.Polygon\n\n';
    js += 'var NEIGHBORHOOD_POLYGONS = {\n';

    const names = Object.keys(polygons).sort();
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const coords = polygons[name];
        const coordStr = coords.map(c => `[${c[0]}, ${c[1]}]`).join(', ');
        js += `    '${name.replace(/'/g, "\\'")}': [${coordStr}]`;
        if (i < names.length - 1) js += ',';
        js += '\n';
    }

    js += '};\n\n';

    // Add aliases
    js += "// Aliases for name variations\n";
    js += "NEIGHBORHOOD_POLYGONS['Bed-Stuy'] = NEIGHBORHOOD_POLYGONS['Bedford-Stuyvesant'];\n";
    js += "NEIGHBORHOOD_POLYGONS['FiDi'] = NEIGHBORHOOD_POLYGONS['Financial District'];\n";
    js += "NEIGHBORHOOD_POLYGONS['LES'] = NEIGHBORHOOD_POLYGONS['Lower East Side'];\n";
    js += "NEIGHBORHOOD_POLYGONS['UES'] = NEIGHBORHOOD_POLYGONS['Upper East Side'];\n";
    js += "NEIGHBORHOOD_POLYGONS['UWS'] = NEIGHBORHOOD_POLYGONS['Upper West Side'];\n";
    js += "NEIGHBORHOOD_POLYGONS['LIC'] = NEIGHBORHOOD_POLYGONS['Long Island City'];\n";
    js += "NEIGHBORHOOD_POLYGONS['TriBeCa'] = NEIGHBORHOOD_POLYGONS['Tribeca'];\n";
    js += "NEIGHBORHOOD_POLYGONS[\"Hell's Kitchen\"] = NEIGHBORHOOD_POLYGONS[\"Hell's Kitchen\"] || NEIGHBORHOOD_POLYGONS['Clinton'];\n";
    js += "NEIGHBORHOOD_POLYGONS['Clinton'] = NEIGHBORHOOD_POLYGONS[\"Hell's Kitchen\"];\n";
    js += "NEIGHBORHOOD_POLYGONS['NoHo'] = NEIGHBORHOOD_POLYGONS['East Village'];\n\n";

    // Add neighborhood centers (calculated from polygon centroids)
    js += '// Neighborhood centers (centroids from polygon data)\n';
    js += 'var NEIGHBORHOOD_CENTERS = {\n';
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const coords = polygons[name];
        let sumLat = 0, sumLng = 0;
        for (const c of coords) { sumLat += c[0]; sumLng += c[1]; }
        const centerLat = Math.round((sumLat / coords.length) * 10000) / 10000;
        const centerLng = Math.round((sumLng / coords.length) * 10000) / 10000;
        js += `    '${name.replace(/'/g, "\\'")}': [${centerLat}, ${centerLng}]`;
        if (i < names.length - 1) js += ',';
        js += '\n';
    }
    js += '};\n\n';

    // Add polygon drawing functions
    js += `// ═══════════════════════════════════════════════════════
// Polygon drawing functions
// ═══════════════════════════════════════════════════════

function drawNeighborhoodPolygon(name) {
    if (!_gmap || typeof google === 'undefined') return;
    if (_activePolygons[name]) return;

    var coords = NEIGHBORHOOD_POLYGONS[name];
    if (!coords) return;

    var path = coords.map(function(c) {
        return { lat: c[0], lng: c[1] };
    });

    var polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.18,
        map: _gmap
    });

    var bounds = new google.maps.LatLngBounds();
    path.forEach(function(p) { bounds.extend(p); });

    polygon.addListener('click', function() {
        if (_gmapInfoWindow) {
            _gmapInfoWindow.setContent(
                '<div style="font-weight:600;font-size:13px;padding:2px 4px;">' + name + '</div>'
            );
            _gmapInfoWindow.setPosition(bounds.getCenter());
            _gmapInfoWindow.open(_gmap);
        }
    });

    _activePolygons[name] = polygon;
}

function removeNeighborhoodPolygon(name) {
    if (_activePolygons[name]) {
        _activePolygons[name].setMap(null);
        delete _activePolygons[name];
    }
}

function toggleNeighborhoodPolygon(name, show) {
    if (show) {
        drawNeighborhoodPolygon(name);
    } else {
        removeNeighborhoodPolygon(name);
    }
}

function clearAllNeighborhoodPolygons() {
    Object.keys(_activePolygons).forEach(function(name) {
        _activePolygons[name].setMap(null);
    });
    _activePolygons = {};
}

function getActivePolygonCount() {
    return Object.keys(_activePolygons).length;
}
`;

    const outPath = require('path').join(__dirname, '..', 'js', 'render', 'neighborhood-polygons.js');
    require('fs').writeFileSync(outPath, js, 'utf-8');
    console.log(`\nWrote ${names.length} neighborhoods to neighborhood-polygons.js`);
    console.log('Neighborhoods:', names.join(', '));
    console.log(`\nMatched ${matched.length} NTAs, unmatched ${unmatched.length}:`);
    if (unmatched.length > 0) {
        unmatched.sort().forEach(n => console.log('  - ' + n));
    }
}

main().catch(e => console.error(e));
