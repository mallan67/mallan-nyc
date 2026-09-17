// COTALITY AUTHORITY — MECHANICAL IMPACT GRAPH.
//
// Maya, 2026-09-08: "Agents may NOT propose dependency edges as authority. Derive impact mechanically
// from: Cotality typed field → verified semantic binding → AST/runtime code bindings → storage/rules →
// Search → UI → Saved Search → Map → Reports → CMA. Anything not mechanically proven stays UNVERIFIED."
//
// Everything here is derived from the TypeScript PROGRAM (tsconfig.json), with the type checker:
//
//   HOP 1  provider field → Mallan node       dataflow inside lib/idx/trestle-mapper.ts:
//          `raw.X` reads (through local consts and callee bodies) → the returned column;
//          pick(raw, B<n>) → the JSON column each list feeds (address / features / agent_info);
//          RAW_DATA_KEEP_FIELDS → listings.raw_data.X;  spread of a helper's return object →
//          the helper's per-property param-key reads (typedAgentColumnsFromJson).
//   HOP 2  Mallan node → every reader         property accesses / Prisma select-where-orderBy keys
//          whose object or contextual type the CHECKER resolves to the Prisma Listing model
//          (tier `typed`); JSON-key reads on a Prisma-typed container (tier `typed`); reads on a
//          same-named untyped alias (tier `name-matched`); enum-member string literals whose
//          contextual type is the generated union (tier `typed`) else `string-literal`;
//          public/crm/js word matches (tier `crm-js`).
//   HOP 3  reader file → surfaces             declared path rules (lib.mjs SURFACE_RULES) for the
//          file itself (direct) and for its transitive importers (transitive).
//
// Nothing is inferred from a field's name or an agent's opinion. Tiers make the proof level explicit.

import path from 'node:path';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import ts from 'typescript';
import { ROOT, classifySurface, repairOrder } from './lib.mjs';

const MAPPER = 'lib/idx/trestle-mapper.ts';
const KEEP_LIST = 'lib/compliance/raw-data-keep-fields.ts';
const GENERATED = 'lib/cotality/generated/contract.ts';

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}
function isRepoSource(file) {
  const f = rel(file);
  if (f.startsWith('..') || f.includes('node_modules/') || f.startsWith('.next/')) return false;
  if (/(^|\/)__tests__\//.test(f) || /(^|\/)__type-tests__\//.test(f) || /\.test\.tsx?$/.test(f) || f.startsWith('tests/')) return false;
  return f.startsWith('lib/') || f.startsWith('app/');
}
function lineOf(node) {
  const sf = node.getSourceFile();
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}
function site(node) {
  return { file: rel(node.getSourceFile().fileName), line: lineOf(node) };
}

// ── Program ────────────────────────────────────────────────────────────────

export function createProgram() {
  const cfgPath = path.join(ROOT, 'tsconfig.json');
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  if (cfg.error) throw new Error(`tsconfig: ${ts.flattenDiagnosticMessageText(cfg.error.messageText, '\n')}`);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true, skipLibCheck: true } });
  const checker = program.getTypeChecker();
  const files = new Map();
  for (const sf of program.getSourceFiles()) if (isRepoSource(sf.fileName)) files.set(rel(sf.fileName), sf);
  return { program, checker, files, options: parsed.options };
}

// ── Prisma model resolution (mechanical) ───────────────────────────────────

const PRISMA_SUFFIX = /^(\w+?)(Select|Include|Omit|WhereInput|WhereUniqueInput|OrderByWithRelationInput|OrderByWithAggregationInput|OrderByInput|CreateInput|UncheckedCreateInput|UpdateInput|UncheckedUpdateInput|CreateManyInput|UpdateManyMutationInput|UncheckedUpdateManyInput|ScalarWhereInput|ScalarWhereWithAggregatesInput|CountAggregateInputType|AvgAggregateInputType|SumAggregateInputType|MinAggregateInputType|MaxAggregateInputType|CountAggregateOutputType|AvgAggregateOutputType|SumAggregateOutputType|MinAggregateOutputType|MaxAggregateOutputType|GroupByOutputType|CountOutputType|ScalarFieldEnum|DefaultArgs|GetPayload|CreateManyAndReturnOutputType|UpdateManyAndReturnOutputType)$/;

function isPrismaFile(fileName) {
  const f = fileName.replace(/\\/g, '/');
  return f.includes('/.prisma/client/') || f.includes('/@prisma/client/');
}

