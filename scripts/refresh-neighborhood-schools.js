/**
 * Rebuilds data/neighborhood-schools.json: the school facts shown in the "Schools and Education" section of the
 * neighborhood guides (Master 21.12, 21.11, 23.10).
 *
 * Source (public, read-only, no credentials): NYC Open Data, NYC Department of City Planning "Facilities Database"
 * (ji82-xba5).
 *
 * Scope, stated the same way on the page: facilities in the subgroups PUBLIC K-12 SCHOOLS, CHARTER K-12 SCHOOLS and
 * PUBLIC AND PRIVATE SPECIAL EDUCATION SCHOOLS whose record comes from NYC Department of Education site data
 * (datasource doe_lcgms). Special-education schools are included, so that no group of public schools is left out.
 * Not included: private schools, charter schools that appear only in State Education Department records
 * (nysed_activeinstitutions: administrative addresses, and some repeat a Department of Education site), and a NYCHA
 * community-center record (datasource nycha_communitycenters).
 *
 * Selection rule: every in-scope facility whose ZIP code is one of the ZIP codes the guides list, none omitted,
 * ordered by name. Nothing is ranked, scored or filtered by quality, grade, size, neighborhood or name.
 * This script stops with an error, writing nothing, if any returned record cannot be placed.
 *
 * Run: node scripts/refresh-neighborhood-schools.js
 * tests/runtime/neighborhood-schools.test.ts checks the file against this scope and re-derives each display string
 * from the source string recorded beside it.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'neighborhood-schools.json');
const BOROUGH_FILES = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten-island'];
const DATASET = 'ji82-xba5';
const SUBGROUPS = ['PUBLIC K-12 SCHOOLS', 'CHARTER K-12 SCHOOLS', 'PUBLIC AND PRIVATE SPECIAL EDUCATION SCHOOLS'];
const DATASOURCE = 'doe_lcgms';
const QUERY_LIMIT = 50000;

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
// Names whose usual spelling is not plain capitalisation.
const SPELLING = { LAGUARDIA: 'LaGuardia', DEWITT: 'DeWitt', DEKALB: 'DeKalb', MACDOUGAL: 'MacDougal', PAVE: 'PAVE', SEED: 'SEED', ISCHOOL: 'iSchool' };
// A misspelling in the source record, corrected in the displayed address only. tests/runtime/neighborhood-schools.test.ts applies the same table.
const ADDRESS_WORD_FIXES = { DELANCY: 'DELANCEY' };
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
  let trimmed = source.trim().replace(/\s+/g, ' ');
  // "URBAN ASSEMBLY SCHOOL OF BUSINESS, THE" is how an index files it; the school is called "The Urban Assembly ..."
  if (/, THE$/i.test(trimmed)) trimmed = `THE ${trimmed.replace(/, THE$/i, '')}`;
  const tokens = trimmed.split(' ');
  return tokens
    .map((token, i) => {
      // a parenthesised short run of capitals is an acronym: "(BCAM)"
      if (/^\([A-Z]{2,6}\)$/.test(token)) return token;
      // a small word starts a segment at the first word, after a dash, or after a school number: "P.S. 242 - The ...", "157 The ..."
      const prev = tokens[i - 1] || '';
      const segmentStart = i === 0 || prev === '-' || /\d/.test(prev) || /:$/.test(prev);
      // split on separators but keep them
      const pieces = token.split(/([\-\/()&])/);
      // "-THE CHILDREN'S SCHOOL": a word right after a leading dash also starts a segment
      const afterLeadingDash = (j) => j === 2 && pieces[0] === '' && pieces[1] === '-';
      return pieces
        .map((piece, j) => (/^[\-\/()&]$/.test(piece) ? piece : capitalizePiece(piece, (segmentStart && j === 0) || afterLeadingDash(j))))
        .join('');
    })
    .join(' ');
}

function formatAddress(source) {
  const tokens = source
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((t) => ADDRESS_WORD_FIXES[t.toUpperCase()] || t);
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

function parseFactype(factype) {
  const m = /^(.*) - (PUBLIC|CHARTER)(?:, SPECIAL EDUCATION)?$/.exec(factype || '');
  if (!m || !LEVELS[m[1]]) throw new Error(`factype not understood: "${factype}"`);
  return { level: LEVELS[m[1]], sector: m[2] === 'CHARTER' ? 'charter' : 'public' };
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
  const select = 'uid,facname,address,zipcode,factype,facsubgrp,datasource';
  const url = `https://data.cityofnewyork.us/resource/${DATASET}.json?$select=${select}&$where=${encodeURIComponent(where)}&$limit=${QUERY_LIMIT}`;
  const [rows, meta] = await Promise.all([getJson(url), getJson(`https://data.cityofnewyork.us/api/views/${DATASET}.json`)]);
  if (rows.length >= QUERY_LIMIT) throw new Error('the query hit its row limit; the result may be cut off');

  const byZip = Object.fromEntries(zips.map((z) => [z, []]));
  const bySubgroup = {};
  for (const r of rows) {
    // nothing is dropped: a record that cannot be placed stops the run
    if (!r.uid || !r.facname) throw new Error(`record without uid or name: ${JSON.stringify(r)}`);
    if (!byZip[r.zipcode]) throw new Error(`record outside the guides' ZIP codes: ${JSON.stringify(r)}`);
    if (r.datasource !== DATASOURCE) throw new Error(`record outside the data source: ${JSON.stringify(r)}`);
    const { level, sector } = parseFactype(r.factype);
    const sourceAddress = (r.address || '').trim();
    byZip[r.zipcode].push({
      id: r.uid,
      name: formatName(r.facname),
      // a record with no address stays on the list; the page says "Address not listed"
      address: sourceAddress ? formatAddress(sourceAddress) : '',
      level,
      sector,
      sourceName: r.facname,
      sourceAddress,
      sourceZip: r.zipcode,
      sourceSubgroup: r.facsubgrp,
      sourceFactype: r.factype,
      sourceDatasource: r.datasource,
    });
    bySubgroup[r.facsubgrp] = (bySubgroup[r.facsubgrp] || 0) + 1;
  }
  for (const z of zips) byZip[z].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || a.address.localeCompare(b.address, 'en', { numeric: true }));
  const total = Object.values(byZip).reduce((n, a) => n + a.length, 0);
  if (total !== rows.length) throw new Error(`wrote ${total} of ${rows.length} returned records`);

  const doc = {
    source: {
      publisher: 'NYC Department of City Planning',
      dataset: 'Facilities Database',
      datasetId: DATASET,
      url: `https://data.cityofnewyork.us/d/${DATASET}`,
      recordsUpdated: new Date(meta.rowsUpdatedAt * 1000).toISOString().slice(0, 10),
      retrieved: new Date().toISOString().slice(0, 10),
      scope: `Facilities with subgroup ${SUBGROUPS.join(', ')} whose record comes from NYC Department of Education site data (${DATASOURCE}). Not included: private schools, charter schools that appear only in State Education Department records, and a NYCHA community-center record.`,
      selectionRule: 'Every in-scope facility with one of the ZIP codes the neighborhood guides list, none omitted, ordered by name.',
      recordCount: total,
      bySubgroup,
    },
    zips: byZip,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${zips.length} ZIP codes, ${total} school records (${JSON.stringify(bySubgroup)}), dataset updated ${doc.source.recordsUpdated}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { formatName, formatAddress, parseFactype, ADDRESS_WORD_FIXES };
