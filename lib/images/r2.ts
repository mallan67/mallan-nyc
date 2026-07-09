import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error(
      'Missing R2 configuration. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL.'
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

function createClient() {
  const { accountId, accessKeyId, secretAccessKey } = getR2Config();

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Upload a buffer to Cloudflare R2 and return the public URL.
 */
export async function uploadToR2(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const { bucket, publicUrl } = getR2Config();
  const client = createClient();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  // Return public URL (trailing slash normalized)
  const base = publicUrl.replace(/\/+$/, '');
  return `${base}/${key}`;
}

/**
 * Delete one or more objects from R2 by key.
 */
export async function deleteFromR2(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const { bucket } = getR2Config();
  const client = createClient();

  // S3 DeleteObjects supports up to 1000 keys per call
  const batches: string[][] = [];
  for (let i = 0; i < keys.length; i += 1000) {
    batches.push(keys.slice(i, i + 1000));
  }

  for (const batch of batches) {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch.map((k) => ({ Key: k })),
          Quiet: true,
        },
      })
    );
  }
}

/**
 * Check whether R2 environment variables are configured.
 */
export function hasR2Config(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

/**
 * Get the public URL for an R2 object key.
 */
export function getR2PublicUrl(key: string): string {
  const { publicUrl } = getR2Config();
  return `${publicUrl.replace(/\/+$/, '')}/${key}`;
}

/**
 * Check if an object exists in R2.
 */
export async function existsInR2(key: string): Promise<boolean> {
  try {
    const { bucket } = getR2Config();
    const client = createClient();
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * READ-ONLY: paginate the whole bucket and return every object key plus an
 * aggregate byte total and object count. Issues only ListObjectsV2 (Class-A
 * read) calls — no mutation. Used by the storage-health monitor's optional
 * orphan reconciliation (`--r2-orphans`) and to measure actual R2 storage
 * size for the free-tier check. Throws if the token lacks list permission;
 * callers catch and report the orphan check as "unavailable".
 */
export async function listR2ObjectKeys(): Promise<{
  keys: string[];
  totalBytes: number;
  count: number;
}> {
  const { bucket } = getR2Config();
  const client = createClient();
  const keys: string[] = [];
  let totalBytes = 0;
  let continuationToken: string | undefined;
  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    for (const obj of resp.Contents ?? []) {
      if (obj.Key) {
        keys.push(obj.Key);
        totalBytes += obj.Size ?? 0;
      }
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);
  return { keys, totalBytes, count: keys.length };
}

/**
 * Extract the R2 object key from a public URL.
 * Returns null if the URL doesn't match the configured R2_PUBLIC_URL.
 */
export function keyFromUrl(url: string): string | null {
  const { publicUrl } = getR2Config();
  const base = publicUrl.replace(/\/+$/, '');
  if (!url.startsWith(base + '/')) return null;
  return url.slice(base.length + 1);
}
