/// <reference types="jest" />
/**
 * Add Agent onboarding contract — the defects that mislabelled a real licensee.
 *
 * A broker created an Associate Broker through the CRM roster. The account was
 * created, the headshot uploaded, and the UI reported an error — so the broker
 * retried ten times. What actually happened, and what this pins:
 *
 *  1. The licence select emits a human DESIGNATION ("Licensed Associate
 *     Broker"). It was posted verbatim into `license_type`, a column that holds
 *     "broker" | "salesperson".
 *  2. `title` was never sent at all, so it landed NULL and the public profile
 *     fell through to its "Licensed Real Estate Salesperson" display default —
 *     publicly advertising an Associate Broker as a salesperson
 *     (NY DOS 19 NYCRR 175.25).
 *  3. Every retry fired its own POST. The first succeeded; the rest hit the
 *     server's email-uniqueness check and returned 409, which the UI rendered
 *     as "Error" over an account that had been created.
 *  4. The photo follow-up read `photoRes.url`, but the route responds
 *     `{ photo }` — so that branch never ran.
 *
 * Read from source because this logic lives in the browser bundle; the
 * assertions are on behaviour-carrying values, not on formatting.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const panels = readFileSync(resolve(ROOT, 'public/crm/js/dashboard/panels.js'), 'utf8');
const apiClient = readFileSync(resolve(ROOT, 'public/crm/js/core/api-client.js'), 'utf8');

/** Pull the canonical map out of the bundle and evaluate it. */
function licenseDesignations(): Record<string, { license_type: string; title: string }> {
  const start = panels.indexOf('var LICENSE_DESIGNATIONS = {');
  expect(start).toBeGreaterThan(-1);
  const open = panels.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < panels.length; i++) {
    if (panels[i] === '{') depth++;
    else if (panels[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval('(' + panels.slice(open, end + 1) + ')');
}

describe('licence designation is mapped, not posted verbatim', () => {
  const map = licenseDesignations();

  it('an Associate Broker stores licence "broker" and the Associate Broker title', () => {
    expect(map['Licensed Associate Broker']).toEqual({
      license_type: 'broker',
      title: 'Licensed Real Estate Associate Broker',
    });
  });

  it('the principal broker designation is distinct from the associate one', () => {
    expect(map['Licensed Broker']).toEqual({
      license_type: 'broker',
      title: 'Licensed Real Estate Broker',
    });
    expect(map['Licensed Broker'].title).not.toBe(map['Licensed Associate Broker'].title);
  });

  it('a salesperson stores licence "salesperson"', () => {
    expect(map['Licensed Real Estate Salesperson']).toEqual({
      license_type: 'salesperson',
      title: 'Licensed Real Estate Salesperson',
    });
  });

  it('every option the form offers has a mapping — none can fall through', () => {
    const offered = [...panels.matchAll(/<option value="(Licensed [^"]+)"/g)].map((m) => m[1]);
    expect(offered.length).toBeGreaterThan(0);
    for (const o of new Set(offered)) expect(Object.keys(map)).toContain(o);
  });

  it('license_type only ever holds the two values the column documents', () => {
    for (const v of Object.values(map)) {
      expect(['broker', 'salesperson']).toContain(v.license_type);
    }
  });

  it('no designation string is ever stored as a license_type', () => {
    expect(panels).not.toContain('license_type: raw.license_type');
    expect(panels).toContain('license_type: designation.license_type');
  });
});

describe('field ownership — what the form collects, it sends', () => {
  it('sends the public professional identity, not just the eight legacy fields', () => {
    for (const field of ['title:', 'bio:', 'public_slug:', 'languages:', 'specialties:']) {
      expect(panels).toContain(field);
    }
  });

  it('renders inputs for the public profile it now sends', () => {
    for (const name of ['name="title"', 'name="bio"', 'name="languages"', 'name="specialties"', 'name="public_slug"']) {
      expect(panels).toContain(name);
    }
  });

  it('maps the split field the form actually renders (agent_split)', () => {
    expect(panels).toContain('name="agent_split"');
    expect(panels).toContain('raw.agent_split');
    // the old mapping read fields that do not exist, so splits were dropped
    expect(panels).not.toContain('raw.sale_split ?');
  });

  it('never sends `role` — authorisation is server-side and hardcoded AGENT', () => {
    const start = panels.indexOf('function _submitAddAgent');
    const body = panels.slice(start, panels.indexOf('function _editAgent', start));
    expect(body).not.toMatch(/\brole:/);
  });
});

describe('idempotence and truthful states', () => {
  it('guards against double-submit creating a second POST', () => {
    expect(panels).toContain('var _addAgentBusy = false;');
    expect(panels).toContain('if (_addAgentBusy) return;');
  });

  it('reports account creation BEFORE any follow-up step can fail', () => {
    const start = panels.indexOf('MallanAPI.agents.create(data)');
    const afterCreate = panels.slice(start, start + 1200);
    expect(afterCreate).toContain('Account created for');
  });

  it('a failed headshot is a warning, never "the agent was not created"', () => {
    expect(panels).toContain('Account created, but the headshot did not upload');
  });

  it('a duplicate email says so plainly instead of a generic error', () => {
    expect(panels).toContain('already exists');
    expect(panels).toContain('no new record was created');
  });

  it('reads the photo response key the route actually returns', () => {
    expect(panels).toContain('photoRes.photo');
    expect(panels).not.toContain('photoRes.url');
  });
});

describe('Delete Permanently is wired and distinct from Deactivate', () => {
  it('the API client exposes both the preview and the purge', () => {
    expect(apiClient).toContain('purgePreview: function (id)');
    expect(apiClient).toContain('purge: function (id, confirmEmail)');
    expect(apiClient).toContain("'/purge-preview'");
  });

  it('the roster keeps Deactivate AND adds Delete Permanently', () => {
    expect(panels).toContain('Panels._deactivateAgent(');
    expect(panels).toContain('Panels._purgeAgent(');
    expect(panels).toContain('Delete Permanently');
  });

  it('the purge asks for a preview first and requires a typed email', () => {
    const start = panels.indexOf('function _purgeAgent');
    const body = panels.slice(start, panels.indexOf('function _addAgent', start));
    expect(body).toContain('MallanAPI.agents.purgePreview(id)');
    expect(body).toContain('typed.trim().toLowerCase() !== email.toLowerCase()');
    expect(body).toContain('if (_purgeBusy) return;');
  });

  it('a refusal directs the broker to Deactivate', () => {
    const start = panels.indexOf('function _purgeAgent');
    const body = panels.slice(start, panels.indexOf('function _addAgent', start));
    expect(body).toContain('Use Deactivate instead');
    expect(body).toContain('Blocked by:');
  });

  it('is served directly by dashboard.html, so no build step can drop it', () => {
    // panels.js is NOT inlined into index-built.html - dashboard.html loads it
    // with a plain <script src>. Verified so a future bundling change cannot
    // silently stop shipping the roster controls.
    const dash = readFileSync(resolve(ROOT, 'public/crm/dashboard.html'), 'utf8');
    expect(dash).toContain('/crm/js/dashboard/panels.js');
  });
});
