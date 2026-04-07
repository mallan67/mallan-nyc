'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'sending' | 'verifying' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Get user email from auth
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (!data.authenticated) { router.replace('/sign-in'); return; }
        if (data.emailVerified) { router.replace('/portal'); return; }
        setEmail(data.user?.email || '');
        setStatus('ready');
      })
      .catch(() => router.replace('/sign-in'));
  }, [router]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    if (cooldown > 0) return;
    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Verification code sent to your email.');
        setCooldown(60);
      } else {
        setMessage(data.error || 'Failed to send code.');
      }
    } catch {
      setMessage('Network error. Please try again.');
    }
    setStatus('ready');
  }

  async function verifyCode() {
    if (!code.trim()) return;
    setStatus('verifying');
    setMessage('');
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email, code: code.trim() }),
      });
      const data = await res.json();
      if (data.verified) {
        setStatus('success');
        setMessage('Email verified! Redirecting...');
        setTimeout(() => router.replace('/portal'), 1500);
      } else {
        setMessage(data.error || 'Invalid code.');
        setStatus('ready');
      }
    } catch {
      setMessage('Network error. Please try again.');
      setStatus('ready');
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#FEFEFE] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <div className="max-w-md mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify Your Email</h1>
        <p className="text-gray-500 text-sm mb-8">
          We need to verify <span className="font-medium text-gray-700">{email}</span> before you can access your portal.
        </p>

        {/* Send code button */}
        <button
          onClick={sendCode}
          disabled={status === 'sending' || cooldown > 0}
          className="w-full py-3 px-4 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
        >
          {status === 'sending' ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Verification Code'}
        </button>

        {/* Code input */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Enter 6-digit code</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && verifyCode()}
            placeholder="000000"
            className="w-full text-center text-2xl font-mono tracking-[0.5em] px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors"
          />
        </div>

        <button
          onClick={verifyCode}
          disabled={code.length !== 6 || status === 'verifying'}
          className="w-full py-3 px-4 bg-[#B8860B] text-white rounded-xl font-medium text-sm hover:bg-[#9a7209] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'verifying' ? 'Verifying...' : status === 'success' ? 'Verified!' : 'Verify Email'}
        </button>

        {message && (
          <p className={`mt-4 text-sm text-center ${status === 'success' ? 'text-green-600' : message.includes('sent') ? 'text-blue-600' : 'text-red-500'}`}>
            {message}
          </p>
        )}

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <button
            onClick={() => { fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.replace('/sign-in')); }}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
