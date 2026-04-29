# RESO MCP server setup

Layer 3 from the RESO toolkit plan. Once installed, Claude Code (and
any other MCP-aware client — Claude Desktop, Cursor, etc.) can call
RESO tools directly without writing fresh scripts each session.

The official RESO MCP server is in **public beta** as of 2026-04. This
runbook is a step-by-step you can run in ~20–30 minutes when you're
ready. **Nothing in this repo gets pushed by following it** — the only
file changes are under `~/.claude/` (or a project-scoped `.mcp.json`)
and a credential file you control.

---

## 1. Get a RESO beta token

Email `dev@reso.org` from your `mallan.nyc` address. Tell them you
operate a REBNY-licensed brokerage already on Cotality/Trestle IDX
Plus and want the RESO MCP beta token.

Reply usually arrives within a business day. They send back a token
plus a short MCP server URL.

> **You do not need this token to use the RESO Desktop Client v0.11
> you already have installed.** That client uses your existing
> Trestle OAuth credentials. The beta token is only needed for the
> hosted MCP path described in step 3b.

---

## 2. Pick a deployment path

Two equally valid options. Pick one — don't run both.

### Path A — Local server from the public repo (no beta token required)

Clone the public RESO tools repo and run the server locally from your
machine. Claude Code spawns it as a subprocess and the token (if any)
stays in your shell environment.

```bash
git clone https://github.com/RESOStandards/reso-tools.git ~/reso-tools
cd ~/reso-tools
npm install
```

Pros: no waiting on RESO email, no token passes through anyone else's
infrastructure, fully offline-capable for cached metadata.

Cons: needs `node` ≥ 20 on the local box, periodically `git pull` to
stay current.

### Path B — Hosted MCP via `dev@reso.org` token

After you receive the token from step 1, the RESO team sends the
hosted MCP endpoint URL. Skip the local clone; Claude Code talks
directly to the hosted endpoint.

Pros: no local install, RESO maintains it, faster to bootstrap.

Cons: requires the email back-and-forth, token sits in
`~/.claude/mcp.json`.

---

## 3. Configure Claude Code to use it

Claude Code reads MCP server configs from two places:

- `~/.claude/mcp.json` — global; available in every Claude Code
  session on this machine, regardless of which repo you opened.
- `<repo>/.mcp.json` — project-scoped; only loaded when this repo is
  the working directory.

**Recommended placement: `~/.claude/mcp.json`.** That's what gives you
"works everywhere" — the win the toolkit plan called out.

Create the file (it doesn't exist yet on this machine — verified):

```bash
mkdir -p ~/.claude
touch ~/.claude/mcp.json
```

Then paste **one** of the following stanzas, depending on which path
you chose in step 2.

### Stanza for Path A (local)

```json
{
  "mcpServers": {
    "reso-tools": {
      "command": "node",
      "args": ["~/reso-tools/server.js"],
      "env": {
        "TRESTLE_CLIENT_ID": "${env:IDX_CLIENT_ID}",
        "TRESTLE_CLIENT_SECRET": "${env:IDX_CLIENT_SECRET}",
        "TRESTLE_API_URL": "https://api.cotality.com/trestle"
      }
    }
  }
}
```

The `${env:IDX_CLIENT_ID}` syntax pulls the value from your shell
environment at startup — keeps the secret out of the JSON file. Make
sure `IDX_CLIENT_ID` and `IDX_CLIENT_SECRET` are set in your shell
profile (or rely on `.env.local` in the project — the local server
will resolve them).

### Stanza for Path B (hosted)

```json
{
  "mcpServers": {
    "reso-tools": {
      "url": "https://<the-url-from-the-RESO-email>",
      "headers": {
        "Authorization": "Bearer ${env:RESO_BETA_TOKEN}"
      }
    }
  }
}
```

Set `RESO_BETA_TOKEN` in your shell profile so it's not in the JSON.

---

## 4. Verify the install

Restart Claude Code (or any MCP-aware client) so it picks up the new
config. Then in a session:

> `Use reso-tools to list the entities Cotality exposes for our IDX
> Plus license.`

If the server is wired correctly, the response will list ~16
resources (Property, Member, Office, Media, OpenHouse, etc.) with
their advertised RESO certification levels.

If the call fails:

- 401 → token wrong or expired (Path B), or missing OAuth env vars
  (Path A).
- 404 → URL in `~/.claude/mcp.json` is wrong.
- "Server not found" → Claude Code didn't reload; restart the editor.

---

## 5. What you can do once it's wired

- "Read me ListingId `RLS20059088` with `$expand=Media,OpenHouse`."
- "Show distinct values for `CommonInterest` populated in our active
  feed."
- "Diff our cached `artifacts/metadata.xml` against the live RESO
  metadata and tell me what changed."
- "Validate the response of `/api/listings?type=sale&limit=5` against
  the RESO Property schema and list any non-conforming fields."

The MCP server provides a small, stable tool vocabulary the AI can
compose. You stop writing fresh scripts for each question.

---

## 6. What this does NOT replace

The MCP server is a **diagnostic + lookup** tool. It does **not**:

- Replace the project's `lib/idx/` writer paths. Those continue to
  ingest from Trestle and own the dual-write to Postgres + projection.
- Replace `lib/compliance/` gate enforcement. Compliance gates are
  enforced server-side at every read surface; the MCP can verify but
  not enforce.
- Replace `scripts/reso/` (the read-only toolkit in this repo). The
  toolkit knows about *our* DB, projection, and public site too —
  the MCP only sees Trestle.

**They complement each other.** Use the toolkit for parity / coverage
/ snapshot questions that span Trestle + DB + public. Use the MCP
for "ask Claude something against the RESO standard itself" without
needing me to write a fresh probe script.

---

## 7. When to run this

- **Before May 5**: optional. Toolkit alone (already in
  `scripts/reso/`) covers most diagnostic needs you've raised.
- **After May 5** (master plan ships): higher-value. Use it as the
  default RESO interface going forward.

---

## Appendix — sanity-check commands without the MCP

If you want to test that you have RESO API access *right now* without
installing the MCP server, the read-only toolkit already in this repo
will do it:

```bash
npm run reso:analyze          # one-shot Trestle + DB + public report
npm run reso:count -- --entity=Property --filter="StandardStatus eq 'Active'"
npm run reso:query -- --entity=Property --top=3 --select="ListingId,StandardStatus,ListPrice"
```

These work today with no further setup.
