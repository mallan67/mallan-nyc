/// <reference types="jest" />
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dataLoader = readFileSync(resolve(__dirname, '../../public/crm/js/core/data-loader.js'), 'utf8');
const searchEngine = readFileSync(resolve(__dirname, '../../public/crm/js/search/search-engine.js'), 'utf8');
const savedSearches = readFileSync(resolve(__dirname, '../../public/crm/js/search/saved-searches.js'), 'utf8');
const reports = readFileSync(resolve(__dirname, '../../public/crm/js/output/reports.js'), 'utf8');

describe('CRM raw ownership boundary', () => {
  it('never populates ownership from PropertyType', () => {
    expect(dataLoader).not.toContain("feat.CommonInterest || apiListing.property_type");
    expect(dataLoader).toContain("ownership: feat.CommonInterest == null ? null : feat.CommonInterest");
  });

  it('keeps null distinct from the literal None enum during local filtering', () => {
    expect(searchEngine).toContain("listing.ownership === null || listing.ownership === undefined || listing.ownership === ''");
    expect(searchEngine).not.toContain("listing.ownership.toLowerCase()");
  });

  it('stores ownership under its own saved-search criterion', () => {
    expect(savedSearches).toContain("ownership: c.ownership && c.ownership.length > 0 ? c.ownership : undefined");
    expect(savedSearches).not.toContain("property_type: c.ownership");
    expect(savedSearches).toContain("Array.isArray(criteria.ownership)");
  });

  it('restores legacy property_type-as-ownership only when a real CommonInterest control matches', () => {
    expect(savedSearches).toContain("Array.isArray(criteria.property_type)");
    expect(savedSearches).toContain("[data-field=\"CommonInterest\"][data-value=\"' + value");
  });

  it('keeps PropertySubType and Ownership Type separate in reports and CMA', () => {
    expect(reports).toContain("detRow('Property Subtype', first.propertySubType");
    expect(reports).toContain("detRow('Ownership Type', ownershipLabel(first.ownership)");
    expect(reports).toContain("compRows.push(['Property Subtype'");
    expect(reports).toContain("compRows.push(['Ownership Type'");
    expect(reports).not.toContain("ownershipLabel(l.ownership) || l.propertySubType");
  });
});
