/**
 * REBNY RLS attribution text for public surfaces (UCBA Art. III / IDX display rules).
 *
 * Compliance vocabulary only — this module knows nothing about provider fields. It was
 * extracted from the retired duplicate provider mapper (lib/idx/mapping.ts, Packet 2 closure)
 * so that attribution consumers no longer import a provider-mapping module.
 */

export const REBNY_ATTRIBUTION_TEMPLATE =
  'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. ' +
  'Data last updated: {{timestamp}}.';

/** Generate the REBNY attribution line with a "data last updated" timestamp. */
export function generateAttributionText(timestamp: Date = new Date()): string {
  return REBNY_ATTRIBUTION_TEMPLATE.replace(
    '{{timestamp}}',
    timestamp.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}