/** The Prisma model a property symbol belongs to ('Listing', 'ListingSearchProjection', …) or null. */
function prismaModelOfSymbol(sym) {
  const decls = sym?.declarations || (sym?.valueDeclaration ? [sym.valueDeclaration] : []);
  for (const decl of decls) {
    if (!isPrismaFile(decl.getSourceFile().fileName)) continue;
    let n = decl.parent;
    while (n) {
      if ((ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name) {
        const name = n.name.text;
        const payload = /^\$(\w+)Payload$/.exec(name);
        if (payload) return payload[1];
        const m = PRISMA_SUFFIX.exec(name);
        if (m) return m[1];
        return null;
      }
      n = n.parent;
    }
  }
  return null;
}

function propertyOfType(checker, type, name) {
  if (!type) return null;
  try {
    const direct = checker.getPropertyOfType(type, name);
    if (direct) return direct;
    if (type.isUnion?.()) for (const t of type.types) { const p = checker.getPropertyOfType(t, name); if (p) return p; }
  } catch { /* fall through */ }
  return null;
}

/** Model name if `obj.name` resolves through the checker to a Prisma model column, else null. */
function prismaModelOfAccess(checker, objectExpr, name) {
  let type;
  try { type = checker.getTypeAtLocation(objectExpr); } catch { return null; }
  if (!type) return null;
  const prop = propertyOfType(checker, type, name);
  return prop ? prismaModelOfSymbol(prop) : null;
}

function prismaModelOfObjectKey(checker, objectLiteral, name) {
  let ctx;
  try { ctx = checker.getContextualType(objectLiteral); } catch { return null; }
  if (!ctx) return null;
  const prop = propertyOfType(checker, ctx, name);
  return prop ? prismaModelOfSymbol(prop) : null;
}

/**
 * Shape of a Prisma model resolved from the generated client (never declared by hand):
 *   scalars    column names (from `$<Model>Payload.scalars`)
 *   json       the subset whose type is JsonValue
 *   relations  relation name → target model (from `$<Model>Payload.objects`)
 */
const shapeCache = new Map();
function prismaModelShape(program, model) {
  if (shapeCache.has(model)) return shapeCache.get(model);
  const shape = { scalars: new Set(), json: new Set(), relations: new Map() };
  for (const sf of program.getSourceFiles()) {
    if (!isPrismaFile(sf.fileName)) continue;
    const visit = (n) => {
      if (ts.isTypeAliasDeclaration(n) && n.name.text === `$${model}Payload` && n.type && ts.isTypeLiteralNode(n.type)) {
        for (const member of n.type.members) {
          if (!ts.isPropertySignature(member) || !member.name || !ts.isIdentifier(member.name) || !member.type) continue;
          const section = member.name.text; // name | objects | scalars | composites
          const collect = (m) => {
            if (ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name) && m.type) {
              const text = m.type.getText(sf);
              if (section === 'scalars') { shape.scalars.add(m.name.text); if (/JsonValue/.test(text)) shape.json.add(m.name.text); }
              if (section === 'objects') { const t = /\$(\w+)Payload/.exec(text); if (t) shape.relations.set(m.name.text, t[1]); }
            }
            ts.forEachChild(m, collect);
          };
          collect(member.type);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  shapeCache.set(model, shape);
  return shape;
}
function prismaJsonColumns(program, checker, model) {
  void checker;
  return prismaModelShape(program, model).json;
}

/** The Prisma model of a delegate receiver (`prisma.listing`, `tx.listing`) or null. */
function prismaDelegateModel(checker, receiverExpr) {
  let type;
  try { type = checker.getTypeAtLocation(receiverExpr); } catch { return null; }
  const name = type?.symbol?.name || type?.aliasSymbol?.name || '';
  const m = /^(\w+)Delegate$/.exec(name);
  return m ? m[1] : null;
}

/** The Prisma model named by a type node such as `Prisma.ListingWhereInput` / `Prisma.ListingSelect`, or null. */
function prismaModelOfTypeNode(typeNode) {
  if (!typeNode) return null;
  const text = typeNode.getText().replace(/^Prisma\./, '').replace(/<.*$/, '');
  const m = PRISMA_SUFFIX.exec(text);
  return m ? m[1] : null;
}

/**
 * Walk a Prisma query-argument object literal with the model in scope: relation keys switch the
 * model to the relation's target; scalar keys are hits; structural keys (where/select/orderBy/data/
 * OR/AND/NOT/some/every/none/is/isNot/create/update/upsert/connect…) keep the model.
 */
function walkPrismaArgs(program, node, model, onHit) {
  const shape = prismaModelShape(program, model);
  if (ts.isObjectLiteralExpression(node)) {
    for (const p of node.properties) {
      if (ts.isSpreadAssignment(p)) { walkPrismaArgs(program, p.expression, model, onHit); continue; }
      const key = (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) ? p.name.text : null;
      if (!key) continue;
      if (shape.relations.has(key)) {
        if (ts.isPropertyAssignment(p)) walkPrismaArgs(program, p.initializer, shape.relations.get(key), onHit);
        continue;
      }
      if (shape.scalars.has(key)) onHit(model, key, p);
      if (ts.isPropertyAssignment(p)) walkPrismaArgs(program, p.initializer, model, onHit);
    }
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const e of node.elements) walkPrismaArgs(program, e, model, onHit);
  } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression?.(node)) {
    walkPrismaArgs(program, node.expression, model, onHit);
  } else if (ts.isConditionalExpression(node)) {
    walkPrismaArgs(program, node.whenTrue, model, onHit);
    walkPrismaArgs(program, node.whenFalse, model, onHit);
  }
}

// ── HOP 1: mapper dataflow ─────────────────────────────────────────────────

export function stringArray(node) {
  if (!node || !ts.isArrayLiteralExpression(node)) return null;
  const out = [];
  for (const e of node.elements) if (ts.isStringLiteralLike(e)) out.push({ name: e.text, node: e });
  return out;
}

/** `const NAME = cotalityFields('Property', [...])` and plain string arrays at top level. */
export function topLevelLists(sf) {
  const lists = new Map();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      let arr = null;
      if (ts.isCallExpression(d.initializer) && ts.isIdentifier(d.initializer.expression) && d.initializer.expression.text === 'cotalityFields') arr = d.initializer.arguments[1];
      else if (ts.isArrayLiteralExpression(d.initializer)) arr = d.initializer;
      else if (ts.isAsExpression(d.initializer) && ts.isArrayLiteralExpression(d.initializer.expression)) arr = d.initializer.expression;
      const items = stringArray(arr);
      if (items) lists.set(d.name.text, items);
    }
  }
  return lists;
}

