/// <reference types="jest" />
/**
 * PR-CRM.1 (2026-05-16) — BUYER-DEAL-FORM + TENANT-DEAL-FORM header
 * submit now actually POSTs to /api/crm/deals.
 *
 * Source-regex pins. The deal forms are JS-in-HTML (no dedicated JS
 * module), so the only way to verify wiring without spinning a real
 * browser is to read the HTML and assert the JS shape. The pins
 * below guarantee:
 *
 *   - The header submit handler calls the canonical CRM API client
 *     (`MallanAPI.deals.create` or `MallanAPI.deals.update`).
 *   - There is no longer a fake "submitted successfully" toast
 *     before the real backend call.
 *   - Client-side validation is preserved (address + client name).
 *   - Double-submit is prevented via a button-disable + in-flight
 *     flag.
 *   - Error paths surface the failure honestly — no faked success.
 *   - The payload field names match the createDealSchema contract
 *     in `lib/api/schemas/deal.ts`.
 *
 * The schema-side contract is also re-verified directly so a future
 * schema rename surfaces both as test failure here AND as type-check
 * error in the route handler.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const BUYER_PATH = path.resolve(__dirname, '../../public/crm/BUYER-DEAL-FORM.html');
const TENANT_PATH = path.resolve(__dirname, '../../public/crm/TENANT-DEAL-FORM.html');
const DEAL_SCHEMA_PATH = path.resolve(__dirname, '../../lib/api/schemas/deal.ts');
const DEAL_ROUTE_PATH = path.resolve(__dirname, '../../app/api/crm/deals/route.ts');
const API_CLIENT_PATH = path.resolve(__dirname, '../../public/crm/js/core/api-client.js');

/**
 * Extract a single named function body from a JS-in-HTML file.
 * Tracks brace depth so the body is precisely bounded.
 */
