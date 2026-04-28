# C4c — Broker Ethics Admin Panel + Dev-Login Catch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans for task-by-task execution. Steps use checkbox (`- [ ]`) syntax. Required before any commit: invoke the `rebny-compliance` skill — this PR touches auth flow + a broker-only admin surface.

**Goal:** Land the last residual pieces of Workstream C4 (UCBA Art. III §6 ethics-training enforcement). Schema and the auth-gate (PR #51, #58) are merged; the backfill script is committed (PR #59). What's left: (a) a broker-only admin panel that lists agents with their `ethics_training_completed_at` + `ethics_training_expires_at` and lets the broker update those values, (b) catching `EthicsTrainingExpiredError` in `/api/auth/dev-login` so it surfaces a clear message instead of a 500.

**Architecture:** Two small additive API endpoints (`GET /api/crm/agents` already exists — we add the two ethics fields to its select, plus a new `PATCH /api/crm/agents/[id]/ethics-training`), one new section in the existing CRM dashboard (broker-only — already gated by `role=BROKER`), and a small change in the dev-login route to catch a specific error type. No schema changes; no new tables; no new third-party deps.

**Tech Stack:** Next.js App Router server route handlers, Prisma (existing `Agent` model), the existing dashboard's vanilla-JS panel system in `public/crm/js/dashboard/`, the existing `requireBroker` middleware in `lib/auth/middleware.ts`.

---

## Pre-flight

- [ ] **Step 1: Worktree off origin/main**
  ```bash
  cd C:/Users/MayaAllan/Desktop/mallan-nyc
  git fetch origin main
  git worktree add ../mallan-nyc-c4c feat/c4c-ethics-admin-panel origin/main
  cd ../mallan-nyc-c4c
  npm ci
  ```

- [ ] **Step 2: Confirm baseline**
  ```bash
  npm run ops:health
  npm run ucba:audit
  npm run rls:validate
  npx vitest run tests/runtime/auth-ethics-gate.test.ts
  ```
  All must pass. The auth-ethics-gate runtime test already exists; treat its current pass count as the floor.

- [ ] **Step 3: Confirm prior C4 work is on main**
  ```bash
  grep -n "ethics_training_completed_at" prisma/schema.prisma   # ~ line 93
  grep -n "EthicsTrainingExpiredError" lib/auth/session.ts       # ~ line 35
  git log --oneline | grep -E "(c4|ethics)" | head -5            # PRs #51, #58, #59
  ```

## File Structure

| File | Role |
|---|---|
| Modify: `app/api/crm/agents/route.ts` | Add `ethics_training_completed_at` + `ethics_training_expires_at` to the GET select. |
| Create: `app/api/crm/agents/[id]/ethics-training/route.ts` | New `PATCH` handler. Broker-only. Updates the two ethics dates + writes `AuditEvent`. |
| Create: `app/api/crm/agents/[id]/ethics-training/__tests__/route.test.ts` | Auth gating + happy-path + audit-event coverage. |
| Modify: `app/api/auth/dev-login/route.ts` | Catch `EthicsTrainingExpiredError`, return 403 with clear message + retraining URL. |
| Create: `public/crm/js/dashboard/panels/admin-ethics.js` | New panel renderer. Broker-only. Loads `/api/crm/agents`, renders a table with editable date inputs + Save buttons. |
| Modify: `public/crm/js/dashboard/router.js` (or wherever the panel registry lives) | Register the new `admin-ethics` panel and a nav entry visible only to broker. |
| Modify: `public/crm/dashboard.html` | Add the nav link in the broker-only menu. |
| Create: `tests/runtime/dev-login-ethics-catch.test.ts` | Asserts dev-login returns 403 (not 500) when broker is missing/expired ethics training. |

---

## Task 1: Surface ethics fields on the agent roster API

**Files:**
- Modify: `app/api/crm/agents/route.ts`
- Test: pick or create the colocated test file (look in `app/api/crm/agents/__tests__/` first; if absent, create `app/api/crm/agents/__tests__/route.test.ts`).

- [ ] **Step 1: Write failing test**

  ```typescript
  // app/api/crm/agents/__tests__/route.test.ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  // Mock requireBroker + prisma per the patterns used elsewhere in this repo.
  // Search for an existing route.test.ts to copy the mock shape.
  // ...
  it("GET returns ethics_training_completed_at + ethics_training_expires_at for each agent", async () => {
    // arrange: mock prisma.agent.findMany to return one row with both ethics dates set
    // act: invoke the route's GET handler
    // assert: response JSON's first agent has both fields, ISO-stringified
  });
  ```

- [ ] **Step 2: Confirm fail**

  ```bash
  npx vitest run app/api/crm/agents/__tests__/route.test.ts
  ```

- [ ] **Step 3: Implement**

  In `app/api/crm/agents/route.ts`, add to the `select` block:
  ```typescript
  ethics_training_completed_at: true,
  ethics_training_expires_at: true,
  ```

  In the `serialized.map(...)` block, ensure both fields are returned as ISO strings or `null`:
  ```typescript
  ethics_training_completed_at: a.ethics_training_completed_at?.toISOString() ?? null,
  ethics_training_expires_at: a.ethics_training_expires_at?.toISOString() ?? null,
  ```

- [ ] **Step 4: Confirm pass + type-check**

  ```bash
  npx vitest run app/api/crm/agents/__tests__/route.test.ts
  npm run type-check
  ```

- [ ] **Step 5: Invoke rebny-compliance, then commit**

  ```bash
  git add app/api/crm/agents/route.ts app/api/crm/agents/__tests__/route.test.ts
  git commit -m "feat(crm-api): expose ethics_training dates on /api/crm/agents (broker-only)"
  ```

## Task 2: PATCH endpoint to update ethics dates

**Files:**
- Create: `app/api/crm/agents/[id]/ethics-training/route.ts`
- Create: `app/api/crm/agents/[id]/ethics-training/__tests__/route.test.ts`

Behavior:
- `PATCH /api/crm/agents/:id/ethics-training` accepts JSON `{ completed_at: ISO | null, expires_at: ISO | null }`. Both are optional but at least one must be present.
- Broker-only via `requireBroker`.
- Validates: `expires_at >= completed_at` when both present; both are valid ISO strings; expires no further than 5 years in the future (sanity check).
- Writes `AuditEvent` with `event_type='ethics_training_updated'`, `actor_id=<broker.id>`, `target_type='Agent'`, `target_id=<:id>`, `metadata={completed_at, expires_at}`.

- [ ] **Step 1: Write failing tests**

  Cover:
  1. Returns 401 when no auth.
  2. Returns 403 when authenticated as agent (not broker).
  3. Returns 400 when body has neither field.
  4. Returns 400 when `expires_at < completed_at`.
  5. Returns 400 when `expires_at` is more than 5 years in the future.
  6. Returns 200 with updated agent on success.
  7. Writes an `AuditEvent` row.

  Use the existing test pattern (mock `requireBroker`, mock `prisma.agent.update`, mock `prisma.auditEvent.create`). Search the repo for `requireBroker` + `vi.mock` to find a recent example.

- [ ] **Step 2: Confirm tests fail**

- [ ] **Step 3: Implement**

  ```typescript
  // app/api/crm/agents/[id]/ethics-training/route.ts
  // PATCH /api/crm/agents/:id/ethics-training
  // Broker-only. Updates an agent's UCBA Art. III §6 ethics-training dates.
  import { NextRequest, NextResponse } from "next/server";
  import prisma from "@/lib/prisma";
  import { requireBroker, isAuthError } from "@/lib/auth";
  import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

  const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

  export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const blocked = assertWriteAllowed();
    if (blocked) return blocked;

    const auth = await requireBroker(req);
    if (isAuthError(auth)) return auth;

    const { id } = await params;
    const agentId = BigInt(id);

    let body: { completed_at?: string | null; expires_at?: string | null };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (body.completed_at === undefined && body.expires_at === undefined) {
      return NextResponse.json(
        { error: "Provide at least one of completed_at or expires_at." },
        { status: 400 }
      );
    }

    const data: { ethics_training_completed_at?: Date | null; ethics_training_expires_at?: Date | null } = {};

    if (body.completed_at !== undefined) {
      if (body.completed_at === null) {
        data.ethics_training_completed_at = null;
      } else {
        const d = new Date(body.completed_at);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "completed_at is not a valid ISO date" }, { status: 400 });
        }
        data.ethics_training_completed_at = d;
      }
    }

    if (body.expires_at !== undefined) {
      if (body.expires_at === null) {
        data.ethics_training_expires_at = null;
      } else {
        const d = new Date(body.expires_at);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "expires_at is not a valid ISO date" }, { status: 400 });
        }
        if (d.getTime() - Date.now() > FIVE_YEARS_MS) {
          return NextResponse.json(
            { error: "expires_at cannot be more than 5 years in the future" },
            { status: 400 }
          );
        }
        data.ethics_training_expires_at = d;
      }
    }

    if (
      data.ethics_training_completed_at instanceof Date &&
      data.ethics_training_expires_at instanceof Date &&
      data.ethics_training_expires_at.getTime() < data.ethics_training_completed_at.getTime()
    ) {
      return NextResponse.json(
        { error: "expires_at cannot be earlier than completed_at" },
        { status: 400 }
      );
    }

    const updated = await prisma.agent.update({
      where: { id: agentId },
      data,
      select: {
        id: true,
        ethics_training_completed_at: true,
        ethics_training_expires_at: true,
      },
    });

    await prisma.auditEvent.create({
      data: {
        event_type: "ethics_training_updated",
        actor_id: auth.userId,
        actor_type: "agent",
        target_type: "Agent",
        target_id: agentId.toString(),
        metadata: {
          completed_at: updated.ethics_training_completed_at?.toISOString() ?? null,
          expires_at: updated.ethics_training_expires_at?.toISOString() ?? null,
        } as object,
      },
    });

    return NextResponse.json({
      agent: {
        id: updated.id.toString(),
        ethics_training_completed_at: updated.ethics_training_completed_at?.toISOString() ?? null,
        ethics_training_expires_at: updated.ethics_training_expires_at?.toISOString() ?? null,
      },
    });
  }
  ```

  Note: confirm the exact `AuditEvent` field names (`actor_id`, `actor_type`, `target_type`, `target_id`, `metadata`) match `prisma/schema.prisma`. Adjust if any rename is needed.

- [ ] **Step 4: Run tests, confirm pass + type-check**

  ```bash
  npx vitest run app/api/crm/agents/[id]/ethics-training/__tests__/route.test.ts
  npm run type-check
  ```

- [ ] **Step 5: Invoke rebny-compliance, commit**

  ```bash
  git add app/api/crm/agents/\[id\]/ethics-training/
  git commit -m "feat(c4c): PATCH /api/crm/agents/:id/ethics-training (broker-only) + audit event"
  ```

## Task 3: Catch EthicsTrainingExpiredError in dev-login

**Files:**
- Modify: `app/api/auth/dev-login/route.ts`
- Create: `tests/runtime/dev-login-ethics-catch.test.ts`

Currently `_devLogin()` calls `createSession()` which can throw `EthicsTrainingExpiredError`. The catch block treats it as a generic 500. We surface it as 403 with the same shape `app/api/auth/login/route.ts` and `app/api/auth/mfa/verify/route.ts` already use.

- [ ] **Step 1: Write failing runtime test**

  ```typescript
  // tests/runtime/dev-login-ethics-catch.test.ts
  // Verifies that when the BROKER row has no/expired ethics training,
  // /api/auth/dev-login returns 403 with the retraining URL — not 500.
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import prisma from "@/lib/prisma";

  // This test runs against the dev DATABASE_URL set in the runtime test harness.
  // Pattern follows tests/runtime/auth-ethics-gate.test.ts — copy the bootstrap
  // shape (including ALLOW_DEV_LOGIN=true assertion) from there.

  describe("dev-login ethics catch", () => {
    let originalExpires: Date | null;
    let brokerId: bigint;

    beforeAll(async () => {
      const broker = await prisma.agent.findFirst({ where: { role: "BROKER", status: "active" } });
      if (!broker) throw new Error("No active broker in test DB");
      brokerId = broker.id;
      originalExpires = broker.ethics_training_expires_at;
      // Force-expire
      await prisma.agent.update({
        where: { id: brokerId },
        data: { ethics_training_expires_at: new Date(Date.now() - 86400000) },
      });
    });

    afterAll(async () => {
      await prisma.agent.update({
        where: { id: brokerId },
        data: { ethics_training_expires_at: originalExpires },
      });
    });

    it("dev-login GET returns 403 (not 500) when broker training expired", async () => {
      // Replace the import path with whatever pattern this repo's runtime tests use
      // to invoke a route handler directly — see auth-ethics-gate.test.ts.
      const { GET } = await import("@/app/api/auth/dev-login/route");
      const req = new Request("http://localhost/api/auth/dev-login", { method: "GET" });
      const res = await GET(req as any);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/ethics/i);
      expect(body.retrainingUrl).toMatch(/^https?:\/\//);
    });
  });
  ```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement**

  In `app/api/auth/dev-login/route.ts`:

  ```typescript
  import { EthicsTrainingExpiredError } from "@/lib/auth/session";
  ```

  Wrap the `createSession(...)` call in `_devLogin` so the error is caught and returned with shape `{ error, code, retrainingUrl }`:

  ```typescript
  async function _devLogin(req: NextRequest): Promise<{
    ok: boolean; token?: string; error?: string; status?: number;
    code?: string; retrainingUrl?: string;
    agent?: { id: string; name: string; email: string; role: string };
  }> {
    try {
      const agent = await prisma.agent.findFirst({
        where: { role: "BROKER", status: "active" },
      });
      if (!agent) return { ok: false, error: "No active broker found", status: 404 };

      let token: string;
      try {
        token = await createSession("agent", agent.id, agent.role);
      } catch (err) {
        if (err instanceof EthicsTrainingExpiredError) {
          return {
            ok: false,
            status: 403,
            error: err.message,
            code: err.code,
            retrainingUrl: err.retrainingUrl,
          };
        }
        throw err;
      }

      await prisma.agent.update({ where: { id: agent.id }, data: { last_login: new Date() } });
      console.warn("[DEV-LOGIN] Dev login used at", new Date().toISOString(), "from", req.headers.get("x-forwarded-for") || "local");

      return {
        ok: true,
        token,
        agent: {
          id: agent.id.toString(),
          name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
          email: agent.email,
          role: agent.role,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: message, status: 500 };
    }
  }
  ```

  In both `GET` and `POST` exports, when `result.ok === false`, include `code` + `retrainingUrl` in the JSON response when present. Keep the existing 404 / 500 cases.

  ```typescript
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.code ? { code: result.code } : {}),
        ...(result.retrainingUrl ? { retrainingUrl: result.retrainingUrl } : {}),
      },
      { status: result.status || 500 }
    );
  }
  ```

- [ ] **Step 4: Confirm test passes + type-check**

  ```bash
  npx vitest run tests/runtime/dev-login-ethics-catch.test.ts
  npm run type-check
  ```

- [ ] **Step 5: Invoke rebny-compliance, commit**

  ```bash
  git add app/api/auth/dev-login/route.ts tests/runtime/dev-login-ethics-catch.test.ts
  git commit -m "fix(dev-login): catch EthicsTrainingExpiredError → 403 with retraining URL"
  ```

## Task 4: Broker admin panel UI

**Files:**
- Create: `public/crm/js/dashboard/panels/admin-ethics.js`
- Modify: `public/crm/js/dashboard/router.js` (panel registry; if it lives elsewhere, find it via `grep -rn "registerPanel\|panels\[" public/crm/js/dashboard/`)
- Modify: `public/crm/dashboard.html` (add nav entry within the broker-only menu)

The dashboard architecture is documented at the top of CLAUDE.md: `public/crm/js/dashboard/` with `app.js`, `panels.js`, `router.js`, `store.js`, `ui-components.js`, `workspace.js`, `portals.js` + `panels/` subdirectory. Match that pattern.

- [ ] **Step 1: Read the panel registry to learn the exact pattern**

  ```bash
  ls public/crm/js/dashboard/panels/
  head -60 public/crm/js/dashboard/router.js
  head -60 public/crm/js/dashboard/panels.js
  ```

  Pick the smallest existing panel file in `panels/` and use it as a template for shape (export style, init signature, render signature, store usage).

- [ ] **Step 2: Write the panel renderer**

  ```javascript
  // public/crm/js/dashboard/panels/admin-ethics.js
  // Broker-only admin panel — view/update each agent's UCBA Art. III §6
  // ethics training dates. Renders a table with two date inputs per row
  // (completed_at, expires_at) and a Save button per row.
  // No bundler — this file is loaded as a plain <script> by dashboard.html.

  (function () {
    'use strict';

    function fmt(iso) { return iso ? iso.slice(0, 10) : ''; }

    async function load() {
      const res = await fetch('/api/crm/agents', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load agents: ' + res.status);
      const data = await res.json();
      return data.agents || [];
    }

    async function save(agentId, completedAt, expiresAt) {
      const body = {
        completed_at: completedAt ? new Date(completedAt + 'T00:00:00Z').toISOString() : null,
        expires_at:   expiresAt   ? new Date(expiresAt   + 'T00:00:00Z').toISOString() : null,
      };
      const res = await fetch('/api/crm/agents/' + encodeURIComponent(agentId) + '/ethics-training', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(function () { return { error: 'Save failed' }; });
        throw new Error(err.error || 'Save failed');
      }
      return res.json();
    }

    function statusOf(expiresAtIso) {
      if (!expiresAtIso) return { label: 'Never recorded', cls: 'text-red-700' };
      const expires = new Date(expiresAtIso).getTime();
      const now = Date.now();
      if (expires < now) return { label: 'EXPIRED', cls: 'text-red-700 font-bold' };
      const days = Math.floor((expires - now) / 86400000);
      if (days < 30) return { label: 'Expires in ' + days + 'd', cls: 'text-amber-700' };
      return { label: 'Valid', cls: 'text-green-700' };
    }

    function buildRow(agent) {
      var name = agent.full_name || (agent.first_name + ' ' + agent.last_name);
      var status = statusOf(agent.ethics_training_expires_at);
      return '' +
        '<tr data-agent-id="' + agent.id + '" class="border-b">' +
          '<td class="py-2 px-3 text-sm">' + name + '</td>' +
          '<td class="py-2 px-3 text-sm">' + (agent.role || '') + '</td>' +
          '<td class="py-2 px-3"><input type="date" class="field-input field-completed" value="' + fmt(agent.ethics_training_completed_at) + '"></td>' +
          '<td class="py-2 px-3"><input type="date" class="field-input field-expires" value="' + fmt(agent.ethics_training_expires_at) + '"></td>' +
          '<td class="py-2 px-3 text-sm ' + status.cls + '">' + status.label + '</td>' +
          '<td class="py-2 px-3"><button class="btn btn-primary btn-sm save-btn">Save</button></td>' +
        '</tr>';
    }

    async function render(container) {
      container.innerHTML = '<div class="p-4">Loading agents…</div>';
      try {
        var agents = await load();
        var html = '' +
          '<header class="flex justify-between items-center p-4 border-b">' +
            '<div>' +
              '<h2 class="text-lg font-bold">Ethics Training (UCBA Art. III §6)</h2>' +
              '<p class="text-xs text-gray-600">REBNY 2026 requires ethics training before issuing RLS access. Set both dates per agent. Expiry must be within 5 years of completion.</p>' +
            '</div>' +
          '</header>' +
          '<div class="overflow-x-auto">' +
            '<table class="w-full text-left">' +
              '<thead class="bg-gray-50 border-b"><tr>' +
                '<th class="py-2 px-3 text-xs font-bold text-gray-700">Agent</th>' +
                '<th class="py-2 px-3 text-xs font-bold text-gray-700">Role</th>' +
                '<th class="py-2 px-3 text-xs font-bold text-gray-700">Completed</th>' +
                '<th class="py-2 px-3 text-xs font-bold text-gray-700">Expires</th>' +
                '<th class="py-2 px-3 text-xs font-bold text-gray-700">Status</th>' +
                '<th class="py-2 px-3"></th>' +
              '</tr></thead>' +
              '<tbody>' + agents.map(buildRow).join('') + '</tbody>' +
            '</table>' +
          '</div>';
        container.innerHTML = html;

        container.querySelectorAll('tr[data-agent-id]').forEach(function (row) {
          var agentId = row.getAttribute('data-agent-id');
          var btn = row.querySelector('.save-btn');
          btn.addEventListener('click', async function () {
            btn.disabled = true; btn.textContent = 'Saving…';
            try {
              var completed = row.querySelector('.field-completed').value;
              var expires = row.querySelector('.field-expires').value;
              await save(agentId, completed, expires);
              btn.textContent = 'Saved ✓';
              setTimeout(function () { render(container); }, 800);
            } catch (err) {
              btn.disabled = false; btn.textContent = 'Save';
              alert('Save failed: ' + err.message);
            }
          });
        });
      } catch (err) {
        container.innerHTML = '<div class="p-4 text-red-700">Failed to load: ' + err.message + '</div>';
      }
    }

    // Match the panel-registration shape used by sibling files in panels/.
    // If panels register via `window.MallanPanels.register("admin-ethics", { render })`,
    // adopt that. Otherwise match whatever convention the existing files use.
    if (window.MallanPanels && typeof window.MallanPanels.register === 'function') {
      window.MallanPanels.register('admin-ethics', { title: 'Ethics Training', render: render, brokerOnly: true });
    } else {
      // Fallback: expose globally for router.js to pick up.
      window.AdminEthicsPanel = { render: render };
    }
  })();
  ```

  **Adapt the registration line** to whatever the actual panel registry expects — the comment above each panel in `public/crm/js/dashboard/panels/` will show the convention.

- [ ] **Step 3: Wire into the router + nav**

  - In `public/crm/js/dashboard/router.js` (or wherever routes are mapped to panels), add a route entry for `admin-ethics` that resolves to the new panel. Mark it broker-only using whatever existing flag pattern the router already supports.
  - In `public/crm/dashboard.html`, add a nav link inside the broker-only menu — e.g. `<a href="#admin-ethics" data-role="BROKER">Ethics Training</a>` (use the existing nav markup pattern; don't invent a new one).
  - Make sure the new `<script>` for `admin-ethics.js` is loaded by `dashboard.html` (look at how the other `panels/*.js` files are loaded — likely either dynamic `import()` or a `<script src>` near the bottom).

- [ ] **Step 4: Manual smoke**

  ```bash
  npm run dev
  # log in as broker (Maya) → click the new "Ethics Training" nav item
  ```
  - Table loads with all active agents.
  - Status column shows EXPIRED / Expires in Nd / Valid colors correctly.
  - Set a date, click Save → row updates; refresh shows persisted values.
  - Try setting expires < completed → server returns 400; UI shows the error.

- [ ] **Step 5: Commit**

  ```bash
  git add public/crm/js/dashboard/panels/admin-ethics.js \
          public/crm/js/dashboard/router.js \
          public/crm/dashboard.html
  git commit -m "feat(c4c): broker admin panel for ethics training"
  ```

## Task 5: Final audit + open PR

- [ ] **Step 1: All gates**
  ```bash
  npm run type-check
  npm run ucba:audit
  npm run rls:validate
  npm run idx:validate
  npm run crm:test         # if PR 11 has merged; otherwise note "blocked on PR 11"
  npx vitest run tests/runtime/auth-ethics-gate.test.ts
  npx vitest run tests/runtime/dev-login-ethics-catch.test.ts
  npm run ops:health
  npm run ci
  ```

- [ ] **Step 2: Push + PR**

  ```bash
  git push -u origin feat/c4c-ethics-admin-panel
  gh pr create --title "feat(c4c): broker ethics admin panel + dev-login catch" --body "$(cat <<'EOF'
  ## What

  Final residual pieces of Workstream C4 (UCBA Art. III §6).

  Schema in PR #51, auth-gate in PR #58, backfill script committed in PR #59. This PR closes the loop with:

  1. **Broker admin panel** at the new "Ethics Training" CRM nav entry. Lists every active agent with their `completed_at` + `expires_at`; broker can set/update both with one click. Status column flags EXPIRED, Expiring (<30d), Valid.
  2. **PATCH /api/crm/agents/:id/ethics-training** — broker-only, validates `expires >= completed`, caps at 5 years out, writes an `AuditEvent` for each change.
  3. **GET /api/crm/agents** — now exposes the two ethics dates so the panel can render them.
  4. **Dev-login catch** — `app/api/auth/dev-login/route.ts` now catches `EthicsTrainingExpiredError` and returns 403 with `retrainingUrl`, matching how `/api/auth/login` and `/api/auth/mfa/verify` already handle it. No more silent 500s.

  ## Production Verification Note

  **Post-deploy URL to hit:** `https://mallan.nyc/crm/dashboard.html` → broker menu → Ethics Training. Edit Maya's `completed_at` / `expires_at`, click Save. Verify the row updates, status flips to "Valid", and an `AuditEvent` row is written.
  **Metric to observe:** No new 500s on `/api/crm/agents` or `/api/crm/agents/:id/ethics-training`. `auth-ethics-gate.test.ts` and `dev-login-ethics-catch.test.ts` green in CI.
  **Rollback trigger:** Any agent inadvertently locked out, OR PATCH endpoint accepts non-broker auth, OR audit events not being written.
  **Success criteria within 30 minutes:** Broker can update an agent's training without seeing an error; affected agent's next session-token issuance succeeds; AuditEvent visible in DB.

  EOF
  )"
  ```

- [ ] **Step 3: CI green → review → merge**

- [ ] **Step 4: Update `memory/REFACTOR-2026-04-25.md`** Workstream C row C4c → `MERGED — <commit-sha> · <date>`. Close out the C4 row's "remaining" note.

## Definition of Done

- [ ] `GET /api/crm/agents` returns ethics dates
- [ ] `PATCH /api/crm/agents/:id/ethics-training` works with all the validation rules + audit event
- [ ] Broker admin panel renders, edits, saves, refreshes
- [ ] Dev-login returns 403 (with retraining URL) instead of 500 when broker training is expired
- [ ] All existing + new tests green
- [ ] No UCBA regressions
- [ ] PR merged + plan file updated
