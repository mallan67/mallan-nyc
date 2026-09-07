#!/usr/bin/env node
// scripts/install-git-hooks.mjs
//
// Points this checkout's Git hooks at .githooks/ so the Neon pre-commit guard
// (NEON.md §5) actually runs. Invoked from the `prepare` lifecycle script.
//
// HARD REQUIREMENT: this must NEVER fail an install or a build.
// `prepare` runs during `npm install` / `npm ci` in places that have no Git
// repository, no `git` binary, or no business installing developer hooks —
// Vercel builds, CI runners, Docker layers. Every branch below exits 0.
//
// Manual equivalent (unchanged): npm run hooks:install

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const HOOKS_DIR = '.githooks';

/** Exit 0 always. `prepare` failing would break installs and deploys. */
function skip(reason) {
  if (process.env.HOOKS_INSTALL_VERBOSE === '1') {
    console.log(`[install-git-hooks] skipped — ${reason}`);
  }
  process.exit(0);
}

// Build and CI environments do not need developer hooks, and must never be
// blocked by them. Vercel sets both VERCEL and CI.
const BUILD_ENV_VARS = [
  'CI',
  'VERCEL',
  'NETLIFY',
  'GITHUB_ACTIONS',
  'CODEBUILD_BUILD_ID',
  'CF_PAGES',
];
const buildEnv = BUILD_ENV_VARS.find((v) => process.env[v]);
if (buildEnv) skip(`build/CI environment detected (${buildEnv})`);

// Explicit opt-out for anyone who manages hooks themselves.
if (process.env.SKIP_GIT_HOOKS === '1') skip('SKIP_GIT_HOOKS=1');

// No repository — e.g. a tarball install or a Docker COPY without .git.
if (!existsSync(path.join(process.cwd(), '.git'))) skip('no .git directory');

// Hook scripts absent (partial checkout / sparse checkout).
if (!existsSync(path.join(process.cwd(), HOOKS_DIR))) skip(`no ${HOOKS_DIR}/ directory`);

try {
  // Respect a hooksPath the developer set deliberately to something else.
  let current = '';
  try {
    current = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    current = ''; // unset — `git config --get` exits 1 when the key is absent
  }

  if (current === HOOKS_DIR) skip('already configured');
  if (current) skip(`core.hooksPath already set to "${current}" — leaving it alone`);

  execFileSync('git', ['config', 'core.hooksPath', HOOKS_DIR], { stdio: 'ignore' });
  console.log(`[install-git-hooks] core.hooksPath → ${HOOKS_DIR} (Neon guard active)`);
} catch (err) {
  // git missing from PATH, unwritable config, worktree oddities — never fatal.
  skip(`git config unavailable (${err?.code ?? 'error'})`);
}

process.exit(0);
