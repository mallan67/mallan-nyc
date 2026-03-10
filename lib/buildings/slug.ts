/**
 * Building slug utilities.
 *
 * Slug format: "{streetNumber}-{streetName}-{postalCode}"
 * With building name: "{buildingName}-{streetNumber}-{streetName}-{postalCode}"
 * Example: "one57-157-west-57th-street-10019"
 * Example: "120-east-23rd-street-10010"
 */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface BuildingSlugParts {
  streetNumber: string;
  streetName: string;
  postalCode: string;
  buildingName?: string;
}

/**
 * Generate a URL-safe slug for a building.
 */
export function generateBuildingSlug(parts: BuildingSlugParts): string {
  const segments: string[] = [];
  if (parts.buildingName) segments.push(slugify(parts.buildingName));
  segments.push(slugify(`${parts.streetNumber} ${parts.streetName}`));
  if (parts.postalCode) segments.push(parts.postalCode);
  return segments.join('-');
}

/**
 * Generate the href for a building page.
 */
export function buildingHref(parts: BuildingSlugParts): string {
  const slug = generateBuildingSlug(parts);
  const params = new URLSearchParams({
    sn: parts.streetNumber,
    st: parts.streetName,
  });
  if (parts.postalCode) params.set('z', parts.postalCode);
  if (parts.buildingName) params.set('bn', parts.buildingName);
  return `/buildings/${slug}?${params.toString()}`;
}
