export interface SimilarityTarget {
  beds: number;
  price: number;
  postalCode: string;
  neighborhood?: string;
}

export interface SimilarityCandidate {
  beds: number | null;
  price: number;
  postalCode?: string | null;
  neighborhood?: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

/**
 * Similar cards should stay close enough in price to be useful comparisons.
 * Rentals use a slightly