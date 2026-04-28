/**
 * AuctionBanner — UCBA Art. I exception path UI (C3c).
 *
 * Server component. Renders an unmissable amber banner above the price
 * block on /listing/[id] when auction_yn=true. Renders NOTHING on
 * non-auction listings — no empty div, no hidden div — so non-auction
 * listings show no false signal that an auction is happening.
 *
 * These tests inspect the React element tree returned by the component
 * directly, without DOM/RTL — the project's jest config uses node env,
 * not jsdom, so we walk children instead of using @testing-library.
 *
 * @module lib/compliance/__tests__/auction-banner
 */

import * as React from 'react';
import AuctionBanner from '@/app/components/AuctionBanner';
import type { AuctionPublic } from '@/lib/idx/public-dto';

/** Recursively flatten a React element tree to a list of plain strings. */
function flattenText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return flattenText(props.children);
  }
  return '';
}

/** Walk the tree and return the first <a> element matching a predicate. */
function findAnchor(
  node: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean
): React.ReactElement | null {
  if (node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findAnchor(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (React.isValidElement(node)) {
    if (node.type === 'a' && predicate(node)) return node;
    const props = node.props as { children?: React.ReactNode };
    return findAnchor(props.children, predicate);
  }
  return null;
}

describe('AuctionBanner', () => {
  it('returns null when auction is null (non-auction listing)', () => {
    const result = AuctionBanner({ auction: null });
    expect(result).toBeNull();
  });

  it('returns null when auction is undefined', () => {
    const result = AuctionBanner({ auction: undefined as unknown as AuctionPublic });
    expect(result).toBeNull();
  });

  it('returns null when auction.endDate is missing', () => {
    const result = AuctionBanner({
      auction: {
        type: 'Absolute',
        startDate: null,
        endDate: '',
        termsUrl: null,
      },
    });
    expect(result).toBeNull();
  });

  it('renders Absolute Auction with bidding-end date when auction is set', () => {
    const result = AuctionBanner({
      auction: {
        type: 'Absolute',
        startDate: null,
        endDate: '2026-06-15T17:00:00.000Z',
        termsUrl: null,
      },
    });
    expect(result).not.toBeNull();
    const text = flattenText(result);
    expect(text).toMatch(/Absolute Auction/);
    expect(text).toMatch(/Bidding ends/);
    // The date is rendered with toLocaleString — assert calendar parts only,
    // since exact timezone formatting depends on the runtime locale.
    expect(text).toMatch(/2026/);
  });

  it('renders "Auction (Reserve)" for WithReserve type', () => {
    const result = AuctionBanner({
      auction: {
        type: 'WithReserve',
        startDate: null,
        endDate: '2026-06-15T17:00:00.000Z',
        termsUrl: null,
      },
    });
    expect(flattenText(result)).toMatch(/Auction \(Reserve\)/);
  });

  it('renders "Auction (Minimum Bid)" for Minimum type', () => {
    const result = AuctionBanner({
      auction: {
        type: 'Minimum',
        startDate: null,
        endDate: '2026-06-15T17:00:00.000Z',
        termsUrl: null,
      },
    });
    expect(flattenText(result)).toMatch(/Auction \(Minimum Bid\)/);
  });

  it('renders an external terms link with safe rel attributes when termsUrl is set', () => {
    const result = AuctionBanner({
      auction: {
        type: 'Absolute',
        startDate: null,
        endDate: '2026-06-15T17:00:00.000Z',
        termsUrl: 'https://example.com/terms.pdf',
      },
    });
    const anchor = findAnchor(result, (el) => {
      const href = (el.props as { href?: string }).href;
      return href === 'https://example.com/terms.pdf';
    });
    expect(anchor).not.toBeNull();
    const props = anchor!.props as { rel?: string; target?: string };
    expect(props.target).toBe('_blank');
    expect(props.rel).toMatch(/noopener/);
    expect(props.rel).toMatch(/noreferrer/);
  });

  it('omits the terms link when termsUrl is null', () => {
    const result = AuctionBanner({
      auction: {
        type: 'Absolute',
        startDate: null,
        endDate: '2026-06-15T17:00:00.000Z',
        termsUrl: null,
      },
    });
    const anchor = findAnchor(result, () => true);
    expect(anchor).toBeNull();
  });

  it('cites UCBA Art. I in the explanatory copy (auditability)', () => {
    const result = AuctionBanner({
      auction: {
        type: 'Absolute',
        startDate: null,
        endDate: '2026-06-15T17:00:00.000Z',
        termsUrl: null,
      },
    });
    expect(flattenText(result)).toMatch(/UCBA Art\. I/);
  });

  it('uses semantic role="region" with descriptive aria-label', () => {
    const result = AuctionBanner({
      auction: {
        type: 'Absolute',
        startDate: null,
        endDate: '2026-06-15T17:00:00.000Z',
        termsUrl: null,
      },
    });
    expect(React.isValidElement(result)).toBe(true);
    const props = result!.props as { role?: string; ['aria-label']?: string };
    expect(props.role).toBe('region');
    expect(props['aria-label']).toMatch(/auction/i);
  });
});
