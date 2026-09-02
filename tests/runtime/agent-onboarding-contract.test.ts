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
    expect(map['Licensed Associate Broker']).toMatchObject({
      license_type: 'broker',
      title: 'Licensed Real Estate Associate Broker',
    });
  });

  it('the principal broker designation is distinct from the associate one', () => {
    expect(map['Licensed Broker']).toMatchObject({
      license_type: 'broker',
      title: 'Licensed Real Estate Broker',
    });
    expect(map['Licensed Broker'].title).not.toBe(map['Licensed Associate Broker'].title);
  });

  it('a salesperson stores licence "salesperson"', () => {
    expect(map['Licensed Real Estate Salesperson']).toMatchObject({
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

describe('visible-field census - nothing disappears silently', () => {
  const formRegion = panels.slice(
    panels.indexOf('function _addAgent() {'),
    panels.indexOf('function _submitAddAgent'),
  );
  const inputNames = [...formRegion.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]);

  it('license_expiry is persisted on CREATE, not only on PATCH', () => {
    const api = readFileSync(resolve(ROOT, 'app/api/crm/agents/route.ts'), 'utf8');
    expect(api).toContain('license_expiry:');
    expect(panels).toContain('license_expiry: raw.license_expiry');
  });

  it('Cotality MemberMlsId is stored in the existing trestle_mls_id column', () => {
    const api = readFileSync(resolve(ROOT, 'app/api/crm/agents/route.ts'), 'utf8');
    expect(api).toContain('trestle_mls_id:');
    expect(panels).toContain('trestle_mls_id: raw.mls_member_id');
  });

  it('every input with no canonical Agent field is visibly disabled, not silently dropped', () => {
    const unowned = [
      'middle_name', 'secondary_phone', 'home_address', 'city', 'state', 'zip',
      'license_status', 'nrds_id', 'fair_housing_completed', 'start_date', 'team',
      'desk_fee', 'referral_fee_pct', 'contract_term', 'internal_notes',
      'ce_hours_completed', 'ce_cycle_end_date',
      // no writer can target the NEW agent, so these are disabled too
      'ica_document', 'other_documents',
    ];
    for (const f of unowned) {
      const re = new RegExp('name="' + f + '"[^>]*disabled|disabled[^>]*name="' + f + '"');
      expect(formRegion).toMatch(re);
    }
  });

  it('every ENABLED input is either sent or owned by a separate writer', () => {
    const sentOrOwned = [
      'first_name', 'last_name', 'email', 'phone', 'license_number', 'license_type',
      'license_expiry', 'mls_member_id', 'agent_split', 'title', 'bio',
      'languages', 'specialties', 'public_slug',
      'agent_photo', // separate writer: the photo route takes a target agent
    ];
    const enabled = inputNames.filter((n) => {
      const re = new RegExp('name="' + n + '"[^>]*disabled|disabled[^>]*name="' + n + '"');
      return !re.test(formRegion);
    });
    for (const n of new Set(enabled)) expect(sentOrOwned).toContain(n);
  });
});

describe('Save Draft is gone, because it was never a draft', () => {
  it('the control no longer exists', () => {
    expect(panels).not.toContain("_submitAddAgent(\\'draft\\')");
  });

  it('only one submit path remains, and it always validates', () => {
    // The calls sit inside a JS string literal, so the quotes are
    // backslash-escaped in the source. Match the literal text.
    const CREATE = "_submitAddAgent(\\'create\\')";
    const DRAFT = "_submitAddAgent(\\'draft\\')";
    expect(panels).toContain(CREATE);
    expect(panels).not.toContain(DRAFT);
    expect(panels.split(CREATE).length - 1).toBe(1);
    expect(panels).toContain('if (!form.checkValidity())');
  });

  it('the server still hardcodes an active account, which is why no draft is possible', () => {
    const api = readFileSync(resolve(ROOT, 'app/api/crm/agents/route.ts'), 'utf8');
    expect(api).toContain('status: "active"');
  });
});

describe('no UI state claims something that did not happen', () => {
  it('the button says what it does - it creates an account, it does not invite', () => {
    expect(panels).toContain('Create Agent Account');
    expect(panels).not.toContain('> Send Invite<');
  });

  it('the temp-password toast states plainly that nothing was sent', () => {
    expect(panels).toContain('No invitation was sent');
    expect(panels).toContain('give this to the agent directly');
  });

  it('document inputs are disabled, because no writer can target the new agent', () => {
    // app/api/crm/documents/upload/route.ts hardcodes agent_id: auth.userId,
    // so uploading here would file the new agent's ICA under the BROKER.
    const upload = readFileSync(resolve(ROOT, 'app/api/crm/documents/upload/route.ts'), 'utf8');
    expect(upload).toContain('agent_id: auth.userId');
    for (const f of ['ica_document', 'other_documents']) {
      expect(panels).toMatch(new RegExp('name="' + f + '"[^>]*disabled'));
    }
  });

  it('the ICA label no longer marks a requirement the input never enforced', () => {
    expect(panels).not.toContain('Independent Contractor Agreement) *');
    expect(panels).toContain('upload not yet available');
  });
});

describe('member identity is stored in its exact domain', () => {
  it('the input names the identity it stores, not a business-facing synonym', () => {
    // Cotality Member exposes MemberMlsId, MemberAORMlsId,
    // MemberNationalAssociationId, MemberAlternateId, MemberKey,
    // MemberStateLicense and UniqueLicenseeIdentifier as SEPARATE fields.
    expect(panels).toContain('MLS Member ID');
    expect(panels).toContain('Cotality MemberMlsId');
    expect(panels).not.toContain('REBNY Member ID');
  });

  it('NRDS and the state licence remain separate facts, never merged', () => {
    expect(panels).toContain('name="nrds_id"');
    expect(panels).toContain('name="license_number"');
    // nrds_id has no canonical Agent column, so it stays disabled rather than
    // being folded into trestle_mls_id
    expect(panels).toMatch(/name="nrds_id"[^>]*disabled/);
    expect(panels).not.toContain('trestle_mls_id: raw.nrds_id');
  });

  it('the edit form binds the column the API actually returns', () => {
    expect(panels).toContain("E(a.trestle_mls_id || '')");
    expect(panels).not.toContain('a.rebny_member_id');
  });
});

// ─── Behavioural: evaluate the real designation functions out of the bundle ──
function evalDesignationFns() {
  const grab = (needle: string) => {
    const i = panels.indexOf(needle);
    expect(i).toBeGreaterThan(-1);
    const open = panels.indexOf('{', i);
    let depth = 0;
    for (let j = open; j < panels.length; j++) {
      if (panels[j] === '{') depth++;
      else if (panels[j] === '}') { depth--; if (depth === 0) return panels.slice(i, j + 1); }
    }
    throw new Error('unbalanced: ' + needle);
  };
  const src = [
    grab('var LICENSE_DESIGNATIONS = {').replace(/^var /, 'const '),
    grab('function _designationFor(selected)'),
    grab('function _designationFromStored(licenseType, role)'),
    'return { LICENSE_DESIGNATIONS, _designationFor, _designationFromStored };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(src)() as {
    _designationFor: (d: string) => { license_type: string | null; title: string | null };
    _designationFromStored: (lt: string | null, title: string | null) => string;
  };
}

describe('designation round trip — one owner for CREATE and EDIT', () => {
  const { _designationFor, _designationFromStored } = evalDesignationFns();

  it('every designation survives designation -> stored -> designation', () => {
    const roleFor = (d: string) => (d === 'Licensed Broker' ? 'BROKER' : 'AGENT');
    for (const d of ['Licensed Real Estate Salesperson', 'Licensed Associate Broker', 'Licensed Broker']) {
      const stored = _designationFor(d);
      expect(_designationFromStored(stored.license_type, roleFor(d))).toBe(d);
    }
  });

  it('an Associate Broker reopens as Associate, distinguished by ROLE not title', () => {
    // both store license_type "broker"; role is the stable discriminator, and
    // the title is broker-editable so it cannot carry a licence class
    expect(_designationFromStored('broker', 'AGENT')).toBe('Licensed Associate Broker');
    expect(_designationFromStored('broker', 'BROKER')).toBe('Licensed Broker');
  });

  it('stores canonical licence classes, never display strings', () => {
    for (const d of ['Licensed Real Estate Salesperson', 'Licensed Associate Broker', 'Licensed Broker']) {
      expect(['broker', 'salesperson']).toContain(_designationFor(d).license_type);
    }
  });

  it('an unknown or unset licence forces an explicit choice rather than guessing', () => {
    expect(_designationFromStored(null, null)).toBe('');
    expect(_designationFromStored('Licensed Associate Broker', 'AGENT')).toBe('');
  });
});

describe('Edit Agent cannot recreate the licence corruption', () => {
  const editSubmit = panels.slice(
    panels.indexOf('function _submitEditAgent'),
    panels.indexOf('function _submitEditAgent') + 3000,
  );

  it('resolves the designation instead of posting the raw select value', () => {
    expect(editSubmit).not.toContain('data.license_type = raw.license_type;');
    expect(editSubmit).toContain('_designationFor(raw.license_type)');
    expect(editSubmit).toContain('data.license_type = editDesignation.license_type');
  });

  it('the edit select preselects from STORED values, not display-string equality', () => {
    expect(panels).not.toContain("a.license_type === 'Licensed Associate Broker'");
    expect(panels).toContain('_designationFromStored(a.license_type, a.role)');
  });

  it('every unowned edit control is disabled', () => {
    const editForm = panels.slice(
      panels.indexOf('function _editAgent(id) {'),
      panels.indexOf('function _submitEditAgent'),
    );
    for (const f of ['middle_name', 'secondary_phone', 'home_address', 'city', 'state', 'zip',
                     'license_status', 'nrds_id', 'ce_hours_completed', 'ce_cycle_end_date',
                     'fair_housing_completed', 'start_date', 'team', 'desk_fee',
                     'referral_fee_pct', 'contract_term', 'internal_notes']) {
      expect(editForm).toMatch(new RegExp('name="' + f + '"[^>]*disabled'));
    }
  });

  it('DOS licence status is never conflated with the CRM account status', () => {
    const editForm = panels.slice(
      panels.indexOf('function _editAgent(id) {'),
      panels.indexOf('function _submitEditAgent'),
    );
    // license_status (DOS) is disabled; status (account) stays editable
    expect(editForm).toMatch(/name="license_status"[^>]*disabled/);
    expect(editSubmit).toContain('data.status = raw.status');
    expect(editSubmit).not.toContain('data.status = raw.license_status');
  });
});

describe('MemberMlsId is readable end to end, and fails closed on write', () => {
  const create = readFileSync(resolve(ROOT, 'app/api/crm/agents/route.ts'), 'utf8');
  const detail = readFileSync(resolve(ROOT, 'app/api/crm/agents/[id]/route.ts'), 'utf8');

  it('CREATE never writes a client-supplied value — it stores NULL', () => {
    // P1-5: metadata proves the field exists; it does not prove a typed value
    // belongs to this agent. Until a live Member resolver exists, the column
    // stays NULL and a non-null client write is refused.
    expect(create).toContain('trestle_mls_id: null');
    expect(create).toContain('rejectUnverifiedMemberMlsId');
  });

  it('ROSTER GET selects it', () => {
    expect(create).toContain('trestle_mls_id: true');
  });

  it('DETAIL GET returns it', () => {
    expect(detail).toContain('trestle_mls_id: agent.trestle_mls_id');
  });

  it('PATCH refuses a client-supplied value rather than writing it', () => {
    expect(detail).toContain('rejectUnverifiedMemberMlsId');
    expect(detail).not.toContain('update.trestle_mls_id = body.trestle_mls_id');
  });

  it('the edit form can DISPLAY a verified value once one exists', () => {
    expect(panels).toContain("E(a.trestle_mls_id || '')");
    // the input itself is disabled pending verification, so nothing is typed in
    expect(panels).toMatch(/name="mls_member_id"[^>]*disabled/);
  });

  it('is never merged with the other Cotality member identities', () => {
    // Member.MemberMlsId and Member.MemberAORMlsId are separate String(25)
    // nullable fields; NRDS is MemberNationalAssociationId; the state licence
    // is MemberStateLicense. None may be folded into trestle_mls_id.
    expect(panels).not.toContain('trestle_mls_id: raw.nrds_id');
    expect(panels).not.toContain('trestle_mls_id: raw.license_number');
    expect(detail).not.toContain('trestle_mls_id = body.nrds_id');
  });
});

describe('the client table MIRRORS the server contract', () => {
  const { _designationFor } = evalDesignationFns();

  it('matches lib/agents/license-designation.ts exactly', () => {
    // The browser cannot import the TS module, so the values are duplicated.
    // The server is the authority and refuses non-canonical values at the API
    // boundary; this proves the mirror has not drifted.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const server = require('../../lib/agents/license-designation') as {
      DESIGNATION_MAP: Record<string, { license_type: string; title: string; requiresBrokerRole: boolean }>;
    };
    for (const [designation, expected] of Object.entries(server.DESIGNATION_MAP)) {
      const client = _designationFor(designation) as unknown as Record<string, unknown>;
      expect(client.license_type).toBe(expected.license_type);
      expect(client.title).toBe(expected.title);
      expect(client.requiresBrokerRole).toBe(expected.requiresBrokerRole);
    }
  });

  it('Add Agent does not offer the principal-broker designation', () => {
    // POST hardcodes role AGENT, so that option would mint a contradictory record
    const createForm = panels.slice(
      panels.indexOf('function _addAgent() {'),
      panels.indexOf('function _submitAddAgent'),
    );
    expect(createForm).toContain('<option value="Licensed Associate Broker"');
    expect(createForm).not.toContain('<option value="Licensed Broker"');
  });

  it('the public title is derived and read-only, never a free-form tagline', () => {
    expect(panels).toContain('data-derived-from="license_type+role"');
    expect(panels).not.toContain('Title / Tagline');
    expect(panels).toContain('title: designation.title');
    expect(panels).not.toContain('title: raw.title || designation.title');
  });

  it('MLS Member ID is disabled pending provider verification', () => {
    // trestle_mls_id is real identity evidence elsewhere; a typed string is not
    // a verified Cotality MemberMlsId.
    expect(panels).toMatch(/name="mls_member_id"[^>]*disabled/);
    expect(panels).toContain('data-requires-provider-verification');
  });
});
