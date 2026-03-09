'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [invite, setInvite] = useState<{ name: string; email: string; portalRole: string } | null>(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing invite token.');
      setValidating(false);
      return;
    }
    fetch(`/api/auth/invite/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setInvite(data);
        } else {
          setError(data.error || 'Invalid or expired invite link.');
        }
      })
      .catch(() => setError('Failed to validate invite.'))
      .finally(() => setValidating(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/auth/invite/${encodeURIComponent(token!)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create account.');
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push('/portal'), 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (validating) {
    return (
      <div className="glass-card rounded-3xl p-10 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48 mx-auto" />
          <div className="h-4 bg-gray-100 rounded w-64 mx-auto" />
        </div>
        <p className="text-brand-dark/75 text-sm mt-4">Validating your invitation...</p>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="glass-card rounded-3xl p-10 text-center">
        <div className="w-16 h-16 bg-red-50/60 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-2xl font-display font-semibold mb-2">Invite Not Valid</h1>
        <p className="text-brand-dark/90 mb-6">{error || 'This invitation link is invalid or has expired.'}</p>
        <p className="text-brand-dark/75 text-sm mb-4">Please contact your agent for a new invitation.</p>
        <Link
          href="/sign-in"
          className="inline-block px-6 py-3 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors text-sm font-medium"
        >
          Go to Sign In
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="glass-card rounded-3xl p-10 text-center">
        <div className="w-16 h-16 bg-green-50/60 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-display font-semibold mb-2">Account Created</h1>
        <p className="text-brand-dark/90 mb-4">Welcome, {invite.name}! Redirecting to your portal...</p>
        <div className="w-full bg-black/5 rounded-full h-1.5">
          <div className="bg-brand-gold h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  const roleLabel =
    invite.portalRole === 'buyer' ? 'Buyer' :
    invite.portalRole === 'tenant' ? 'Renter' :
    invite.portalRole === 'seller' ? 'Seller' :
    invite.portalRole === 'landlord' ? 'Landlord' : 'Client';

  return (
    <div className="glass-card rounded-3xl p-10">
      <h1 className="text-2xl font-display font-semibold text-center mb-2">Welcome to Mallan</h1>
      <p className="text-brand-dark/85 text-center text-sm mb-8">
        Set up your <strong>{roleLabel} Portal</strong> account
      </p>

      <div className="mb-6 p-4 bg-gray-50/50 rounded-2xl">
        <p className="text-sm"><strong>{invite.name}</strong></p>
        <p className="text-xs text-brand-dark/85">{invite.email}</p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            Create Password
          </label>
          <input
            type="password"
            id="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium mb-1">
            Confirm Password
          </label>
          <input
            type="password"
            id="confirm-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
            placeholder="Re-enter your password"
          />
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-sm text-center">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-dark text-white py-3 rounded-2xl hover:bg-brand-dark/90 transition-colors font-medium disabled:opacity-50"
        >
          {loading ? 'Creating Account...' : 'Create Account & Enter Portal'}
        </button>
      </form>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-20 py-16">
        <div className="max-w-md mx-auto px-4">
          <Suspense fallback={
            <div className="glass-card rounded-3xl p-10 text-center">
              <div className="animate-pulse h-8 bg-gray-200 rounded w-48 mx-auto mb-4" />
              <div className="animate-pulse h-4 bg-gray-100 rounded w-64 mx-auto" />
            </div>
          }>
            <AcceptInviteForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
