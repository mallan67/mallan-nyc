#!/usr/bin/env node
/**
 * Derive the CRM's field contract FROM THE LIVE COTALITY CONTRACT.
 *
 * ONE PIPELINE, ONE ACQUISITION OWNER:
 *
 *   LIVE COTALITY API -> pull-contract.mjs -> data/cotality-contract.live.json
 *                                          -> (this script)  -> CRM subset
 *
 * This script does NOT fetch. scripts/cotality/pull-contract.mjs is the single
 * live-acquisition owner; in verified mode this script RUNS it, so the contract
 * it derives from is always produced in the current verification run. A second
 * fetch implementation would be a second authority.
 *
 * WHY THE PREVIOUS VERSION WAS WRONG. It defaulted to reading
 * artifacts/metadata.xml - a capture dated 2026-06-04 that ALREADY DISAGREES
 * WITH LIVE: it declares OwnerOptOut, which exists on no live Cotality resource.
 * That created a route by which a stale snapshot could silently resurrect
 * retired provider truth and still produce a green validator. A validator can be
 * perfectly green while validating the wrong provider model; the generation
 * chain has to make that impossible, not merely unlikely.
 *
 * THREE STATES, NEVER COLLAPSED:
 *
 *   VERIFIED_LIVE      the contract came from api.cotality.com in this run
 *   PROVIDER_REJECTED  the provider answered, and refused
 *   UNVERIFIED         anything else - auth failure, no network, offline input
 *
 * UNVERIFIED IS NEVER SUCCESS. Offline mode exists for diagnostics only: it
 * cannot write the canonical contract path and it stamps its output UNVERIFIED.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';

const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const OFFLINE = args.includes('--offline-unverified');
/**
 * Skip RE-ACQUISITION only. Every verification gate below still applies, so this
 * cannot be used to smuggle a stale contract through: a fixture with the wrong
 * source host or an old pulled_at still fails. It exists so the negative tests can
 * prove those gates actually fire.
 */
const NO_ACQUIRE = args.includes('--no-acquire');

/** Set when this run mints an acquisition id; the contract must return it. */
let expectedRunId = null;

const LIVE_CONTRACT = argOf('--live-contract') || 'data/cotality-contract.live.json';
const CANONICAL_OUT = 'data/cotality-contract/crm-field-contract.json';
const OUT = argOf('--out') || CANONICAL_OUT;
const MAP_SOURCE = argOf('--map') || 'public/crm/js/core/cotality-field-map.js';
const CRM_ROOT = 'public/crm';
const SCRIPT_ROOT = 'scripts/cotality';

/** Resources the CRM is allowed to reference, in precedence order. */
const RESOURCES = ['Property', 'Media'];

/** The one live host. A contract sourced from anywhere else is not authority. */
const REQUIRED_HOST = 'api.cotality.com';

/** How recently the live contract must have been pulled, in verified mode. */
const MAX_AGE_MS = 15 * 60 * 1000;

function die(state, message) {
  console.error('[crm-field-contract] ' + state + ': ' + message);
  process.exit(1);
}

// -- Acquire ---------------------------------------------------------------
if (OFFLINE) {
  if (path.resolve(OUT) === path.resolve(CANONICAL_OUT)) {
    die(
      'UNVERIFIED',
      'refusing to write the canonical contract from offline input. ' +
        'Offline mode is for diagnostics; pass --out with a scratch path.',
    );
  }
  console.error('[crm-field-contract] UNVERIFIED: offline mode, output is NOT authority');
} else if (!NO_ACQUIRE) {
  // Re-acquire through the single owner so the contract is provably from this run.
  // The run id is minted HERE and required to come back in the written contract,
  // so a contract left over from any earlier run cannot satisfy this derivation -
  // freshness alone would still admit one pulled minutes ago by something else.
  expectedRunId = randomUUID();
  try {
    execFileSync(process.execPath, [path.join(SCRIPT_ROOT, 'pull-contract.mjs')], {
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, COTALITY_RUN_ID: expectedRunId },
    });
  } catch {
    die('UNVERIFIED', 'live acquisition failed - see pull-contract output above. No fallback exists.');
  }
}

