#!/usr/bin/env node
// Stage: git-state — the identity every other stage's evidence is bound to.
//
// PASS     clean tracked tree, SHA resolvable.
// BLOCKED  tracked tree is dirty (proof would describe content the SHA does not), unless
//          --allow-dirty is given for a development run; then PASS with dirty recorded.
// UNVERIFIED  git unavailable / not a repository.

import { STATE, gitState, parseArgs, writeStage, exitFor } from './lib.mjs';

const args = parseArgs();
const outDir = args.out || 'artifacts/search-closure/_unbound';
const g = gitState();

let state = STATE.PASS;
let reason = null;
if (!g.sha) {
  state = STATE.UNVERIFIED;
  reason = 'git SHA could not be resolved';
} else if (g.dirty && !args['allow-dirty']) {
  state = STATE.BLOCKED;
  reason = `tracked tree is dirty (${g.dirtyFiles.length} file(s)); a proof must bind to a committed SHA. Re-run with --allow-dirty for a development run.`;
}

const { body } = await writeStage(outDir, 'git-state', { state, reason, git: g, allowDirty: Boolean(args['allow-dirty']) });
console.error(`[closure:git-state] ${state} ${g.branch ?? '?'}@${g.short ?? '?'}${g.dirty ? ' DIRTY' : ''}${reason ? ' — ' + reason : ''}`);
process.stdout.write(JSON.stringify(body) + '\n');
process.exit(exitFor(state));
