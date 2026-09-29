'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // Principal brokers are NOT signed in by a reset — the API returns
  // requires_signin and withholds the session cookie, so the page must send
  // them to sign-in rather than a dashboard they cannot reach.
  const [requiresSignin, setRequiresSignin] = useState(false);

  if (!token) {
    return (
      <div className="glass-card rounded-3xl p-10 text-center">
        <div className="w-16 h-16 bg-red-50/60 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-2xl font-display font-semibold mb-2">Invalid Reset Link</h1>
        <p className="text-brand-dark/90 mb-6">
          This password reset link is missing or invalid. Please request a new one.
        </p>
        <Link
          href="/sign-in"
          className="inline-block px-6 py-3 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors text-sm font-medium"
        >
          Back to Sign In
        </Link>
      </div>
    );
  }

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
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reset password. The link may have expired.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      const isAgent = data.user?.userType === 'agent';
      const mustSignIn = data.requires_signin === true;
      setRequiresSignin(mustSignIn);
      setTimeout(() => {
        if (mustSignIn) {
          router.push('/sign-in');
          return;
        }
        router.push(isAgent ? '/crm/dashboard' : '/portal');
      }, 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="glass-card rounded-3xl p-10 text-center">
        <div className="w-16 h-16 bg-green-50/60 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-display font-semibold mb-2">Password Reset</h1>
        <p className="text-brand-dark/90 mb-4">
          {requiresSignin
            ? 'Your password has been updated. For security, please sign in with your new password and verification code. Redirecting to sign in...'
            : 'Your password has been updated. Redirecting to your portal...'}
        </p>
        <div className="w-full bg-black/5 rounded-full h-1.5">
          <div className="bg-brand-gold h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-10">
      <h1 className="text-2xl font-display font-semibold text-center mb-2">Reset Password</h1>
      <p className="text-brand-dark/85 text-center text-sm mb-8">
        Choose a new password for your account
      </p>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            New Password
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
          <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-dark text-white py-3 rounded-2xl hover:bg-brand-dark/90 transition-colors font-medium disabled:opacity-50"
        >
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link href="/sign-in" className="text-sm text-brand-gold hover:underline">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
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
            <ResetPasswordForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