if (!fs.existsSync(LIVE_CONTRACT)) {
  die('UNVERIFIED', LIVE_CONTRACT + ' absent. Run npm run cotality:pull-contract.');
}
const live = JSON.parse(fs.readFileSync(LIVE_CONTRACT, 'utf8'));

// -- Verify the contract really is live ------------------------------------
if (!OFFLINE) {
  let host = '';
  try {
    host = new URL(live.source).host;
  } catch {
    die('UNVERIFIED', 'live contract has no parseable source: ' + live.source);
  }
  if (host !== REQUIRED_HOST) {
    die('UNVERIFIED', 'live contract source host is ' + host + ', not ' + REQUIRED_HOST);
  }
  // An acquisition id must exist at all. A contract without one predates the
  // current-run guarantee and cannot prove where it came from.
  if (typeof live.run_id !== 'string' || live.run_id.length === 0) {
    die('UNVERIFIED', 'live contract carries no acquisition run id');
  }
  if (expectedRunId !== null && live.run_id !== expectedRunId) {
    die(
      'UNVERIFIED',
      'live contract run_id does not match the acquisition just performed. ' +
        'The contract on disk was not produced by this run.',
    );
  }
  const age = Date.now() - Date.parse(live.pulled_at || '');
  if (!Number.isFinite(age)) die('UNVERIFIED', 'live contract has no usable pulled_at');
  if (age > MAX_AGE_MS) {
    die('UNVERIFIED', 'live contract is ' + Math.round(age / 60000) +
      ' minutes old; it must be pulled in this run.');
  }
}

// -- What the CRM actually consumes ----------------------------------------

/** Provider field names the CRM map targets. */
function mapTargets(file) {
  if (!fs.existsSync(file)) die('UNVERIFIED', 'CRM map not found: ' + file);
  const src = fs.readFileSync(file, 'utf8');
  const out = new Set();
  const rx = /^\s+[A-Za-z0-9_]+:\s*'([^']+)'/gm;
  let m;
  while ((m = rx.exec(src)) !== null) {
    // A computed pseudo-field like 'A+B' references its operands, not itself.
    for (const part of m[1].split('+')) out.add(part.trim());
  }
  return out;
}

/** Provider field names templates tag onto elements directly, bypassing the map. */
function taggedFieldNames(dir, acc = new Set()) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') taggedFieldNames(full, acc);
      continue;
    }
    if (!/\.(js|html)$/.test(e.name) || e.name === 'index-built.html') continue;
    const src = fs.readFileSync(full, 'utf8');
    const rx = /data-cotality-field=["']([^"']+)["']/g;
    let m;
    // Mallan-derived presentation keys are lowercase and are not provider claims.
    while ((m = rx.exec(src)) !== null) if (/^[A-Z]/.test(m[1])) acc.add(m[1]);
  }
  return acc;
}

/**
 * Provider field names the diagnostic scripts put into OData $filter expressions.
 *
 * A census query naming a field the provider does not declare returns HTTP 400,
 * and odataCount turns that into null - so the metric reads as "unverified"
 * forever and looks like a tooling gap rather than a fabricated field.
 */
function filteredFieldNames(dir, acc = new Set()) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { filteredFieldNames(full, acc); continue; }
    if (!/\.(js|mjs)$/.test(e.name)) continue;
    const src = fs.readFileSync(full, 'utf8');
    const rx = /\b([A-Z][A-Za-z0-9_]{2,})\s+(eq|ne|gt|ge|lt|le)\s/g;
    let m;
    while ((m = rx.exec(src)) !== null) acc.add(m[1]);
  }
  return acc;
}

const consumed = [
  ...new Set([
    ...mapTargets(MAP_SOURCE),
    ...taggedFieldNames(CRM_ROOT),
    ...filteredFieldNames(SCRIPT_ROOT),
  ]),
].sort();