function findFunction(sf, name) {
  for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st;
  return null;
}

function resolveFunctionDecl(checker, expr) {
  if (!ts.isIdentifier(expr)) return null;
  let sym = checker.getSymbolAtLocation(expr);
  if (!sym) return null;
  if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
  for (const d of sym.declarations || []) {
    if (ts.isFunctionDeclaration(d) && d.body) return d;
    if (ts.isVariableDeclaration(d) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) return d.initializer;
  }
  return null;
}

/** `(x as T)`, `(x)`, `x!` → x. Call arguments are routinely cast; the identity underneath is what binds. */
function unwrapExpr(e) {
  let x = e;
  while (x && (ts.isAsExpression(x) || ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x) || ts.isTypeAssertionExpression?.(x) || ts.isSatisfiesExpression?.(x))) x = x.expression;
  return x;
}

function localsOf(fn) {
  const locals = new Map();
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) locals.set(n.name.text, n.initializer);
    ts.forEachChild(n, visit);
  };
  if (fn.body) visit(fn.body);
  return locals;
}

function paramNames(fn) {
  return fn.parameters.map((p) => (ts.isIdentifier(p.name) ? p.name.text : null));
}

/** Property names accessed on `paramName` (or on locals aliasing it) inside `fn`. */
function keysAccessedOnParam(fn, paramName, depth = 0) {
  const keys = new Map(); // key -> node
  const locals = localsOf(fn);
  const aliases = new Set([paramName]);
  // one pass of alias discovery: const ai = (agentInfo ?? {}) as X; const r = param;
  for (const [name, init] of locals) {
    const roots = new Set();
    const walk = (n) => { if (ts.isIdentifier(n)) roots.add(n.text); ts.forEachChild(n, walk); };
    walk(init);
    if (roots.has(paramName) && !ts.isCallExpression(init)) aliases.add(name);
  }
  const visit = (n) => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && aliases.has(n.expression.text)) keys.set(n.name.text, n);
    if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) && aliases.has(n.expression.text) && ts.isStringLiteralLike(n.argumentExpression)) keys.set(n.argumentExpression.text, n);
    ts.forEachChild(n, visit);
  };
  if (fn.body) visit(fn.body);
  return keys;
}

/**
 * Per returned property of `fn`: the param-keys its initializer reads (for spread helpers such as
 * typedAgentColumnsFromJson). Returns Map<returnedProp, Map<paramIndex, Set<key>>>.
 */
function returnSummary(fn) {
  const out = new Map();
  const params = paramNames(fn);
  const locals = localsOf(fn);
  let ret = null;
  const findReturn = (n) => { if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) ret = n.expression; else ts.forEachChild(n, findReturn); };
  if (fn.body) findReturn(fn.body);
  if (!ret) return out;
  const aliasOf = new Map(); // local -> paramIndex
  for (const [name, init] of locals) {
    const roots = [];
    const walk = (n) => { if (ts.isIdentifier(n)) roots.push(n.text); ts.forEachChild(n, walk); };
    walk(init);
    for (const r of roots) { const i = params.indexOf(r); if (i >= 0 && !ts.isCallExpression(init)) aliasOf.set(name, i); }
  }
  for (const p of ret.properties) {
    if (!ts.isPropertyAssignment(p) || !p.name) continue;
    const prop = ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name) ? p.name.text : null;
    if (!prop) continue;
    const byParam = new Map();
    const visit = (n) => {
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
        const i = params.indexOf(n.expression.text) >= 0 ? params.indexOf(n.expression.text) : aliasOf.get(n.expression.text);
        if (i != null && i >= 0) { if (!byParam.has(i)) byParam.set(i, new Set()); byParam.get(i).add(n.name.text); }
      }
      ts.forEachChild(n, visit);
    };
    visit(p.initializer);
    out.set(prop, byParam);
  }
  return out;
}

/**
 * Analyze the mapper: returns
 *   bindings: Map<'Property.X', Array<{ node, sites: [{file,line}], via }>>
 *   fetched:  Set<'Property.X'> — names in the IDX Plus select union (all B lists)
 */
