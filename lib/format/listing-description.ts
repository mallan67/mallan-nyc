/**
 * A listing's description as headings and paragraphs (Maya, 2026-11-05, reading 333 E 46th St #2G: "the spacing in the body of the listing is too much").
 *
 * The page used to print the whole description as ONE paragraph with `white-space: pre-wrap`. Agents separate every line with a blank line, so each blank line became a full empty line (27px at the page's
 * line height) between lines that belong together, and a short title such as "The Residence" looked like any other sentence. The description is now cut into blocks at its blank lines: a paragraph
 * keeps its own line breaks, and a short title line (no sentence punctuation, no "label: value") is a heading with a little more room above it than below. Nothing is added or removed from the words.
 */

export type DescriptionBlock = { kind: 'heading' | 'paragraph'; text: string };

const HEADING_MAX_CHARS = 60;
const HEADING_MAX_WORDS = 8;

/** The clean-up the listing page has always applied to a description: markup out, "??" bullets back, **bold** as plain words. */
export function cleanDescription(raw: unknown): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\?\?(?=\s)/g, '•')
    .replace(/\*\*([^*]+)\*\*/g, '$1');
}

// A title: one short line, no sentence or list punctuation, no "label: value", not a bullet. Words only; it never decides what the agent meant beyond that.
function looksLikeHeading(block: string): boolean {
  if (block.includes('\n')) return false;
  if (block.length > HEADING_MAX_CHARS) return false;
  if (/[.!?:;,]$/.test(block)) return false;
  if (block.includes(':')) return false;
  if (/^[•\-*–—]\s/.test(block)) return false;
  return block.split(/\s+/).length <= HEADING_MAX_WORDS;
}

export function descriptionBlocks(raw: unknown): DescriptionBlock[] {
  const text = cleanDescription(raw).replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const chunks = text
    .split(/\n[ \t]*\n+/)                                                      // blank lines (a line of spaces is blank too) end a block, however many there are
    .map((chunk) => chunk.split('\n').map((line) => line.trim()).join('\n').trim())
    .filter(Boolean);
  // a title is followed by what it titles: the last block is never one
  return chunks.map((chunk, i) => ({ kind: i < chunks.length - 1 && looksLikeHeading(chunk) ? 'heading' : 'paragraph', text: chunk }));
}