// -- Derive ----------------------------------------------------------------
const fields = {};
const rejected = {};
const ambiguous = {};
/** bare CRM field name -> the one qualified identity it resolves to */
const resolution = {};

for (const name of consumed) {
  const owners = [];
  for (const resource of RESOURCES) {
    const rt = live.entityTypes && live.entityTypes[resource];
    if (!rt) die('UNVERIFIED', 'live contract has no ' + resource + ' entity type');
    if (rt.properties && rt.properties[name]) owners.push([resource, rt.properties[name]]);
    else if (rt.navigation && rt.navigation[name]) owners.push([resource, rt.navigation[name]]);
  }
  if (owners.length === 0) {
    rejected[name] = 'not declared on any live resource: ' + RESOURCES.join(', ');
    continue;
  }
  const resource = owners[0][0];
  const decl = owners[0][1];
  const qualified = resource + '.' + name;

  // RESOURCE-QUALIFIED IDENTITY. A bare field name is not an identity: Media
  // denormalises several Property fields, so the same name exists on two
  // resources with two owners. Keys are therefore Resource.Field, and the bare
  // name resolves through `resolution` below.
  //
  // Precedence is Property first, and that is a DECISION with a reason rather
  // than an accident of ordering: the CRM's listing map is Property-scoped, and
  // where Media repeats a listing-level fact (StandardStatus, PropertyType,
  // InternetEntireListingDisplayYN, ModificationTimestamp, PropertySubType,
  // SyndicateTo) the listing is the owner and Media is the copy. A tag that
  // genuinely means the Media copy must qualify itself.
  if (owners.length > 1) {
    ambiguous[name] = {
      declaredOn: owners.map((o) => o[0]),
      resolvedTo: qualified,
      reason: 'Property owns listing-level facts; Media denormalises them',
    };
  }
  resolution[name] = qualified;
  fields[qualified] = Object.assign({}, decl, { resource, field: name });

  // An enum a consumer relies on must be verifiable, or its value space is unknown.
  if (decl.kind === 'enum') {
    const members = live.enums && live.enums[decl.enumType];
    if (!Array.isArray(members) || members.length === 0) {
      rejected[name] = 'enum ' + decl.enumType + ' has no verifiable members in the live contract';
      delete fields[qualified];
      delete resolution[name];
      continue;
    }
    fields[qualified].memberCount = members.length;
  }
}

const state = OFFLINE ? 'UNVERIFIED' : 'VERIFIED_LIVE';
const contract = {
  $comment:
    'GENERATED - do not hand-edit. Regenerate with npm run cotality:crm-contract. ' +
    'Derived from the live Cotality contract; the live API is the only authority. ' +
    'This file is a checkable projection of it, never a substitute.',
  verificationState: state,
  derivedFrom: LIVE_CONTRACT,
  liveSource: live.source,
  livePulledAt: live.pulled_at,
  liveRunId: live.run_id || null,
  resources: RESOURCES,
  fieldCount: Object.keys(fields).length,
  fields,
  resolution,
  ambiguousOwnership: ambiguous,
  rejected,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(contract, null, 2) + '\n');
console.log('[crm-field-contract] ' + state + ': ' + Object.keys(fields).length + ' fields -> ' + OUT);

let failed = false;
if (Object.keys(rejected).length) {
  console.error('[crm-field-contract] REJECTED - the CRM names these, the live API does not declare them:');
  for (const k of Object.keys(rejected)) console.error('    ' + k + ' - ' + rejected[k]);
  failed = true;
}
if (Object.keys(ambiguous).length) {
  console.error('[crm-field-contract] AMBIGUOUS resource ownership:');
  for (const k of Object.keys(ambiguous)) console.error('    ' + k + ' - declared on ' + ambiguous[k].declaredOn.join(' and ') + ' -> ' + ambiguous[k].resolvedTo);
}
if (failed) process.exit(2);
