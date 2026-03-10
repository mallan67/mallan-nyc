'use client';

import { useState } from 'react';

export default function UnsubscribePage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleUnsubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');
    try {
      const res = await fetch('/api/search-alerts/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage(data.message || 'You have been unsubscribed.');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  return (
    <main className="min-h-screen bg-white pt-24 pb-16">
        <div className="max-w-md mx-auto px-4">
          <h1 className="text-2xl font-display font-semibold text-brand-dark mb-2">
            Unsubscribe from Listing Alerts
          </h1>
          <p className="text-sm text-brand-dark/60 mb-8">
            Enter your email to unsubscribe from all saved search alerts.
          </p>

          {status === 'success' ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <svg className="w-10 h-10 text-green-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-green-800 font-medium">{message}</p>
            </div>
          ) : (
            <form onSubmit={handleUnsubscribe} className="space-y-4">
              <div>
                <label htmlFor="unsub-email" className="block text-xs font-medium text-brand-dark/80 mb-1">
                  Email Address
                </label>
                <input
                  id="unsub-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full rounded-xl px-4 py-3 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                />
              </div>

              {status === 'error' && (
                <p className="text-xs text-red-600">{message}</p>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || !email.trim()}
                className="w-full px-4 py-3 text-sm font-medium rounded-xl bg-brand-dark text-white hover:bg-brand-dark/90 disabled:opacity-40 transition-colors"
              >
                {status === 'loading' ? 'Processing...' : 'Unsubscribe'}
              </button>
            </form>
          )}
        </div>
    </main>
  );
}
