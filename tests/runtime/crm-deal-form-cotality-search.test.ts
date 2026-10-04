/// <reference types="jest" />
import { readFileSync } from 'fs';
import { resolve } from 'path';

const buyer = readFileSync(resolve(__dirname, '../../public/crm/BUYER-DEAL-FORM.html'), 'utf8');
const tenant = readFileSync(resolve(__dirname, '../../public/crm/TENANT-DEAL-FORM.html'), 'utf8');

describe('Buyer/Tenant deal forms consume canonical Cotality search', () => {
  it('Buyer queries sale inventory by address and listing id', () => {
    expect(buyer).toContain("MallanAPI.idx.search({ type: 'sale', address: trimmed, limit: 20 })");
    expect(buyer).toContain("MallanAPI.idx.search({ type: 'sale', listingId: trimmed, limit: 20 })");
    expect(buyer).toContain('data.listings.map(normalizeBuyerCotalityListing)');
  });

  it('Tenant queries rental inventory by address and listing id', () => {
    expect(tenant).toContain("MallanAPI.idx.search({ type: 'rental', address: trimmed, limit: 20 })");
    expect(tenant).toContain("MallanAPI.idx.search({ type: 'rental', listingId: trimmed, limit: 20 })");
    expect(tenant).toContain('data.listings.map(normalizeTenantCotalityListing)');
  });

  it('keeps PropertySubType and raw ownership reference independent', () => {
    expect(buyer).toContain("ownership: l.ownership == null ? null : String(l.ownership)");
    expect(buyer).toContain("propertySubType: String(l.propertySubType || '')");
    expect(tenant).toContain("ownership: l.ownership == null ? null : String(l.ownership)");
    expect(tenant).toContain("propertySubType: String(l.propertySubType || '')");
    expect(buyer).toContain('id="buyerPropertySubType"');
    expect(buyer).toContain('id="buyerOwnershipType"');
    expect(tenant).toContain('id="tenantPropertySubType"');
    expect(tenant).toContain('id="tenantOwnershipType"');
    expect(buyer).not.toContain('id="buyerPropertyType"');
    expect(tenant).not.toContain('id="tenantPropertyType"');
  });

  it('does not synthesize provider status from Mallan pipeline status', () => {
    expect(buyer).not.toContain('BUYER_CRM_TO_RESO');
    expect(tenant).not.toContain('TENANT_CRM_TO_RESO');
    expect(buyer).toContain('Cotality StandardStatus');
    expect(tenant).toContain('Cotality StandardStatus');
  });

  it('never shows fabricated MLS ids or mock photos', () => {
    expect(buyer).toContain("setVal('buyerListingAgentMlsId', '')");
    expect(tenant).toContain("setVal('tenantListingAgentMlsId', '')");
    expect(buyer).toContain('No mock photos are shown');
    expect(tenant).toContain('No mock photos are shown');
    expect(buyer).not.toContain('var count = listing.photos || 6');
    expect(tenant).not.toContain('listing.photos || 6');
  });

  it('escapes provider text before inserting search results into HTML', () => {
    expect(buyer).toContain('escapeDealHtml');
    expect(tenant).toContain('escapeTenantDealHtml');
  });
});
