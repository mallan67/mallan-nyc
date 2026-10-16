#!/usr/bin/env node
/**
 * compliance:validate — concept-based compliance validator.
 *
 * Replaces the retired RLS field validators. It checks two separate things:
 *
 *   1. Provider contract: every `data-concept` binding on the CRM forms names a live
 *      Cotality field (Property schema or a CustomFields key reached through Property), a
 *      Mallan-local concept, or a compliance rule id; picklist values on bound controls
 *      exist in the live Cotality enum for that field; no NAR-removed compensation field
 *      is bound.
 *   2. Compliance registry (compliance/rules/compliance-concepts.json): each rule cites a
 *      UCBA article or an owner policy, and every Cotality field a rule is bound to exists
 *      in the live contract.
 *
 * The live contract is data/cotality-enums.live.json. Regenerate it from the live API with
 * `npm run cotality:pull`. The REBNY/UCBA rules themselves are enforced by `npm run ucba:audit`.
 *
 * Usage:  node scripts/compliance-validate.js [--json] [--fails]
 * Exit:   0 = no FAIL, 1 = at least one FAIL
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const failsOnly = args.includes('--fails');

const FORMS = [
  'public/crm/SALE-FORM-REDESIGN.html',
  'public/crm/RENTAL-FORM-REDESIGN.html',
  'public/crm/SALE-FORM-WITH-TOOLS.html',
  'public/crm/RENTAL-FORM-WITH-TOOLS.html',
];
const VIEWER_FORMS = new Set([
  'public/crm/SALE-FORM-WITH-TOOLS.html',
  'public/crm/RENTAL-FORM-WITH-TOOLS.html',
]);

const results = [];
function record(level, check, detail) { results.push({ level, check, detail }); }

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
  catch (e) { record('FAIL', `read ${rel}`, e.message); return null; }
}

const contract = readJson('data/cotality-enums.live.json');
const registry = readJson('compliance/rules/compliance-concepts.json');
if (!contract || !registry) finish();

const property = (contract.entities && contract.entities.Property) || {};
const enums = contract.enums || {};
const propertyFields = new Set(Object.keys(property));
const customKeys = new Set((registry.customFieldKeys && registry.customFieldKeys.keys) || []);
const localConcepts = new Set(Object.keys(registry.localConcepts || {}));
const ruleIds = new Set((registry.rules || []).map(r => r.id));
const dispositions = new Set(Object.keys(registry.dispositions || {}));
const removed = new Set((registry.removedProviderFields && registry.removedProviderFields.fields) || []);

record('INFO', 'contract', `${propertyFields.size} Property fields, ${Object.keys(enums).length} enums, pulled ${contract.pulled_at}`);

// Live picklist for a Property field: the enum type the field is declared with.
function livePicklist(field) {
  const type = property[field];
  if (!type) return null;
  const name = String(type).replace(/^Collection\(/, '').replace(/\)$/, '').split('.').pop();
  return enums[name] ? new Set(enums[name]) : null;
}

// ── 1. Registry integrity ────────────────────────────────────────────────
(function checkRegistry() {
  let bound = 0, notExposed = 0, awaiting = 0;
  for (const rule of registry.rules || []) {
    if (!rule.ucba || !String(rule.ucba).trim()) record('FAIL', `rule ${rule.id}`, 'no UCBA citation');
    if (!rule.rule || !String(rule.rule).trim()) record('FAIL', `rule ${rule.id}`, 'no rule text');
    const b = rule.binding || {};
    if (b.status === 'bound') {
      bound++;
      for (const f of b.fields || []) {
        if (!propertyFields.has(f)) record('FAIL', `rule ${rule.id}`, `bound field ${f} is not in the live Cotality Property schema`);
      }
      for (const k of b.customFields || []) {
        if (!customKeys.has(k)) record('FAIL', `rule ${rule.id}`, `custom field ${k} is not in customFieldKeys`);
      }
    } else if (b.status === 'notExposed') {
      notExposed++;
    } else if (b.status === 'awaitingOwner') {
      awaiting++;
      record('WARN', `rule ${rule.id}`, `awaiting owner decision: ${b.detail || ''}`);
      for (const f of b.fields || []) {
        if (!propertyFields.has(f)) record('FAIL', `rule ${rule.id}`, `field ${f} is not in the live Cotality Property schema`);
      }
    } else {
      record('FAIL', `rule ${rule.id}`, `unknown binding status "${b.status}"`);
    }
  }
  for (const p of registry.ownerPolicies || []) {
    if (!p.source) record('FAIL', `policy ${p.id}`, 'no source');
    if (p.ucbaBacked !== false) record('FAIL', `policy ${p.id}`, 'owner policies must declare ucbaBacked:false');
  }
  for (const [role, spec] of Object.entries(registry.locationBindings || {})) {
    if (spec && spec.field && !propertyFields.has(spec.field)) {
      record('FAIL', `location ${role}`, `${spec.field} is not in the live Cotality Property schema`);
    }
  }
  for (const f of removed) {
    if (propertyFields.has(f)) record('INFO', 'removed provider fields', `${f} is still declared in the live schema; it stays unbound on every form`);
  }
  record('PASS', 'registry', `${(registry.rules || []).length} rules: ${bound} bound, ${notExposed} not exposed by Cotality, ${awaiting} awaiting owner`);
})();

// ── 2. Form bindings ─────────────────────────────────────────────────────
function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  const body = tag.replace(/^<[a-zA-Z0-9]+/, '').replace(/\/?>$/, '');
  while ((m = re.exec(body)) !== null) out[m[1]] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
  return out;
}

function checkForm(rel) {
  let html;
  try { html = fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
  catch (e) { record('FAIL', rel, `cannot read: ${e.message}`); return; }

  // Remove script/style bodies so JS strings are not parsed as markup.
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const tagRe = /<(input|select|textarea|option|button|label|div|span|body|[a-z0-9]+)\b[^>]*>/gi;

  const bindings = new Map(); // concept -> {count, values:Set, kinds:Set}
  const unresolved = new Map();
  let total = 0, disposed = 0, badDisposition = 0, removedBound = 0;
  let viewerPolicy = null;
  let currentSelect = null;

  let m;
  while ((m = tagRe.exec(markup)) !== null) {
    const tag = m[0];
    const name = m[1].toLowerCase();
    const a = attrs(tag);

    if (name === 'body' && a['data-viewer-policy'] !== undefined) viewerPolicy = a['data-viewer-policy'];
    if (a['data-concept-disposition'] !== undefined) {
      disposed++;
      if (!dispositions.has(a['data-concept-disposition'])) badDisposition++;
    }

    if (name === 'select') currentSelect = a['data-concept'] || null;
    if (name === 'option' && currentSelect) {
      const entry = bindings.get(currentSelect);
      // hidden/disabled options are not offered to the agent (a hidden option only lets an old stored value display)
      if (entry && a.value && a.hidden === undefined && a.disabled === undefined) entry.values.add(a.value);
      continue;
    }

    const concept = a['data-concept'];
    if (concept === undefined || concept === '') continue;
    total++;
    let entry = bindings.get(concept);
    if (!entry) { entry = { count: 0, values: new Set(), kinds: new Set() }; bindings.set(concept, entry); }
    entry.count++;
    entry.kinds.add(name === 'input' ? `input:${(a.type || 'text').toLowerCase()}` : name);
    if ((name === 'input') && (a.type === 'radio' || a.type === 'checkbox') && a.value) entry.values.add(a.value);
  }

  // Resolve each binding
  const unknown = [];
  for (const concept of bindings.keys()) {
    if (removed.has(concept)) { removedBound++; record('FAIL', rel, `${concept} is a NAR-removed compensation field (UCBA Art. IV Sec. 2) and must not be bound`); continue; }
    if (propertyFields.has(concept) || customKeys.has(concept) || localConcepts.has(concept) || ruleIds.has(concept)) continue;
    unknown.push(concept);
  }
  if (unknown.length) record('FAIL', rel, `${unknown.length} data-concept value(s) are not a live Cotality field, a CustomFields key, a local concept or a rule id: ${unknown.join(', ')}`);
  if (badDisposition) record('FAIL', rel, `${badDisposition} data-concept-disposition value(s) are not declared in compliance-concepts.json`);

  // Picklists: values on bound controls must exist in the live enum for the field.
  const pickMisses = [];
  let pickChecked = 0;
  for (const [concept, entry] of bindings) {
    if (!entry.values.size) continue;
    const live = livePicklist(concept);
    if (!live) continue;
    pickChecked++;
    const missing = [...entry.values].filter(v => !live.has(v));
    if (missing.length) pickMisses.push(`${concept}: ${missing.join(', ')}`);
  }
  if (pickMisses.length) record('FAIL', rel, `picklist values not in the live Cotality enum — ${pickMisses.join(' | ')}`);

  // Viewer pages are read-only.
  if (VIEWER_FORMS.has(rel) && viewerPolicy !== 'read-only') {
    record('FAIL', rel, 'viewer page must declare data-viewer-policy="read-only" on <body>');
  }

  record(unknown.length || pickMisses.length || badDisposition || removedBound ? 'INFO' : 'PASS', rel,
    `${total} bindings, ${bindings.size} distinct concepts, ${pickChecked} picklists checked against live enums, ${disposed} controls marked mallan-internal`);
}

for (const f of FORMS) checkForm(f);

finish();

function finish() {
  const fails = results.filter(r => r.level === 'FAIL').length;
  const warns = results.filter(r => r.level === 'WARN').length;
  if (asJson) {
    process.stdout.write(JSON.stringify({ fails, warns, results }, null, 2) + '\n');
  } else {
    for (const r of results) {
      if (failsOnly && r.level !== 'FAIL') continue;
      console.log(`${r.level.padEnd(4)}  ${r.check}: ${r.detail}`);
    }
    console.log(`\ncompliance:validate — ${fails} FAIL, ${warns} WARN`);
  }
  process.exit(fails ? 1 : 0);
}
