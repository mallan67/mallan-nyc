/// <reference types="jest" />
/**
 * Buyer / Tenant Deal forms: Save Draft saves a deal with status "draft" (it used to show "Draft saved successfully" and save nothing),
 * Submit saves it as "submitted", and a form can never set approved / rejected / closed.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createDealSchema, updateDealSchema } from '@/lib/api/schemas/deal';

const ROOT = resolve(__dirname, '../..');

describe('deal status from a form', () => {
  it('accepts draft and submitted, nothing else', () => {
    expect(createDealSchema.safeParse({ status: 'draft' }).success).toBe(true);
    expect(createDealSchema.safeParse({ status: 'submitted' }).success).toBe(true);
    expect(updateDealSchema.safeParse({ status: 'draft' }).success).toBe(true);
    for (const bad of ['approved', 'rejected', 'closed', 'DRAFT']) expect(createDealSchema.safeParse({ status: bad }).success).toBe(false);
  });
  it('a new deal without a status is submitted (the header Submit button)', () => {
    const src = readFileSync(resolve(ROOT, 'lib/db/deals.ts'), 'utf8');
    expect(src).toContain('status: data.status ?? "submitted"');
  });
  it('the PATCH route only moves a deal between draft and submitted', () => {
    const src = readFileSync(resolve(ROOT, 'app/api/crm/deals/[id]/route.ts'), 'utf8');
    expect(src).toContain('deal.status === "draft" || deal.status === "submitted"');
  });
});

describe.each([['BUYER-DEAL-FORM.html', 'submitBuyerDeal'], ['TENANT-DEAL-FORM.html', 'submitTenantDeal']])('%s', (file, fn) => {
  const src = readFileSync(resolve(ROOT, 'public/crm', file), 'utf8');
  it('Save Draft saves through the deal API as a draft, not a toast', () => {
    const draft = src.slice(src.indexOf('function manualSaveDraft')).slice(0, 200);
    expect(draft).toContain(fn + '(true)');
    expect(src).not.toContain("showToast('Draft saved successfully')");
    expect(src).toContain("status: asDraft === true ? 'draft' : 'submitted'");
  });
  it('fills the Listing Agent MLS ID from ListAgentMlsId', () => {
    expect(src).toContain("listingAgentMlsId: String(l.listAgentMlsId || '')");
    expect(src).not.toMatch(/ListingAgentMlsId', ''\)/);
  });
});