export function analyzeMapper(ctx) {
  const { checker, files } = ctx;
  const sf = files.get(MAPPER);
  if (!sf) throw new Error(`UNVERIFIED: ${MAPPER} not in program`);
  const lists = topLevelLists(sf);
  const fetched = new Set();
  for (const [name, items] of lists) if (/^B\d+_/.test(name)) for (const it of items) fetched.add(`Property.${it.name}`);

  const bindings = new Map();
  const add = (field, node, siteNode, via) => {
    const key = `Property.${field}`;
    if (!bindings.has(key)) bindings.set(key, []);
    const arr = bindings.get(key);
    const s = site(siteNode);
    const existing = arr.find((b) => b.node === node);
    if (existing) { if (!existing.sites.some((x) => x.file === s.file && x.line === s.line)) existing.sites.push(s); }
    else arr.push({ node, sites: [s], via });
  };

  // Keep-list → listings.raw_data.X
  const keep = files.get(KEEP_LIST);
  if (keep) {
    const kl = topLevelLists(keep).get('RAW_DATA_KEEP_FIELDS');
    for (const it of kl || []) add(it.name, `listings.raw_data.${it.name}`, it.node, 'RAW_DATA_KEEP_FIELDS');
  }

  const fn = findFunction(sf, 'mapTrestleToPrisma');
  if (!fn) throw new Error('UNVERIFIED: mapTrestleToPrisma not found');
  const locals = localsOf(fn);
  const params = paramNames(fn);
  const jsonColumns = prismaJsonColumns(ctx.program, checker, 'Listing');

  // Raw-payload aliases: the parameter, and locals whose initializer is an alias-preserving call/spread of it.
  const rawAliases = new Set(params.filter(Boolean));
  const aliasPreserving = (calleeDecl) => {
    if (!calleeDecl?.body) return false;
    const [p0] = paramNames(calleeDecl);
    if (!p0) return false;
    let preserving = false;
    const visit = (n) => {
      if (ts.isSpreadAssignment(n) && ts.isIdentifier(n.expression) && n.expression.text === p0) preserving = true;
      if (ts.isReturnStatement(n) && n.expression && ts.isIdentifier(n.expression) && n.expression.text === p0) preserving = true;
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'entries' && n.arguments[0] && ts.isIdentifier(n.arguments[0]) && n.arguments[0].text === p0) preserving = true;
      ts.forEachChild(n, visit);
    };
    visit(calleeDecl.body);
    return preserving;
  };
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, init] of locals) {
      if (rawAliases.has(name)) continue;
      if (ts.isIdentifier(init) && rawAliases.has(init.text)) { rawAliases.add(name); grew = true; continue; }
      if (ts.isCallExpression(init) && init.arguments.length === 1 && ts.isIdentifier(init.arguments[0]) && rawAliases.has(init.arguments[0].text)) {
        const decl = resolveFunctionDecl(checker, init.expression);
        if (decl && aliasPreserving(decl)) { rawAliases.add(name); grew = true; }
      }
    }
  }

  // JSON key sets of locals built from pick(raw, LIST) (address, features, agentInfo).
  const jsonKeysOfLocal = new Map(); // local -> Map<field, node>
  for (const [name, init] of locals) {
    const keys = new Map();
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'pick' && n.arguments.length === 2 && ts.isIdentifier(n.arguments[1])) {
        const items = lists.get(n.arguments[1].text) || [];
        for (const it of items) keys.set(it.name, n.arguments[1]);
      }
      ts.forEachChild(n, visit);
    };
    visit(init);
    if (keys.size) jsonKeysOfLocal.set(name, keys);
  }

  // Provider refs of an expression (dataflow through locals + callee bodies), memoized.
  const memo = new Map();
  function refsOf(expr, depth = 0) {
    if (!expr || depth > 6) return new Map();
    if (memo.has(expr)) return memo.get(expr);
    const refs = new Map(); // field -> node
    memo.set(expr, refs);
    const visit = (n) => {
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && rawAliases.has(n.expression.text)) { refs.set(n.name.text, n); return; }
      if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) && rawAliases.has(n.expression.text) && ts.isStringLiteralLike(n.argumentExpression)) { refs.set(n.argumentExpression.text, n); return; }
      if (ts.isIdentifier(n) && locals.has(n.text) && !(n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) {
        for (const [f, node] of refsOf(locals.get(n.text), depth + 1)) refs.set(f, node);
        return;
      }
      if (ts.isCallExpression(n)) {
        if (ts.isIdentifier(n.expression) && n.expression.text === 'pick') return; // JSON containers handled separately
        for (const a of n.arguments) for (const [f, node] of refsOf(a, depth + 1)) refs.set(f, node);
        const decl = resolveFunctionDecl(checker, n.expression);
        if (decl) {
          const pnames = paramNames(decl);
          n.arguments.forEach((rawArg, i) => {
            const pname = pnames[i];
            if (!pname) return;
            const arg = unwrapExpr(rawArg);
            if (ts.isIdentifier(arg) && rawAliases.has(arg.text)) {
              for (const [k, node] of keysAccessedOnParam(decl, pname)) refs.set(k, node);
            } else if (ts.isIdentifier(arg) && jsonKeysOfLocal.has(arg.text)) {
              const keys = jsonKeysOfLocal.get(arg.text);
              for (const [k, node] of keysAccessedOnParam(decl, pname)) if (keys.has(k)) refs.set(k, node);
            }
          });
        }
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(expr);
    return refs;
  }

  // The returned object literal.
  let ret = null;
  const findReturn = (n) => { if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) ret = n.expression; else if (!ret) ts.forEachChild(n, findReturn); };
  findReturn(fn.body);
  if (!ret) throw new Error('UNVERIFIED: mapTrestleToPrisma has no returned object literal');

  for (const p of ret.properties) {
    if (ts.isSpreadAssignment(p)) {
      // ...typedAgentCols  →  helper's per-property param-key reads
      const init = ts.isIdentifier(p.expression) ? locals.get(p.expression.text) : p.expression;
      if (init && ts.isCallExpression(init)) {
        const decl = resolveFunctionDecl(checker, init.expression);
        if (decl) {
          const summary = returnSummary(decl);
          for (const [col, byParam] of summary) {
            for (const [i, keys] of byParam) {
              const arg = unwrapExpr(init.arguments[i]);
              if (!arg || !ts.isIdentifier(arg)) continue;
              if (rawAliases.has(arg.text)) for (const k of keys) add(k, `listings.${col}`, p, `spread ${init.expression.getText(sf)}`);
              else if (jsonKeysOfLocal.has(arg.text)) for (const k of keys) if (jsonKeysOfLocal.get(arg.text).has(k)) add(k, `listings.${col}`, p, `spread ${init.expression.getText(sf)}`);
            }
          }
        }
      }
      continue;
    }
    let col = null;
    let expr = null;
    let localName = null;
    if (ts.isShorthandPropertyAssignment(p)) { col = p.name.text; localName = col; expr = locals.get(col) || null; }
    else if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))) { col = p.name.text; expr = p.initializer; if (ts.isIdentifier(expr)) localName = expr.text; }
    if (!col || !expr) continue;

    // JSON column fed by pick lists → per-key nodes (`features,` shorthand or `agent_info: agentInfo`).
    if (jsonColumns.has(col) && localName && jsonKeysOfLocal.has(localName)) {
      for (const [k, node] of jsonKeysOfLocal.get(localName)) add(k, `listings.${col}.${k}`, node, `pick → ${col}`);
      continue;
    }
    // raw_data → keep-list (slimRawData): handled by the keep-list binding above.
    let usesKeepList = false;
    const scan = (n) => { if (ts.isCallExpression(n)) { const d = resolveFunctionDecl(checker, n.expression); if (d && rel(d.getSourceFile().fileName) === KEEP_LIST) usesKeepList = true; } ts.forEachChild(n, scan); };
    scan(expr);
    if (usesKeepList) continue;
    for (const [f, node] of refsOf(expr)) add(f, `listings.${col}`, node, `mapper dataflow → ${col}`);
  }
  return { bindings, fetched, lists };
}

