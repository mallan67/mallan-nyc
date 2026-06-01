/// <reference types="jest" />
/**
 * Nav "Listings → Our Listings" must open the PUBLIC Company Exclusives page
 * (Mallan exclusives, filtered by exclusive=mallan), NOT the sign-in wall.
 * That page renders the exclusive cards with their canonical ADDRESS URLs.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const header = readFileSync(resolve(__dirname, '../../app/components/Header.tsx'), 'utf8');

describe('Header — Our Listings → public Company Exclusives', () => {
  it('the Mallan Exclusives dropdown source is exclusivesItems (desktop + mobile)', () => {
    expect(header).toMatch(/const exclusivesItems = \[/);
    expect(header).toMatch(/NavDropdown label="Mallan Exclusives" items=\{exclusivesItems\}/);
    expect(header).toMatch(/exclusivesItems\.map\(mobileDropdownItem\)/);
  });

  it('the dropdown heading is "Mallan Exclusives", not the old "Listings"', () => {
    // desktop label + mobile button text
    expect(header).toMatch(/NavDropdown label="Mallan Exclusives"/);
    expect(header).not.toMatch(/NavDropdown label="Listings"/);
  });

  it('"Mallan Listings" links to the exclusive search page, not /sign-in', () => {
    const m = header.match(/\{\s*title:\s*'Mallan Listings',\s*href:\s*'([^']+)'\s*\}/);
    expect(m).not.toBeNull();
    const href = m![1];
    expect(href).toMatch(/exclusive=mallan/);
    expect(href).not.toBe('/sign-in');
  });

  it('Client Portal stays gated (/sign-in) — only Our Listings changed', () => {
    expect(header).toMatch(/\{\s*title:\s*'Client Portal',\s*href:\s*'\/sign-in'\s*\}/);
  });
});
