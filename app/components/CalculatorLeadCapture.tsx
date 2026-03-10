'use client';

import { useState, useEffect } from 'react';

export type CalculatorType = 'affordability' | 'rent-vs-buy' | 'closing-cost' | 'mortgage' | 'investor';

interface CalculatorLeadCaptureProps {
  calculatorType: CalculatorType;
  /** Summary of the calculator results to include in the inquiry message */
  resultsSummary?: string;
  /** Whether the user has actually run a calculation (controls visibility) */
  hasCalculated: boolean;
}

const SUBTEXT: Record<CalculatorType, string> = {
  'affordability': 'Get pre-approved and see properties in your budget.',
  'rent-vs-buy': "Let's explore your options together.",
  'closing-cost': 'Get an accurate estimate for your specific property.',
  'mortgage': 'An agent can walk you through the details.',
  'investor': 'Get a detailed analysis for this investment property.',
};

const CALCULATOR_LABELS: Record<CalculatorType, string> = {
  'affordability': 'Affordability',
  'rent-vs-buy': 'Rent vs Buy',
  'closing-cost': 'Closing Cost',
  'mortgage': 'Mortgage',
  'investor': 'Investment Analysis',
};

const DISMISS_KEY = 'calc_lead_dismissed';

export default function CalculatorLeadCapture({
  calculatorType,
  resultsSummary,
  hasCalculated,
}: CalculatorLeadCaptureProps) {
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const val = sessionStorage.getItem(DISMISS_KEY);
      if (val === 'true') setDismissed(true);
    } catch {
      // sessionStorage unavailable (SSR or privacy mode)
    }
  }, []);

  if (!hasCalculated || dismissed || isSubmitted) {
    if (isSubmitted) {
      return (
        <div className="mt-4 rounded-2xl bg-green-50/60 p-4 text-center">
          <p className="text-sm font-medium text-green-700">
            Thanks! An agent will reach out within 1 business day.
          </p>
        </div>
      );
    }
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // sessionStorage unavailable
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      setIsSubmitting(false);
      return;
    }

    if (!agreeToTerms) {
      setError('Please agree to the Terms of Service.');
      setIsSubmitting(false);
      return;
    }

    const label = CALCULATOR_LABELS[calculatorType];
    const message = resultsSummary
      ? `[Calculator: ${label}] User requested follow-up. ${resultsSummary}`
      : `[Calculator: ${label}] User requested follow-up.`;

    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'Calculator Lead',
          email: email.trim(),
          message,
          agreeToTerms,
          source: 'calculator',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setIsSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-4 relative rounded-2xl bg-gray-50/70 ring-1 ring-black/[0.04] p-4">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full text-brand-dark/40 hover:text-brand-dark/70 hover:bg-black/5 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <p className="text-sm font-medium text-brand-dark pr-6">
        Want personalized numbers from a licensed broker?
      </p>
      <p className="text-xs text-brand-dark/70 mt-0.5 mb-3">
        {SUBTEXT[calculatorType]}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="w-full rounded-xl px-3 py-2 text-sm bg-white/80 ring-1 ring-black/[0.06] focus:outline-none focus:ring-2 focus:ring-brand-gold/30 placeholder:text-brand-dark/40"
        />
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm bg-white/80 ring-1 ring-black/[0.06] focus:outline-none focus:ring-2 focus:ring-brand-gold/30 placeholder:text-brand-dark/40"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="shrink-0 px-4 py-2 bg-brand-gold text-white text-sm font-medium rounded-xl hover:bg-brand-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Sending...' : 'Get in Touch'}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreeToTerms}
            onChange={(e) => setAgreeToTerms(e.target.checked)}
            className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold/30"
          />
          <span className="text-[10px] text-brand-dark/50 leading-tight">
            I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>. An agent will follow up within 1 business day.
          </span>
        </label>
      </form>
    </div>
  );
}
