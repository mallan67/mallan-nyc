// Search closure — shared primitives.
//
// One vocabulary for "did this stage prove its claim": PASS, BLOCKED, UNVERIFIED. Nothing else.
// A stage that cannot run, cannot reach the provider, or is not yet implemented is UNVERIFIED —
// never PASS by default. The run verdict is PASS only when every stage is PASS. Evidence is bound
// to the exact git SHA and dirty state so a result from another commit cannot certify this one.

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

export const STATE = Object.freeze({ PASS: 'PASS', BLOCKED: 'BLOCKED', UNVERIFIED: 'UNVERIFIED' });

export function now() {
  return new Date().toISOString();
}

/** Sorted-key canonical JSON so equal content hashes equal regardless of key order. */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
}

export function sha256(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(canonical(value));
  return createHash('sha256').update(text).digest('hex');
}

export function git(args) {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

/** Exact repository identity. Untracked files are excluded from dirty-ness on purpose: a proof
 *  binds to tracked content; untracked scratch does not change what the SHA describes. */
export function gitState() {
  const sha = git('rev-parse HEAD');
  const branch = git('rev-parse --abbrev-ref HEAD');
  const porcelain = git('status --porcelain --untracked-files=no') ?? '';
  const dirtyFiles = porcelain.split('\n').filter(Boolean).map((l) => l.slice(3));
  const upstream = git('rev-parse --abbrev-ref --symbolic-full-name @{upstream}');
  const ab = upstream ? git(`rev-list --left-right --count ${upstream}...HEAD`) : null;
  const [behind, ahead] = ab ? ab.split(/\s+/).map(Number) : [null, null];
  return { sha, short: sha ? sha.slice(0, 8) : null, branch, dirty: dirtyFiles.length > 0, dirtyFiles, upstream, ahead, behind };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
    else out._.push(a);
  }
  return out;
}

/** Every stage writes exactly one JSON file: <outDir>/<stage>.json. */
export async function writeStage(outDir, stage, result) {
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${stage}.json`);
  const body = { stage, at: now(), ...result };
  if (!Object.values(STATE).includes(body.state)) {
    throw new Error(`stage ${stage} produced an invalid state: ${body.state}`);
  }
  await writeFile(file, JSON.stringify(body, null, 2) + '\n', 'utf8');
  return { file, body };
}

export async function readStage(outDir, stage) {
  try {
    return JSON.parse(await readFile(path.join(outDir, `${stage}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/** BLOCKED dominates; then UNVERIFIED; PASS only if every state is PASS. */
export function aggregate(states) {
  if (!states.length) return STATE.UNVERIFIED;
  if (states.includes(STATE.BLOCKED)) return STATE.BLOCKED;
  if (states.includes(STATE.UNVERIFIED)) return STATE.UNVERIFIED;
  return STATE.PASS;
}

/** Exit code contract shared by every stage and by the runner. */
export function exitFor(state) {
  return state === STATE.PASS ? 0 : state === STATE.BLOCKED ? 1 : 2;
}
