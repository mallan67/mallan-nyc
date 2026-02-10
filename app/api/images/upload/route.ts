import { NextRequest, NextResponse } from 'next/server';
import { validateImage, optimizeImage, type ImageCategory } from '@/lib/images/optimize';
import { uploadToR2, deleteFromR2, keyFromUrl } from '@/lib/images/r2';

export const dynamic = 'force-dynamic';

const VALID_CATEGORIES = new Set<ImageCategory>(['listings', 'neighborhoods', 'content']);

function isAuthenticated(request: NextRequest): boolean {
  return request.cookies.get('pc_auth')?.value === 'ok';
}

/**
 * POST /api/images/upload
 *
 * Upload an image, optimize it into WebP variants, and store in Cloudflare R2.
 *
 * FormData fields:
 *   - file: File (required) — max 10 MB, image MIME types only
 *   - category: string (required) — "listings" | "neighborhoods" | "content"
 *   - refId: string (required) — listing ID, neighborhood slug, or content slug
 */
export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = formData.get('category') as string | null;
    const refId = formData.get('refId') as string | null;

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: file' },
        { status: 400 }
      );
    }
    if (!category || !VALID_CATEGORIES.has(category as ImageCategory)) {
      return NextResponse.json(
        { success: false, error: 'Invalid category. Must be: listings, neighborhoods, or content' },
        { status: 400 }
      );
    }
    if (!refId || refId.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: refId' },
        { status: 400 }
      );
    }

    // Sanitize refId — only allow alphanumeric, hyphens, underscores
    const sanitizedRefId = refId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (sanitizedRefId.length === 0) {
      return NextResponse.json(
        { success: false, error: 'refId contains no valid characters' },
        { status: 400 }
      );
    }

    // Validate file type and size
    const validation = validateImage(file.size, file.type);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Optimize into WebP variants
    const variants = await optimizeImage(buffer, category as ImageCategory);

    // Upload each variant to R2
    const timestamp = Date.now();
    const images = await Promise.all(
      variants.map(async (v) => {
        const key = `${category}/${sanitizedRefId}/${timestamp}-${v.variant}.webp`;
        const url = await uploadToR2(key, v.buffer, v.contentType);
        return {
          variant: v.variant,
          url,
          width: v.width,
          height: v.height,
        };
      })
    );

    return NextResponse.json({ success: true, images });
  } catch (error) {
    console.error('Image upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process image upload' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/images/upload
 *
 * Delete images from R2 by their public URLs.
 *
 * JSON body: { urls: string[] }
 */
export async function DELETE(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const urls: unknown = body?.urls;

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Body must contain a non-empty urls array' },
        { status: 400 }
      );
    }

    // Extract R2 keys from URLs
    const keys: string[] = [];
    for (const url of urls) {
      if (typeof url !== 'string') continue;
      const key = keyFromUrl(url);
      if (key) keys.push(key);
    }

    if (keys.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid R2 URLs found' },
        { status: 400 }
      );
    }

    await deleteFromR2(keys);

    return NextResponse.json({ success: true, deleted: keys.length });
  } catch (error) {
    console.error('Image delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete images' },
      { status: 500 }
    );
  }
}
