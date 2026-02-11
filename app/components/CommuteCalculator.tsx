'use client';

import { useState, useRef, useCallback } from 'react';
import SubwayBadge from '@/app/components/neighborhoods/SubwayBadge';

interface CommuteStep {
  mode: 'walk' | 'transit' | 'transfer';
  instruction: string;
  duration: number;
  line?: string;
  fromStation?: string;
  toStation?: string;
}

interface CommuteResult {
  totalMinutes: number;
  steps: CommuteStep[];
  linesUsed: string[];
  departureTime: string;
  arrivalTime: string;
  destination: string;
  fallbackUrl?: string;
}

interface CommuteCalculatorProps {
  latitude: number;
  longitude: number;
}

export default function CommuteCalculator({ latitude, longitude }: CommuteCalculatorProps) {
  const [destination, setDestination] = useState('');
  const [result, setResult] = useState<CommuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calculateCommute = useCallback(
    (dest: string) => {
      if (!dest.trim()) return;
      setLoading(true);
      setError(false);

      fetch(
        `/api/transit/commute?originLat=${latitude}&originLng=${longitude}&destination=${encodeURIComponent(dest)}`
      )
        .then((res) => res.json())
        .then((data) => {
          setResult(data);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    },
    [latitude, longitude]
  );

  const handleInputChange = (value: string) => {
    setDestination(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length >= 3) {
      debounceRef.current = setTimeout(() => calculateCommute(value), 1000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    calculateCommute(destination);
  };

  return (
    <div className="mt-4 pt-4 border-t">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Commute Calculator</h3>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={destination}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Enter your work address"
          className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={loading || !destination.trim()}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            'Go'
          )}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-500 mt-2">Unable to calculate commute. Try again.</p>
      )}

      {result && !loading && (
        <div className="mt-3">
          {/* Fallback: no Google API key */}
          {result.fallbackUrl && result.totalMinutes === 0 ? (
            <a
              href={result.fallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View commute on Google Maps
            </a>
          ) : (
            <>
              {/* Total time */}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg mb-2">
                <div>
                  <span className="text-lg font-bold text-gray-900">{result.totalMinutes} min</span>
                  <span className="text-sm text-gray-500 ml-2">by transit</span>
                </div>
                {result.linesUsed.length > 0 && (
                  <div className="flex gap-1">
                    {result.linesUsed.map((line) => (
                      <SubwayBadge key={line} line={line} />
                    ))}
                  </div>
                )}
              </div>

              {/* Step-by-step */}
              {result.steps.length > 0 && (
                <div className="space-y-1.5">
                  {result.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      {step.mode === 'walk' ? (
                        <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      ) : (
                        <div className="mt-0.5 shrink-0">
                          {step.line && <SubwayBadge line={step.line} />}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-gray-700">
                          {step.mode === 'transit' && step.fromStation && step.toStation
                            ? `${step.fromStation} → ${step.toStation}`
                            : step.instruction}
                        </p>
                        <p className="text-xs text-gray-400">{step.duration} min</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Departure/Arrival */}
              {result.departureTime && result.arrivalTime && (
                <p className="text-xs text-gray-400 mt-2">
                  Depart {result.departureTime} → Arrive {result.arrivalTime}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
