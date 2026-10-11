/**
 * What a media answer's bytes are, read from their first bytes. A Content-Type header is a claim; the bytes are the evidence.
 *
 * Used by the media proxy (app/api/media/proxy/route.ts) for the one case where the header says nothing about the kind of file: Cotality answers some photos 200 with
 * `application/octet-stream` (seen in production on 2026-10-10 and 2026-10-11 for the later photos of one listing, e.g. /PHOTO-Jpeg/<key>/25, /30, /31). The proxy used to
 * refuse every answer that was not typed `image/*`, which is right for an HTML error page (a WAF, rate-limit or maintenance page answered 200 would be cached for 7 days) but wrong
 * for a real JPEG with a vague header.
 *
 * Only the four formats a browser shows in an <img> are recognised. HEIC, TIFF, PDF and the rest are not images the page can show, so they stay refused.
 */

export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** What a body is, for the log: an image type, or the kind of thing that is not one. */
export type BodyClass = SniffedImageType | "html" | "json" | "empty" | "other";

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((value, i) => bytes[offset + i] === value);

const ascii = (bytes: Uint8Array, from: number, to: number): string => String.fromCharCode(...Array.from(bytes.subarray(from, to)));

/** The image type of the bytes, or null when they are not JPEG, PNG, WebP or GIF. */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) return "image/gif";
  // WebP is a RIFF container: "RIFF", a 4-byte size, then "WEBP"
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** An image type, or "html" / "json" / "empty" / "other" for a body that is not one (the log says which; the body itself is never logged). */
export function classifyBody(bytes: Uint8Array): BodyClass {
  if (bytes.length === 0) return "empty";
  const image = sniffImageType(bytes);
  if (image) return image;
  let i = 0;
  // an optional UTF-8 byte order mark, then white space
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) i = 3;
  while (i < bytes.length && i < 64 && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  const first = bytes[i];
  if (first === 0x3c /* < */) return "html";
  if (first === 0x7b /* { */ || first === 0x5b /* [ */) return "json";
  return "other";
}