// ── HOP 2: readers across the program ──────────────────────────────────────

const CONTAINER_ALIASES = {
  features: ['features', 'feat', 'feats', 'listingFeatures'],
  address: ['address', 'addr'],
  agent_info: ['agentInfo', 'agent_info', 'agentJson', 'ai'],
  raw_data: ['rawData', 'raw_data', 'raw', 'rawInput', 'existingRaw', 'existing_raw', 'rawRecord', 'record', 'rec'],
  media: ['media'],
  compliance: ['compliance'],
};

function rootIdentifier(expr) {
  let e = expr;
  while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) {
    e = ts.isPropertyAccessExpression(e) ? e.name : ts.isElementAccessExpression(e) ? e.expression : e.expression;
    if (ts.isIdentifier(e)) return e.text;
  }
  return ts.isIdentifier(e) ? e.text : null;
}

/** Find every reader of the given Mallan nodes and provider names. Returns Map<node, sites[]>. */
export function findReaders(ctx, { columns, jsonKeys, providerFields, members, model = 'Listing' }) {
  const { checker, files } = ctx;
  const hits = new Map(); // node -> [{file,line,tier}]
  const push = (node, n, tier) => { if (!hits.has(node)) hits.set(node, []); const s = { ...site(n), tier }; const arr = hits.get(node); if (!arr.some((x) => x.file === s.file && x.line === s.line && x.tier === tier)) arr.push(s); };
  const colSet = new Set(columns);
  const jsonByKey = new Map(); // key -> Set<container>
  for (const jk of jsonKeys) { const [container, key] = jk.split('.'); if (!jsonByKey.has(key)) jsonByKey.set(key, new Set()); jsonByKey.get(key).add(container); }
  const providerSet = new Set(providerFields);
  const memberSet = new Set(members);

  const { program } = ctx;
  for (const [relPath, sf] of files) {
    // Locals whose Prisma model is DECLARED by a type annotation or an `as Prisma.<Model>…` assertion
    // (`const where: Record<string, unknown> = {}; … prisma.listing.findMany({ where: where as Prisma.ListingWhereInput })`).
    const assertedLocals = new Map(); // identifier -> model
    const collectAsserted = (n) => {
      if (ts.isAsExpression(n) && ts.isIdentifier(n.expression)) { const m = prismaModelOfTypeNode(n.type); if (m) assertedLocals.set(n.expression.text, m); }
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.type) { const m = prismaModelOfTypeNode(n.type); if (m) assertedLocals.set(n.name.text, m); }
      ts.forEachChild(n, collectAsserted);
    };
    collectAsserted(sf);
    const onPrismaHit = (m, key, p) => { if (m === model && colSet.has(key)) push(`listings.${key}`, p, 'typed'); };

    const visit = (n) => {
      // prisma.<model>.<method>({ … }) — every argument literal walked with the model in scope
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const m = prismaDelegateModel(checker, n.expression.expression);
        if (m) for (const a of n.arguments) walkPrismaArgs(program, a, m, onPrismaHit);
      }
      // where.OR = [ { status: 'Active' } ]  /  where.status = …  on an asserted local
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const root = rootIdentifier(n.left);
        const m = root ? assertedLocals.get(root) : null;
        if (m) {
          walkPrismaArgs(program, n.right, m, onPrismaHit);
          if (ts.isPropertyAccessExpression(n.left) && prismaModelShape(program, m).scalars.has(n.left.name.text)) onPrismaHit(m, n.left.name.text, n.left);
        }
      }
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && assertedLocals.has(n.name.text)) walkPrismaArgs(program, n.initializer, assertedLocals.get(n.name.text), onPrismaHit);
      // obj.col — typed column read  (obj['X'] with a string literal is the same read)
      const elementKey = ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text : null;
      if (ts.isPropertyAccessExpression(n) || elementKey) {
        const name = elementKey ?? n.name.text;
        if (colSet.has(name)) {
          const m = prismaModelOfAccess(checker, n.expression, name);
          if (m === model) push(`listings.${name}`, n, 'typed');
        }
        if (jsonByKey.has(name)) {
          // container proven by the checker (obj.features where obj is Prisma Listing) or by alias name
          let container = null;
          let tier = 'name-matched';
          if (ts.isPropertyAccessExpression(n.expression)) {
            const cname = n.expression.name.text;
            if (jsonByKey.get(name).has(cname) && prismaModelOfAccess(checker, n.expression.expression, cname) === model) { container = cname; tier = 'typed'; }
          }
          if (!container) {
            const root = rootIdentifier(n.expression);
            for (const c of jsonByKey.get(name)) if (root && CONTAINER_ALIASES[c]?.includes(root)) container = c;
          }
          if (container && relPath !== MAPPER) push(`listings.${container}.${name}`, n, tier);
          else if (!container && providerSet.has(name) && relPath !== MAPPER) push(`provider:Property.${name}`, n, 'name-matched');
        } else if (providerSet.has(name) && relPath !== MAPPER) {
          let type;
          try { type = checker.getTypeAtLocation(n.expression); } catch { type = null; }
          const prop = type ? propertyOfType(checker, type, name) : null;
          const decl = prop?.declarations?.[0];
          const typed = decl && rel(decl.getSourceFile().fileName) === GENERATED;
          push(`provider:Property.${name}`, n, typed ? 'typed' : 'name-matched');
        }
      }
      // { col: … } inside a Prisma select/where/orderBy/data
      if (ts.isObjectLiteralExpression(n)) {
        for (const p of n.properties) {
          const pname = (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) ? p.name.text : null;
          if (pname && colSet.has(pname) && prismaModelOfObjectKey(checker, n, pname) === model) push(`listings.${pname}`, p, 'typed');
        }
      }
      // const { col } = listing
      if (ts.isBindingElement(n) && ts.isIdentifier(n.name) && n.parent && ts.isObjectBindingPattern(n.parent)) {
        const key = n.propertyName && ts.isIdentifier(n.propertyName) ? n.propertyName.text : n.name.text;
        if (colSet.has(key)) {
          const decl = n.parent.parent;
          const initExpr = ts.isVariableDeclaration(decl) ? decl.initializer : null;
          if (initExpr && prismaModelOfAccess(checker, initExpr, key) === model) push(`listings.${key}`, n, 'typed');
        }
      }
      // 'Member' string literals
      if (ts.isStringLiteralLike(n) && memberSet.has(n.text) && !ts.isImportDeclaration(n.parent) && relPath !== GENERATED) {
        let typed = false;
        try {
          const ctxType = checker.getContextualType(n);
          const alias = ctxType?.aliasSymbol?.name || '';
          if (/^Cotality(Enum|Lookup)_/.test(alias)) typed = true;
          else if (ctxType?.isUnion?.() && ctxType.types.some((t) => t.aliasSymbol && /^Cotality(Enum|Lookup)_/.test(t.aliasSymbol.name))) typed = true;
        } catch { /* untyped */ }
        push(`member:${n.text}`, n, typed ? 'typed' : 'string-literal');
      }
      // 'FieldName' string literals (select lists, keep-lists, pick lists, raw['X'])
      if (ts.isStringLiteralLike(n) && providerSet.has(n.text) && relPath !== MAPPER && relPath !== KEEP_LIST && relPath !== GENERATED) {
        let typed = false;
        try {
          const ctxType = checker.getContextualType(n);
          const alias = ctxType?.aliasSymbol?.name || '';
          if (/^CotalityField$/.test(alias) || /^Cotality/.test(alias)) typed = true;
          else if (ctxType?.isUnion?.() && ctxType.types.length > 100) typed = true; // keyof Cotality<Resource>
        } catch { /* untyped */ }
        push(`provider:Property.${n.text}`, n, typed ? 'typed' : 'string-literal');
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return hits;
}

