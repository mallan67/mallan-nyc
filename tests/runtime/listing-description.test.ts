/// <reference types="jest" />
/**
 * The description of a listing as headings and paragraphs (Maya, 2026-11-05: "the spacing in the body of the listing is too much"). The live description of 333 E 46th St #2G has a blank line between every
 * line, and was printed as one pre-wrapped paragraph: each blank line was a full empty line, and the titles looked like sentences.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { descriptionBlocks, cleanDescription } from '@/lib/format/listing-description';
import ListingDescription from '@/app/components/ListingDescription';

// the shape of that description: a title line, a blank line between every line, short section titles, "Label: sentence" lines
const LIVE_SHAPE = [
  'Sun-Drenched, Oversized Condop - Investment Opportunity or Future Manhattan Home', '',
  'Welcome to Unit 2G. An oversized, beautifully updated one-bedroom in the heart of Midtown East.', '',
  'The Residence', '',
  'Bathed in Natural Light: Desirable southern exposure fills the spacious living areas.', '',
  'Unrivaled Storage: Five generously sized closets, including three in the bedroom.', '',
  'The Building & Location', '',
  'Premium Amenities: A full-time doorman, a live-in superintendent and on-site laundry.', '',
  'Condop Ownership & Investment Flexibility', '',
  'Investor-Friendly: Subletting is permitted from day one of ownership.', '',
  'Contact us today to arrange a private showing with advance notice.',
].join('\n');

describe('descriptionBlocks', () => {
  const blocks = descriptionBlocks(LIVE_SHAPE);

  it('one block per blank-line-separated chunk, and none of them empty', () => {
    expect(blocks).toHaveLength(10);                         // 10 lines in the text above, whatever the blank lines between them
    expect(blocks.every((b) => b.text.trim() !== '')).toBe(true);
  });

  it('the short titles are headings, and nothing else is', () => {
    expect(blocks.filter((b) => b.kind === 'heading').map((b) => b.text)).toEqual(['The Residence', 'The Building & Location', 'Condop Ownership & Investment Flexibility']);
  });

  it('a "Label: sentence" line, a sentence and the long first title line stay paragraphs', () => {
    const paragraphs = blocks.filter((b) => b.kind === 'paragraph').map((b) => b.text);
    expect(paragraphs).toContain('Bathed in Natural Light: Desirable southern exposure fills the spacious living areas.');
    expect(paragraphs).toContain('Contact us today to arrange a private showing with advance notice.');
    expect(paragraphs[0]).toMatch(/^Sun-Drenched/);
  });

  it('the words are untouched and in order (only the blank lines are gone)', () => {
    expect(blocks.map((b) => b.text).join('\n\n')).toBe(LIVE_SHAPE.replace(/\n{2,}/g, '\n\n'));
  });

  it('a paragraph keeps its own line breaks, and 3 or more newlines are one break between blocks', () => {
    const b = descriptionBlocks('First line\nsecond line of the same paragraph\n\n\n\nNext paragraph.');
    expect(b).toEqual([{ kind: 'paragraph', text: 'First line\nsecond line of the same paragraph' }, { kind: 'paragraph', text: 'Next paragraph.' }]);
  });

  it('Windows line endings and lines of spaces are blank lines too', () => {
    expect(descriptionBlocks('One.\r\n\r\nTwo.\r\n   \r\nThree.').map((b) => b.text)).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('the last block is never a heading, and a lone short line is a paragraph', () => {
    expect(descriptionBlocks('Intro sentence here.\n\nThe End')[1].kind).toBe('paragraph');
    expect(descriptionBlocks('Just this')).toEqual([{ kind: 'paragraph', text: 'Just this' }]);
  });

  it.each([['ends like a sentence', 'Doorman building.'], ['asks', 'Is it quiet?'], ['has a label', 'Pets: cats ok'], ['is a bullet', '• Roof deck'], ['is too long', 'A'.repeat(61)], ['has too many words', 'one two three four five six seven eight nine']])('a line that %s is not a heading', (_why, line) => {
    expect(descriptionBlocks(`${line}\n\nMore text follows.`)[0].kind).toBe('paragraph');
  });

  it('empty, blank and missing descriptions have no blocks', () => {
    expect(descriptionBlocks('')).toEqual([]);
    expect(descriptionBlocks('   \n\n  ')).toEqual([]);
    expect(descriptionBlocks(undefined)).toEqual([]);
    expect(descriptionBlocks(null)).toEqual([]);
  });
});

describe('the clean-up the page always applied is unchanged', () => {
  it('markup out, "??" bullets back, **bold** as plain words', () => {
    expect(cleanDescription('<b>Bright</b> corner ?? roof deck **and** more')).toBe('Bright corner • roof deck and more');
  });
});

describe('ListingDescription (what the page prints)', () => {
  const html = renderToStaticMarkup(createElement(ListingDescription, { text: LIVE_SHAPE }));

  it('is paragraphs and headings, not one pre-wrapped paragraph with blank lines in it', () => {
    expect(html).not.toContain('whitespace-pre-wrap');
    expect(html.match(/<p /g)).toHaveLength(7);
    expect(html.match(/<h3 /g)).toHaveLength(3);
    expect(html).not.toMatch(/\n\n/);
  });

  it('the line height is 1.7 (it was 1.85) and a paragraph is 12px from the next', () => {
    expect(html).toContain('leading-[1.7]');
    expect(html).toContain('mb-3');
    expect(html).not.toContain('leading-[1.85]');
  });

  it('text from the database is text: markup in it is stripped, never rendered', () => {
    const out = renderToStaticMarkup(createElement(ListingDescription, { text: '<script>alert(1)</script>Safe words here.' }));
    expect(out).not.toContain('<script');
    expect(out).toContain('Safe words here.');
  });

  it('prints nothing for an empty description', () => {
    expect(renderToStaticMarkup(createElement(ListingDescription, { text: '  ' }))).toBe('');
  });
});
