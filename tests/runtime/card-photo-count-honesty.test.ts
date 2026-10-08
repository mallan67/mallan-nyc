/**
 * A listing card says "N photos" only while it is showing a photo.
 *
 * Reported 2026-10-08 (Featured Listings on the home page): the card of a third-party (RLS) listing showed the grey placeholder with a "12 photos" chip over it. The
 * list endpoint ships ONE hero plus the true `photosCount` (the whole gallery's size), and Cotality answers 404 for the photos of some listings, so the hero fails to
 * load and the card falls back to the placeholder, while the chip kept promising twelve photos. The search cards already drop a failed photo and its counter
 * (useCardPhotoCarousel); Featured and the similar-listings card did not.
 *
 * `shouldShowPhotoCount` (lib/media/listing-card-media.ts) is the rule, tested directly. The two components are client components with state, which this test
 * environment does not render; their wiring is pinned the way the neighbouring Featured contract test pins it (featured-summary-card-contract.test.ts): by what the
 * component source says.
 */

import fs from 'fs';
import path from 'path';
import { shouldShowPhotoCount } from '@/lib/media/listing-card-media';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');
// the code of a component without its comments
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const between = (src: string, from: string, to: string) => {
  const start = src.indexOf(from);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(to, start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
};

describe('shouldShowPhotoCount: the count is shown only over a photo, and only when there is more than one', () => {
  it.each([
    ['12 photos over a photo', 12, true, true],
    ['2 photos over a photo (the smallest count worth saying)', 2, true, true],
    ['one photo over a photo is no information', 1, true, false],
    ['no photos over a photo', 0, true, false],
    ['a count that is not known over a photo', undefined, true, false],
    ['a count that is null over a photo', null, true, false],
    ['12 photos over the placeholder (the hero failed to load, or there is none)', 12, false, false],
    ['2 photos over the placeholder', 2, false, false],
    ['a count that is not known over the placeholder', undefined, false, false],
  ] as const)('%s', (_name, count, photoShown, expected) => {
    expect(shouldShowPhotoCount(count, photoShown)).toBe(expected);
  });

  it('a count that is not a number is not a count (a string "12" from a bad answer says nothing)', () => {
    expect(shouldShowPhotoCount('12' as unknown as number, true)).toBe(false);
    expect(shouldShowPhotoCount(Number.NaN, true)).toBe(false);
  });
});

describe('Featured Listings: the card of a listing whose hero cannot be shown does not say "N photos"', () => {
  const featured = code(read('app/components/FeaturedListings.tsx'));
  const hero = between(featured, 'function CardHero', 'function MortgageCalc');

  it('knows whether a photo is showing: there is a usable hero and it has not failed to load', () => {
    expect(hero).toContain('const heroShown = !heroFailed && !!hero?.url;');
  });

  it('shows the hero when one is showing, the placeholder otherwise (the established fallback)', () => {
    expect(hero).toContain('const currentSrc = heroShown ? String(hero?.url) : LISTING_PLACEHOLDER_IMAGE;');
    expect(hero).toContain('src={currentSrc}');
  });

  it('says the count only through the rule, with the same "a photo is showing" the image uses', () => {
    expect(hero).toContain('{shouldShowPhotoCount(photosCount, heroShown) && (');
    expect(hero).not.toMatch(/photosCount\s*>\s*1/);
    expect(hero).not.toMatch(/typeof photosCount/);
  });

  it('is told when the hero fails to load', () => {
    expect(hero).toContain('const [heroFailed, setHeroFailed] = useState(false);');
    expect(hero).toContain('onError={handlePhotoError}');
    expect(hero).toContain('const handlePhotoError = useCallback(() => setHeroFailed(true), []);');
  });

  it('imports the rule from the shared card helper (one rule for every card)', () => {
    expect(featured).toMatch(/import \{[^}]*\bshouldShowPhotoCount\b[^}]*\} from '@\/lib\/media\/listing-card-media';/);
  });

  it('still says the TRUE gallery size (the whole count, not the hero count) over a photo', () => {
    expect(hero).toContain('{photosCount} photos');
  });
});

describe('Similar listings: the card drops a photo that failed to load, and its count', () => {
  const similar = code(read('app/components/SimilarListings.tsx'));
  const card = between(similar, 'function SimilarCard', 'export default function SimilarListings');

  it('tracks a photo that failed to load', () => {
    expect(card).toContain('const [photoFailed, setPhotoFailed] = useState(false);');
    expect(card).toContain('onError={() => setPhotoFailed(true)}');
  });

  it('shows the photo only while it has not failed (the placeholder otherwise)', () => {
    expect(card).toContain('const photoUrl = photoFailed ? null : item.photoUrl;');
    expect(card).toContain('{photoUrl ? (');
    expect(card).toContain('src={photoUrl}');
  });

  it('says the count only through the rule, with the same "a photo is showing" the image uses', () => {
    expect(card).toContain('{shouldShowPhotoCount(item.photosCount, !!photoUrl) && (');
    expect(card).not.toMatch(/photosCount\s*\?\?\s*0\)\s*>\s*1/);
    expect(card).toContain('{item.photosCount}');
  });

  it('imports the rule from the shared card helper', () => {
    expect(similar).toContain("import { shouldShowPhotoCount } from '@/lib/media/listing-card-media';");
  });
});
