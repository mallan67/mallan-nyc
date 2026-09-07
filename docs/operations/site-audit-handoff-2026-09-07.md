# Operational handoff — 2026-09-07

> Session: cloud (`anthropic_cloud`, origin `web_claude_ai`), branch
> `claude/mallan-cotality-context-l0o1oa`. This snapshot is **session-infrastructure
> only** — no compliance surface, schema, env var, or §C hold item was touched.

## Repository identity at time of writing

| | |
|---|---|
| `origin/main` | `2a83952` — Merge PR #626 (`feat/agent-profile-claudia-milkowski-2026-09-01`) |
| Open PRs | 20+ open, **19 of 20 are drafts**; only #599 is non-draft |
| Working tree | clean |

---

## 1. Cotality live access from cloud sessions — ESTABLISHED

Cloud sessions run behind an agent proxy configured to **inject the
`MALLAN-COTALITY` credential into any outbound request to `api.cotality.com`**.
No local credential is required or present.

### Proof (Class B — live feed, per CLAUDE.md §J.4)

Environment as observed in-session:

```
IDX_CLIENT_ID     = unset
IDX_CLIENT_SECRET = unset
IDX_API_KEY       = unset
IDX_API_SECRET    = unset
TRESTLE_API_URL   = https://api.cotality.com/trestle
```

Request and response:

```
curl 'https://api.cotality.com/trestle/odata/Property?$top=1&$select=ListingKey'
→ HTTP 200
{"@odata.context":".../$metadata#Property/Cotality.DataStandard.RESO.DD.Property",
 "value":[{"ListingKey":"1189972582"}], ...}
```

A 200 carrying real feed data with **zero local credentials** establishes that the
proxy performed authentication.

### What this proves — and what it does NOT

| Proves | Does not prove |
|---|---|
| A cloud session can perform the live Cotality verification that CLAUDE.md §J.4 requires for Class B/C/D findings | Anything about production auth |
| `api.cotality.com` is reachable and answering | That any specific field is populated — each field claim still needs its own live query |

### Standing constraints

- **Session-only.** Production on Vercel does not use this proxy. `lib/idx/auth.ts`
  performs the OAuth2 `client_credentials` grant using `IDX_CLIENT_ID` /
  `IDX_CLIENT_SECRET`. That remains the sole production auth path.
- **Never write code that depends on the injected credential.** It is a verification
  affordance for the agent, not a runtime path. Application code keeps using
  `getAccessToken()`.
- `mcp__trestle-fields__*` returns the **static registry** (Class A evidence).
  A live query is **Class B evidence**. Not interchangeable — label which was used,
  per §J.8.

### Related open thread

Session `session_01QSRHeDpZecbkcpDcKXs8dx` ("Cloud environment verification",
branch `claude/cloud-env-verification-rb65h5`) reports that Node's `fetch` needs
`NODE_USE_ENV_PROXY=1` to route through the proxy, and that the Trestle MCP server
exits at startup on a hard `IDX_CLIENT_ID`/`IDX_CLIENT_SECRET` check
(`index.ts:100-108`). **That session is blocked awaiting Maya's approval.** This
explains why `curl` reaches Cotality while the MCP path does not.
*Unverified here — reported by that session, recorded as a hypothesis.*

---

## 2. Cloud session isolation — ESTABLISHED

Observed from inside this session:

```
pwd       → /home/user/mallan-nyc
hostname  → vm
/mnt/c    → does not exist
/media    → empty
```

- Cloud sessions clone the repo fresh into an **ephemeral container**. Nothing is
  shared with, or written to, any local desktop.
- **CLAUDE.md rule A.3 cannot be satisfied from a cloud session.** The required
  mirror to `C:\Users\MayaAllan\Desktop\memory\` is unreachable from here. Any
  `memory/` write made in a cloud session leaves the mirror obligation outstanding
  until a local CLI (`bridge`) session performs it. **Prefer doing `memory/` work
  in a local session.**
- The container is reclaimed when the session ends. **Unpushed work is lost** —
  see §3.

---

## 3. Cross-session state — four stalled sessions, all awaiting Maya

Session records are readable via `list_sessions` / `get_session`; **transcripts are
not**. A session's work is recoverable only if it left a durable artifact (pushed
branch, PR, published artifact, committed file).

| Session | Branch | Blocked on |
|---|---|---|
| Cloud environment verification `session_01QSRHeDpZecbkcpDcKXs8dx` | `claude/cloud-env-verification-rb65h5` | Approval to wire `NODE_USE_ENV_PROXY=1` into `.mcp.json` and relax the credential guard at `index.ts:100-108` |
| Mallan workstream coordination `session_015aiS7P4oSPuoP9oCJ12Tqw` | `claude/mallan-workstream-coord-4du74t` | Whether to publish its output as an artifact page |
| Mallan-nyc Cotality API feed `session_01HSjtqENV4ecHof1tKqCFft` (archived) | `fix/neon-p0-event-driven-wake-2026-08-16` | Three CRM form fields, its section 5 |
| Rental P0 Cotality resource mapping `session_01Usd6wd7unAtLERbDXvgpBM` (archived) | same | 4 decisions: Building Media schema owner · Stamp Mallan identity auth · doc/video pipeline scope · co-list participant limit |

### Known data loss

`claude/mallan-workstream-coord-4du74t` **was never pushed**:

```
git fetch origin claude/mallan-workstream-coord-4du74t
→ fatal: couldn't find remote ref
```

That session consumed 214,247 tokens. Its analysis exists only in its own
scrollback and is **not recoverable from another session**.

### Branch contention

Three sessions share the branch `fix/neon-p0-event-driven-wake-2026-08-16`.
Session `session_01QW3WnBqsASwiBMQduWtgey` is stopped on a remote branch collision
against it.

---

## 4. Operating rules this session established

1. **One session per workstream; one branch per session.** Concurrent sessions on
   a shared branch produce the collision in §3.
2. **Push before leaving a tab.** Chat scrollback is invisible across sessions;
   only pushed commits, PRs, and published artifacts survive.
3. **Cloud vs local matters.** `memory/` work belongs in a local CLI session
   (mirror rule A.3). Live Cotality verification works in a cloud session (§1).
4. **A session's record is always readable; its reasoning is not.** To hand work
   between sessions, leave a file — not a conversation.

---

## Open decisions for Maya

1. Approve or decline the `NODE_USE_ENV_PROXY=1` + credential-guard change
   (unblocks the Trestle MCP server in cloud sessions).
2. Decide whether `claude/mallan-workstream-coord-4du74t` is worth reconstructing,
   or write it off.
3. Resolve the shared-branch collision on `fix/neon-p0-event-driven-wake-2026-08-16`.
4. Triage the 19 draft PRs — several are a month old.