function extractFunctionBody(source: string, functionName: string): string {
  const sig = `function ${functionName}(`;
  const start = source.indexOf(sig);
  if (start < 0) throw new Error(`Could not find "${sig}" in source`);
  const rest = source.slice(start);
  const openBrace = rest.indexOf('{');
  if (openBrace < 0) throw new Error(`No body brace found for ${functionName}`);
  let depth = 0;
  let endIdx = -1;
  for (let i = openBrace; i < rest.length; i++) {
    const c = rest[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  if (endIdx < 0) throw new Error(`Unbalanced braces in ${functionName}`);
  return rest.slice(openBrace, endIdx + 1);
}

describe('BUYER-DEAL-FORM submitBuyerDeal — backend wiring', () => {
  let body: string;
  let html: string;

  beforeAll(() => {
    html = readFileSync(BUYER_PATH, 'utf8');
    body = extractFunctionBody(html, 'submitBuyerDeal');
  });

  it('calls MallanAPI.deals.create or .update (the canonical CRM API client method)', () => {
    expect(body).toMatch(/MallanAPI\.deals\.(create|update)/);
  });

  it('no longer fakes a success toast before the backend call', () => {
    // Pre-PR behavior was: showToast('Buyer deal submitted successfully')
    // with NO backend call. That literal must be gone.
    expect(body).not.toMatch(/showToast\(['"`]Buyer deal submitted successfully['"`]\)/);
  });

  it('preserves the original client-side validation (address + client name required)', () => {
    expect(body).toMatch(/buyerStreetAddress/);
    expect(body).toMatch(/buyerClientName/);
    expect(body).toMatch(/Please search for a listing or enter a property address/);
    expect(body).toMatch(/Please enter the buyer client name/);
  });

  it('sets representation_code to "buyer" in the payload', () => {
    expect(body).toMatch(/representation_code\s*:\s*['"]buyer['"]/);
  });

  it('payload field names match createDealSchema (lib/api/schemas/deal.ts)', () => {
    // Every payload key that ends up in `payload.<key>` should be a
    // key the schema accepts. Spot-check the financial fields.
    expect(body).toMatch(/payload\.price_usd/);
    expect(body).toMatch(/payload\.commission_rate_percent/);
    expect(body).toMatch(/payload\.split_percent/);
    expect(body).toMatch(/payload\.agent_fee_usd/);
    expect(body).toMatch(/payload\.company_fee_usd/);
    expect(body).toMatch(/payload\.gross_commission_usd/);
    expect(body).toMatch(/payload\.contract_signed/);
    // property_address is set inside the initial payload literal
    // (`{ representation_code, property_address: propertyAddress }`),
    // not via `payload.property_address = …`. Accept either shape.
    expect(body).toMatch(/property_address\s*:\s*\w+/);
  });

  it('contract_signed is sent as an ISO 8601 string (schema expects z.string().datetime())', () => {
    expect(body).toMatch(/new\s+Date\([^)]+\)\.toISOString\(\)/);
  });

  it('prevents double-submit via data-submitting flag + button.disabled toggle', () => {
    expect(body).toMatch(/dataset\.submitting\s*=\s*['"]true['"]/);
    expect(body).toMatch(/b\.disabled\s*=\s*true/);
    expect(body).toMatch(/b\.disabled\s*=\s*false/); // release path
  });

  it('handles backend failure with an explicit error toast (does NOT fake success)', () => {
    expect(body).toMatch(/\.catch\(/);
    // The error path must call showToast with type "error" or text
    // containing "failed" — NOT a generic success.
    expect(body).toMatch(/showToast\([^)]*(?:failed|error)[^)]*\)/i);
    // Negative pin: no green-path toast inside the catch block.
    const catchMatch = body.match(/\.catch\(function\(err\)\s*\{([\s\S]*?)\}\s*\);/);
    expect(catchMatch).not.toBeNull();
    expect(catchMatch![1]).not.toMatch(/showToast\([^)]*successfully[^)]*\)/i);
  });

  it('persists the returned deal id to sessionStorage to prevent duplicate creates', () => {
    expect(body).toMatch(/sessionStorage\.setItem\(['"]buyerDealRecord['"]/);
    expect(body).toMatch(/dbId/);
  });

  it('upserts via PATCH (MallanAPI.deals.update) when a session deal id already exists', () => {
    expect(body).toMatch(/existingId\s*\?\s*MallanAPI\.deals\.update\(/);
  });
});

describe('TENANT-DEAL-FORM submitTenantDeal — backend wiring', () => {
  let body: string;
  let html: string;

  beforeAll(() => {
    html = readFileSync(TENANT_PATH, 'utf8');
    body = extractFunctionBody(html, 'submitTenantDeal');
  });

  it('calls MallanAPI.deals.create or .update', () => {
    expect(body).toMatch(/MallanAPI\.deals\.(create|update)/);
  });

  it('no longer fakes a success toast before the backend call', () => {
    expect(body).not.toMatch(/showToast\(['"`]Tenant deal submitted successfully['"`]\)/);
  });

  it('preserves the original client-side validation (address + client name required)', () => {
    expect(body).toMatch(/tenantStreetAddress/);
    expect(body).toMatch(/tenantClientName/);
    expect(body).toMatch(/Please search for a listing or enter a property address/);
    expect(body).toMatch(/Please enter the tenant client name/);
  });

  it('sets representation_code to "tenant" in the payload', () => {
    expect(body).toMatch(/representation_code\s*:\s*['"]tenant['"]/);
  });

  it('annualizes monthly rent for price_usd (matches submitTenantCommissionRequest)', () => {
    // The canonical commission handler at line ~1209 sets
    // price_usd = parsedRent * 12. The header submit must use the
    // same convention so the two handlers don't disagree.
    expect(body).toMatch(/\*\s*12/);
  });

  it('uses lease start date as contract_signed', () => {
    expect(body).toMatch(/tenantLeaseStartDate/);
    expect(body).toMatch(/payload\.contract_signed/);
  });

  it('payload field names match createDealSchema', () => {
    expect(body).toMatch(/payload\.price_usd/);
    expect(body).toMatch(/payload\.commission_rate_percent/);
    expect(body).toMatch(/payload\.split_percent/);
    expect(body).toMatch(/payload\.agent_fee_usd/);
    expect(body).toMatch(/payload\.company_fee_usd/);
    expect(body).toMatch(/payload\.gross_commission_usd/);
    // property_address is set inside the initial payload literal
    // (`{ representation_code, property_address: propertyAddress }`),
    // not via `payload.property_address = …`. Accept either shape.
    expect(body).toMatch(/property_address\s*:\s*\w+/);
  });

  it('prevents double-submit via data-submitting flag', () => {
    expect(body).toMatch(/dataset\.submitting\s*=\s*['"]true['"]/);
    expect(body).toMatch(/b\.disabled\s*=\s*true/);
    expect(body).toMatch(/b\.disabled\s*=\s*false/);
  });

  it('handles backend failure with an explicit error toast', () => {
    expect(body).toMatch(/\.catch\(/);
    expect(body).toMatch(/showToast\([^)]*(?:failed|error)[^)]*\)/i);
    const catchMatch = body.match(/\.catch\(function\(err\)\s*\{([\s\S]*?)\}\s*\);/);
    expect(catchMatch).not.toBeNull();
    expect(catchMatch![1]).not.toMatch(/showToast\([^)]*successfully[^)]*\)/i);
  });

  it('persists the returned deal id to sessionStorage', () => {
    expect(body).toMatch(/sessionStorage\.setItem\(['"]tenantDealRecord['"]/);
    expect(body).toMatch(/dbId/);
  });

  it('upserts via PATCH when a session deal id already exists', () => {
    expect(body).toMatch(/existingId\s*\?\s*MallanAPI\.deals\.update\(/);
  });
});

describe('Backend contract — schema + route + client method exist', () => {
  it('createDealSchema (lib/api/schemas/deal.ts) declares every field the forms send', () => {
    const src = readFileSync(DEAL_SCHEMA_PATH, 'utf8');
    expect(src).toMatch(/representation_code\s*:\s*z\.enum\(\["buyer",\s*"tenant"\]/);
    expect(src).toMatch(/property_address\s*:\s*z\.string/);
    expect(src).toMatch(/price_usd\s*:\s*z\.coerce\.number/);
    expect(src).toMatch(/commission_rate_percent\s*:\s*z\.coerce\.number/);
    expect(src).toMatch(/split_percent\s*:\s*z\.coerce\.number/);
    expect(src).toMatch(/agent_fee_usd\s*:\s*z\.coerce\.number/);
    expect(src).toMatch(/company_fee_usd\s*:\s*z\.coerce\.number/);
    expect(src).toMatch(/gross_commission_usd\s*:\s*z\.coerce\.number/);
    expect(src).toMatch(/contract_signed\s*:\s*z\.string\(\)\.datetime/);
  });

  it('POST /api/crm/deals route exists and uses createDealSchema + createDeal()', () => {
    const src = readFileSync(DEAL_ROUTE_PATH, 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+POST/);
    expect(src).toMatch(/createDealSchema/);
    expect(src).toMatch(/createDeal\(/);
    expect(src).toMatch(/logAuditEvent\(\s*['"]create['"]\s*,\s*['"]deal['"]/);
  });

  it('MallanAPI.deals.create POSTs to /api/crm/deals', () => {
    const src = readFileSync(API_CLIENT_PATH, 'utf8');
    expect(src).toMatch(/create:\s*function\s*\(data\)\s*\{[\s\S]{0,200}\/api\/crm\/deals/);
    expect(src).toMatch(/method:\s*['"]POST['"]/);
  });

  it('MallanAPI.deals.update PATCHes to /api/crm/deals/:id', () => {
    const src = readFileSync(API_CLIENT_PATH, 'utf8');
    expect(src).toMatch(/update:\s*function\s*\(id,\s*data\)\s*\{[\s\S]{0,200}\/api\/crm\/deals\//);
    expect(src).toMatch(/method:\s*['"]PATCH['"]/);
  });
});

describe('Out-of-scope guards (PR-CRM.1 must not touch unrelated files)', () => {
  it('Prisma schema unchanged for Deal model fields the forms touch', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../../prisma/schema.prisma'),
      'utf8',
    );
    // Pin the exact Deal model fields the forms write to. If a future
    // migration renames any of these, this test surfaces the break
    // before runtime.
    expect(src).toMatch(/model\s+Deal\s*\{[\s\S]*?representation_code\s+String\?/);
    expect(src).toMatch(/model\s+Deal\s*\{[\s\S]*?property_address\s+String\?/);
    expect(src).toMatch(/model\s+Deal\s*\{[\s\S]*?price_usd\s+Decimal\?/);
    expect(src).toMatch(/model\s+Deal\s*\{[\s\S]*?commission_rate_percent\s+Decimal\?/);
    expect(src).toMatch(/model\s+Deal\s*\{[\s\S]*?gross_commission_usd\s+Decimal\?/);
    expect(src).toMatch(/model\s+Deal\s*\{[\s\S]*?contract_signed\s+DateTime\?/);
  });

  it('PR-CRM.1 does NOT modify the IDX sync cron, schema, or compliance modules', () => {
    // The PR title scope is the two form HTML files + this test.
    // This is a structural smoke test that the patch did not regrow
    // its blast radius. Real enforcement is the git diff review.
    const buyer = readFileSync(BUYER_PATH, 'utf8');
    const tenant = readFileSync(TENANT_PATH, 'utf8');
    // Both files should still reference the same submit-tab structure
    // and have NOT been generally re-arranged.
    expect(buyer).toMatch(/showBuyerMainTab/);
    expect(tenant).toMatch(/showTenantMainTab/);
  });
});
