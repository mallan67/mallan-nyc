'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const WORKSPACES: Record<string, { label: string; desc: string; icon: string; color: string; bg: string }> = {
  seller:   { label: 'Seller Portal',   desc: 'Manage your listing, view showings, track offers',               icon: '🏠', color: 'text-brand-gold-deep', bg: 'bg-white/70 border border-brand-gold-deep/10 hover:border-brand-gold-deep/25 hover:shadow-lg' },
  buyer:    { label: 'Buyer Portal',    desc: 'Browse listings, schedule showings, track preferences',           icon: '🔍', color: 'text-brand-gold-deep', bg: 'bg-white/70 border border-brand-gold-deep/10 hover:border-brand-gold-deep/25 hover:shadow-lg' },
  landlord: { label: 'Landlord Portal', desc: 'Manage rental listings, view applications, track tenants',        icon: '🔑', color: 'text-brand-gold-deep', bg: 'bg-white/70 border border-brand-gold-deep/10 hover:border-brand-gold-deep/25 hover:shadow-lg' },
  tenant:   { label: 'Tenant Portal',   desc: 'View available rentals, manage lease, request maintenance',       icon: '🏢', color: 'text-brand-gold-deep', bg: 'bg-white/70 border border-brand-gold-deep/10 hover:border-brand-gold-deep/25 hover:shadow-lg' },
};

export default function PortalWorkspaceRouter() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated || data.principalType !== 'lead') {
          router.replace('/sign-in');
          return;
        }
        if (!data.user?.phone || !(data.primaryPortalRole || data.portalRole)) {
          router.replace('/portal/complete-profile');
          return;
        }
        // Self-signup clients must verify email before accessing portal
        if (data.source === 'website' && !data.emailVerified) {
          router.replace('/portal/verify-email');
          return;
        }

        const enabled: string[] = data.enabledWorkspaces
          || [data.primaryPortalRole || data.portalRole];

        if (enabled.length === 1) {
          router.replace(`/portal/${enabled[0]}`);
          return;
        }

        setFirstName(data.user?.name?.split(' ')[0] || '');
        setWorkspaces(enabled);
        setReady(true);
      })
      .catch(() => router.replace('/sign-in'));
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <div className="max-w-4xl mx-auto px-6 py-16 animate-pulse">
          {/* Header skeleton */}
          <div className="flex items-center justify-between mb-2">
            <div className="h-7 w-52 bg-gray-200/80 rounded-lg" />
            <div className="h-4 w-16 bg-gray-100 rounded" />
          </div>
          <div className="h-4 w-36 bg-gray-100 rounded mb-10" />

          {/* Workspace cards skeleton */}
          <div className="grid gap-5 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6"
              >
                <div className="h-9 w-9 bg-gray-200/60 rounded-xl mb-3" />
                <div className="h-5 w-32 bg-gray-200/70 rounded mb-2" />
                <div className="h-3 w-full bg-gray-100 rounded mb-1" />
                <div className="h-3 w-2/3 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-display font-bold text-brand-dark">
            Welcome{firstName ? `, ${firstName}` : ''}
          </h1>
          <button
            onClick={() => {
              fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.replace('/sign-in'));
            }}
            className="text-sm text-brand-dark/50 hover:text-brand-dark transition-colors"
          >
            Sign Out
          </button>
        </div>
        <p className="text-brand-dark/60 text-sm mb-10">Choose your portal</p>

        <div className="grid gap-5 sm:grid-cols-2">
          {workspaces.map((ws) => {
            const meta = WORKSPACES[ws];
            if (!meta) return null;
            return (
              <button
                key={ws}
                onClick={() => router.push(`/portal/${ws}`)}
                aria-label={meta.label}
                className={`rounded-2xl border p-6 text-left transition-all ${meta.bg}`}
              >
                <div className="text-3xl mb-3"><span role="img" aria-hidden="true">{meta.icon}</span></div>
                <div className={`font-semibold text-base ${meta.color}`}>{meta.label}</div>
                <div className="text-brand-dark/60 text-sm mt-1">{meta.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
