/**
 * Rebuilds data/neighborhood-schools.json: the school facts shown in the "Schools and Education" section of the
 * neighborhood guides (Master 21.12, 21.11, 23.10).
 *
 * Source (public, read-only, no credentials): NYC Open Data, NYC Department of City Planning "Facilities Database"
 * (ji82-xba5). Scope: facilities whose subgroup is PUBLIC K-12 SCHOOLS or CHARTER K-12 SCHOOLS and whose record comes
 * from the NYC Department of Education site data (datasource doe_lcgms). The State Education Department's
 * institution records (nysed_activeinstitutions) are left out: their addresses are administrative (room numbers,
 * abbreviations) and some repeat a Department of Education site. A NYCHA community-center record is left out too.
 *
 * Selection rule: every in-scope facility whose ZIP code is one of the ZIP codes the guides list, none omitted,
 * ordered by name. Nothing is ranked, scored or filtered by quality, grade, size or neighborhood.
 *
 * Run: node scripts/refresh-neighborhood-schools.js
 * The test tests/runtime/neighborhood-schools.test.ts checks the file against this scope and re-derives each
 * display string from its recorded source string.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'neighborhood-schools.json');
const BOROUGH_FILES = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten-island'];
const DATASET = 'ji82-xba5';
const SUBGROUPS = ['PUBLIC K-12 SCHOOLS', 'CHARTER K-12 SCHOOLS'];
const DATASOURCE = 'doe_lcgms';
const EXCLUDED_FACTYPES = ['NYCHA COMMUNITY CENTER - SCHOOL'];

const LEVELS = {
  'ELEMENTARY SCHOOL': 'Elementary',
  'JUNIOR HIGH-INTERMEDIATE-MIDDLE SCHOOL': 'Middle',
  'HIGH SCHOOL': 'High',
  'K-8 SCHOOL': 'K-8',
  'SECONDARY SCHOOL': 'Secondary',
  'K-12 ALL GRADES SCHOOL': 'K-12',
  'UNGRADED SCHOOL': 'Ungraded',
};

// Words that stay in capitals when a source name is all capitals.
const KEEP_UPPER = new Set(['NYC', 'NYU', 'CUNY', 'STEM', 'STEAM', 'KIPP', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'FDR', 'JFK', 'CSI', 'CSD', 'EBC', 'BCAM', 'BEES', 'AECI', 'TAG', 'HS', 'MS', 'PS', 'LGBT', 'SUNY', 'USA', 'BQE', 'CMS', 'ELA', 'PM', 'MLK']);
// Names whose usual spelling has a capital inside the word.
const SPELLING = { LAGUARDIA: 'LaGuardia', DEWITT: 'DeWitt', DEKALB: 'DeKalb', MACDOUGAL: 'MacDougal' };
const SMALL = new Set(['of', 'and', 'for', 'the', 'in', 'at', 'on', 'to', 'a', 'an']);
const STREET_TYPES = new Set(['STREET', 'AVENUE', 'PLACE', 'ROAD', 'DRIVE', 'LANE', 'COURT', 'TERRACE', 'BOULEVARD', 'PARKWAY', 'WAY', 'ROW']);

function ordinal(n) {
  const v = Number(n);
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th'}`;
}

function capitalizePiece(piece, first) {
  if (!piece) return piece;
  const upper = piece.toUpperCase();
  // abbreviations with dots (P.S., I.S., M.S., J.H.S., A.) keep their capitals
  if (/^(?:[A-Z]\.)+$/.test(upper)) return upper;
  if (/^(?:P\.?S\.?|I\.?S\.?|M\.?S\.?|J\.?H\.?S\.?|H\.?S\.?)$/.test(upper) && /\./.test(piece)) return upper;
  if (KEEP_UPPER.has(upper)) return upper;
  if (SPELLING[upper]) return SPELLING[upper];
  // digits: drop leading zeros, keep a trailing school letter in capitals ("078Q" -> "78Q"), lower an ordinal suffix
  if (/\d/.test(piece)) {
    const stripped = upper.replace(/^0+(?=\d)/, '');
    return stripped.replace(/^(\d+)(ST|ND|RD|TH)$/, (m, d, s) => d + s.toLowerCase());
  }
  const lower = piece.toLowerCase();
  if (!first && SMALL.has(lower)) return lower;
  if (/^mc[a-z]{2,}$/.test(lower)) return `Mc${lower[2].toUpperCase()}${lower.slice(3)}`;
  if (/^[a-z]'[a-z]+$/.test(lower)) return `${lower[0].toUpperCase()}'${lower[2].toUpperCase()}${lower.slice(3)}`;
  return lower[0].toUpperCase() + lower.slice(1);
}

function formatName(source) {
  const trimmed = source.trim().replace(/\s+/g, ' ');
  const hasLower = /[a-z]/.test(trimmed);
  const tokens = trimmed.split(' ');
  return tokens
    .map((token, i) => {
      if (hasLower) return token.replace(/^0+(?=\d)/, '');
      // a parenthesised short run of capitals is an acronym: "(BCAM)"
      if (/^\([A-Z]{2,6}\)$/.test(token)) return token;
      // a small word starts a segment at the first word, after a dash, or after a school number: "P.S. 242 - The ...", "157 The ..."
      const prev = tokens[i - 1] || '';
      const segmentStart = i === 0 || prev === '-' || /\d/.test(prev) || /:$/.test(prev);
      // split on separators but keep them
      return token
        .split(/([\-\/()&])/)
        .map((piece, j) => (/^[\-\/()&]$/.test(piece) ? piece : capitalizePiece(piece, segmentStart && j === 0)))
        .join('');
    })
    .join(' ');
}

function formatAddress(source) {
  const tokens = source.trim().replace(/\s+/g, ' ').split(' ');
  return tokens
    .map((token, i) => {
      const upper = token.toUpperCase();
      const next = (tokens[i + 1] || '').toUpperCase();
      // a bare number directly before a street type, after a house number or a direction, is a numbered street
      if (/^\d+$/.test(token) && STREET_TYPES.has(next) && i > 0) return ordinal(token);
      if (KEEP_UPPER.has(upper)) return upper;
      if (/\d/.test(token)) return upper;
      return capitalizePiece(token, i === 0);
    })
    .join(' ');
}

function guideZipCodes() {
  const zips = new Set();
  for (const b of BOROUGH_FILES) {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${b}-neighborhoods.json`), 'utf8'));
    for (const n of Array.isArray(doc) ? doc : doc.neighborhoods) for (const z of n.zipCodes) zips.add(z);
  }
  return [...zips].sort();
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}: ${body.slice(0, 200)}`));
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function main() {
  const zips = guideZipCodes();
  const q = (s) => `'${s}'`;
  const where = `facsubgrp in(${SUBGROUPS.map(q).join(',')}) AND datasource=${q(DATASOURCE)} AND zipcode in(${zips.map(q).join(',')})`;
  const select = 'uid,facname,address,zipcode,factype,facsubgrp';
  const url = `https://data.cityofnewyork.us/resource/${DATASET}.json?$select=${select}&$where=${encodeURIComponent(where)}&$limit=50000`;
  const [rows, meta] = await Promise.all([getJson(url), getJson(`https://data.cityofnewyork.us/api/views/${DATASET}.json`)]);

  const byZip = Object.fromEntries(zips.map((z) => [z, []]));
  for (const r of rows) {
    if (EXCLUDED_FACTYPES.includes(r.factype) || !r.facname || !r.address) continue;
    const sector = r.facsubgrp === 'CHARTER K-12 SCHOOLS' ? 'charter' : 'public';
    const levelKey = r.factype.replace(/ - (PUBLIC|CHARTER)$/, '');
    byZip[r.zipcode].push({
      id: r.uid,
      name: formatName(r.facname),
      address: formatAddress(r.address),
      level: LEVELS[levelKey] || '',
      sector,
      sourceName: r.facname,
      sourceAddress: r.address,
    });
  }
  for (const z of zips) byZip[z].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || a.address.localeCompare(b.address, 'en', { numeric: true }));

  const doc = {
    source: {
      publisher: 'NYC Department of City Planning',
      dataset: 'Facilities Database',
      datasetId: DATASET,
      url: `https://data.cityofnewyork.us/d/${DATASET}`,
      recordsUpdated: new Date(meta.rowsUpdatedAt * 1000).toISOString().slice(0, 10),
      retrieved: new Date().toISOString().slice(0, 10),
      scope: `Facilities with subgroup ${SUBGROUPS.join(' or ')} whose record comes from NYC Department of Education site data (${DATASOURCE}).`,
      selectionRule: 'Every in-scope facility with one of the ZIP codes the neighborhood guides list, none omitted, ordered by name.',
    },
    zips: byZip,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
  const total = Object.values(byZip).reduce((n, a) => n + a.length, 0);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${zips.length} ZIP codes, ${total} school records, source updated ${doc.source.recordsUpdated}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { formatName, formatAddress };
