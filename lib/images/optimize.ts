import sharp from 'sharp';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
]);

export type ImageCategory = 'listings' | 'neighborhoods' | 'content';

export interface ImageVariant {
  variant: 'hero' | 'card' | 'thumb';
  buffer: Buffer;
  width: number;
  height: number;
  contentType: 'image/webp';
}

interface VariantSpec {
  name: 'hero' | 'card' | 'thumb';
  maxWidth: number;
  quality: number;
}

const VARIANT_SPECS: Record<ImageCategory, VariantSpec[]> = {
  listings: [
    { name: 'hero', maxWidth: 1600, quality: 80 },
    { name: 'card', maxWidth: 800, quality: 75 },
    { name: 'thumb', maxWidth: 400, quality: 70 },
  ],
  neighborhoods: [
    { name: 'hero', maxWidth: 1600, quality: 80 },
    { name: 'card', maxWidth: 800, quality: 75 },
  ],
  content: [
    { name: 'hero', maxWidth: 1600, quality: 80 },
    { name: 'card', maxWidth: 800, quality: 75 },
  ],
};

/**
 * Validate that the uploaded file is an allowed image type and within size limits.
 */
export function validateImage(
  size: number,
  mimeType: string
): { valid: true } | { valid: false; error: string } {
  if (size > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit` };
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: `Unsupported file type: ${mimeType}. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
    };
  }
  return { valid: true };
}

/**
 * Process a raw image buffer into optimized WebP variants.
 * Strips EXIF/GPS metadata for privacy.
 */
export async function optimizeImage(
  buffer: Buffer,
  category: ImageCategory
): Promise<ImageVariant[]> {
  const specs = VARIANT_SPECS[category];
  const variants: ImageVariant[] = [];

  for (const spec of specs) {
    const result = await sharp(buffer)
      .rotate() // auto-orient from EXIF before stripping
      .resize({ width: spec.maxWidth, withoutEnlargement: true })
      .webp({ quality: spec.quality })
      .toBuffer({ resolveWithObject: true });

    variants.push({
      variant: spec.name,
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
      contentType: 'image/webp',
    });
  }

  return variants;
}
