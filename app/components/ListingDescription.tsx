import { descriptionBlocks } from '@/lib/format/listing-description';

/**
 * The "About This Property" text: headings and paragraphs, not one long pre-wrapped paragraph (see lib/format/listing-description.ts). A paragraph is 12px from the next, a heading has 20px above it
 * and 6px below, and the line height is 1.7 (it was 1.85). Before, the description of 333 E 46th St #2G was 1,637px tall on the live page, with a blank line between every line.
 */
export default function ListingDescription({ text }: { text: string }) {
  const blocks = descriptionBlocks(text);
  if (blocks.length === 0) return null;
  return (
    <div className="text-brand-dark/85 text-[15px] leading-[1.7] max-w-none text-justify">
      {blocks.map((block, i) =>
        block.kind === 'heading' ? (
          <h3 key={i} className="font-display font-semibold text-[15px] text-brand-dark text-left mt-5 mb-1.5 first:mt-0">{block.text}</h3>
        ) : (
          <p key={i} className="mb-3 last:mb-0 whitespace-pre-line">{block.text}</p>
        ),
      )}
    </div>
  );
}