/** public/crm/js word matches (held plain JS; never proven, always reported). */
export function crmJsReaders(names) {
  const dir = path.join(ROOT, 'public/crm/js');
  const out = new Map();
  const walk = (d) => {
    let entries = [];
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (e.endsWith('.js')) {
        const text = readFileSync(full, 'utf8');
        const lines = text.split(/\r?\n/);
        for (const name of names) {
          const re = new RegExp(`\\b${name}\\b`);
          lines.forEach((ln, i) => { if (re.test(ln)) { if (!out.has(name)) out.set(name, []); out.get(name).push({ file: rel(full), line: i + 1, tier: 'crm-js' }); } });
        }
      }
    }
  };
  walk(dir);
  return out;
}

// ── HOP 3: import closure ──────────────────────────────────────────────────

export function importGraph(ctx) {
  const { program, files, options } = ctx;
  const importers = new Map(); // file -> Set<importer>
  const cache = ts.createModuleResolutionCache(ROOT, (f) => f, options);
  for (const [relPath, sf] of files) {
    const specs = [];
    for (const st of sf.statements) {
      if ((ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteralLike(st.moduleSpecifier)) specs.push(st.moduleSpecifier.text);
    }
    for (const spec of specs) {
      const r = ts.resolveModuleName(spec, sf.fileName, options, ts.sys, cache);
      const target = r.resolvedModule?.resolvedFileName;
      if (!target || !files.has(rel(target))) continue;
      const t = rel(target);
      if (!importers.has(t)) importers.set(t, new Set());
      importers.get(t).add(relPath);
    }
  }
  void program;
  return importers;
}

export function transitiveImporters(importers, file) {
  const seen = new Set();
  const stack = [file];
  while (stack.length) {
    const f = stack.pop();
    for (const i of importers.get(f) || []) if (!seen.has(i)) { seen.add(i); stack.push(i); }
  }
  return seen;
}

// ── Boundary census ────────────────────────────────────────────────────────

/**
 * Every raw-Cotality READ (property / element access named exactly a live field, on a payload alias,
 * a Prisma-typed JSON container, or a contract-typed row) in lib/ and app/ OUTSIDE the declared
 * boundary. Bare string literals are not counted (labels, select lists — the latter are already
 * compile-checked); public/crm/js is reported separately (held path) and not part of the ratchet.
 */
export function boundaryCensus({ compact, boundary, ctx = null }) {
  ctx = ctx || createProgram();
  const providerFields = new Set();
  for (const [res, r] of Object.entries(compact.resources)) {
    if (r.access.state !== 'accessible') continue;
    for (const f of Object.keys(r.fields)) providerFields.add(f);
    void res;
  }
  const containers = Object.keys(CONTAINER_ALIASES);
  const jsonKeys = [];
  for (const f of Object.keys(compact.resources.Property?.fields || {})) for (const c of containers) jsonKeys.push(`${c}.${f}`);
  const readers = findReaders(ctx, { columns: [], jsonKeys, providerFields: [...providerFields], members: [] });

  const inBoundary = (file) => boundary.some((b) => (b.endsWith('/') ? file.startsWith(b) : file === b));
  const byKey = new Map();
  for (const [node, sites] of readers) {
    let field = null;
    let container = null;
    let m;
    if ((m = /^provider:Property\.(.+)$/.exec(node))) field = m[1];
    else if ((m = /^listings\.([a-z_]+)\.(.+)$/.exec(node))) { container = m[1]; field = m[2]; }
    else continue;
    for (const s of sites) {
      if (s.tier === 'string-literal' || s.tier === 'crm-js') continue;
      if (inBoundary(s.file)) continue;
      const key = `${s.file}::${field}`;
      if (!byKey.has(key)) byKey.set(key, { key, file: s.file, field, container, tiers: new Set(), lines: new Set() });
      const e = byKey.get(key);
      e.tiers.add(s.tier);
      e.lines.add(s.line);
    }
  }
  const violations = [...byKey.values()]
    .map((e) => ({ key: e.key, file: e.file, field: e.field, container: e.container, tier: e.tiers.has('typed') ? 'typed' : 'name-matched', sites: e.lines.size, lines: [...e.lines].sort((a, b) => a - b) }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  const files = new Set(violations.map((v) => v.file));
  const crm = crmJsReaders([...providerFields]);
  let crmSites = 0;
  for (const sites of crm.values()) crmSites += sites.length;
  return {
    boundary,
    violations,
    counts: { files: files.size, keys: violations.length, sites: violations.reduce((n, v) => n + v.sites, 0) },
    crm_js: { fields: crm.size, sites: crmSites, note: 'public/crm/** is held; reported, not ratcheted' },
  };
}

// ── Assemble ───────────────────────────────────────────────────────────────

/**
 * computeImpact({ changes, compact }) → the blast radius for a change set, mechanically.
 */
export function computeImpact({ changes, compact, ctx = null, crmJs = true }) {
  ctx = ctx || createProgram();
  const { bindings, fetched } = analyzeMapper(ctx);
  const importers = importGraph(ctx);

  // Provider nodes touched by the change set.
  const providerFields = new Set();
  const members = new Set();
  const observed = [];
  for (const c of changes) {
    if (c.resource !== 'Property') continue; // v1: Property bindings via the mapper; other resources are reported as provider-level
    if (c.kind === 'observed-value-added' || c.kind === 'observed-value-removed') {
      // A new/removed OBSERVED value on a plain string field does not change the field or its readers;
      // it matters only where Mallan code literally names that value. Search the literal, not the field.
      observed.push(c);
      members.add(c.member);
      continue;
    }
    if (c.field) providerFields.add(c.field);
    if (c.member) members.add(c.member);
    if (c.kind === 'access-changed' || c.kind === 'resource-removed') for (const f of Object.keys(compact.resources[c.resource]?.fields || {})) providerFields.add(f);
  }
  const nonProperty = changes.filter((c) => c.resource !== 'Property');

  // HOP 1
  const affectedNodes = new Map(); // mallan node -> { sites, via, providerField }
  const unbound = [];
  for (const f of providerFields) {
    const b = bindings.get(`Property.${f}`);
    if (!b || !b.length) { unbound.push(`Property.${f}${fetched.has(`Property.${f}`) ? ' (fetched, unbound)' : ' (declared, not fetched)'}`); continue; }
    for (const x of b) {
      if (!affectedNodes.has(x.node)) affectedNodes.set(x.node, { sites: [], via: new Set(), providerFields: new Set() });
      const e = affectedNodes.get(x.node);
      for (const s of x.sites) if (!e.sites.some((y) => y.file === s.file && y.line === s.line)) e.sites.push({ ...s, tier: 'typed' });
      e.via.add(x.via);
      e.providerFields.add(f);
    }
  }

  // HOP 2
  const columns = [...affectedNodes.keys()].filter((n) => /^listings\.[a-z_]+$/.test(n)).map((n) => n.slice('listings.'.length));
  const jsonKeys = [...affectedNodes.keys()].filter((n) => /^listings\.[a-z_]+\.[A-Za-z0-9_]+$/.test(n)).map((n) => n.slice('listings.'.length));
  const readers = findReaders(ctx, { columns, jsonKeys, providerFields: [...providerFields], members: [...members] });
  const crm = crmJs ? crmJsReaders([...providerFields, ...members]) : new Map();

  const affected = [];
  const surfacesOf = (file) => classifySurface(file);
  const allDirect = new Set();
  const allTransitive = new Set();
  const emit = (node, sites) => {
    if (!sites.length) return;
    const tiers = new Set(sites.map((s) => s.tier));
    const tier = tiers.has('typed') ? 'typed' : tiers.has('name-matched') ? 'name-matched' : tiers.has('string-literal') ? 'string-literal' : 'crm-js';
    const direct = new Set(sites.map((s) => surfacesOf(s.file)));
    const transitive = new Set();
    for (const s of sites) for (const imp of transitiveImporters(importers, s.file)) transitive.add(surfacesOf(imp));
    for (const d of direct) transitive.delete(d);
    for (const d of direct) allDirect.add(d);
    for (const t of transitive) allTransitive.add(t);
    affected.push({ node, tier, surfaces: [...direct].sort(), transitive_surfaces: [...transitive].sort(), sites: sites.map(({ file, line, tier: t }) => ({ file, line, tier: t })) });
  };
  for (const [node, e] of affectedNodes) emit(node, [...e.sites, ...(readers.get(node) || [])]);
  for (const [node, sites] of readers) if (!affectedNodes.has(node)) emit(node, sites);
  for (const [name, sites] of crm) emit(`crm-js:${name}`, sites);
  affected.sort((a, b) => (a.node < b.node ? -1 : 1));

  for (const t of allDirect) allTransitive.delete(t);
  // BLOCKED covers every surface reached: directly (a reader site lives there) or transitively (the
  // surface imports a module that reads the node — a Saved Search that runs through a changed engine
  // is affected without reading the column itself). Both lists are kept so the proof stays visible.
  const blocked = [...new Set([...allDirect, ...allTransitive])].sort();
  // An observed-value change blocks only when a reader literally names the value (a member literal hit,
  // typed or string, or a CRM-JS word match); otherwise it is recorded and the state stays HEALTHY.
  const observedNamed = observed.filter((c) => affected.some((a) => a.node === `member:${c.member}` || a.node === `crm-js:${c.member}`));
  const blockingChanges = changes.filter((c) => !(c.kind === 'observed-value-added' || c.kind === 'observed-value-removed') || observedNamed.includes(c));
  const state = blockingChanges.length ? 'BLOCKED' : 'HEALTHY';
  return {
    state,
    changes,
    blocking_changes: blockingChanges,
    observed_changes: observed.filter((c) => !observedNamed.includes(c)),
    affected,
    unbound: unbound.sort(),
    non_property_changes: nonProperty,
    blocked_surfaces: blocked,
    direct_surfaces: [...allDirect].sort(),
    transitive_surfaces: [...allTransitive].sort(),
    repair_order: state === 'BLOCKED' ? repairOrder(blocked) : [],
  };
}
