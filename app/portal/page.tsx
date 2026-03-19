'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const WORKSPACES: Record<string, { label: string; desc: string; icon: string; color: string; bg: string }> = {
  seller:   { label: 'Seller Portal',   desc: 'Manage your listing, view showings, track offers',               icon: '🏠', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200 hover:border-amber-400' },
  buyer:    { label: 'Buyer Portal',    desc: 'Browse listings, schedule showings, track preferences',           icon: '🔍', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200 hover:border-blue-400' },
  landlord: { label: 'Landlord Portal', desc: 'Manage rental listings, view applications, track tenants',        icon: '🔑', color: 'text-green-700',  bg: 'bg-green-50 border-green-200 hover:border-green-400' },
  tenant:   { label: 'Tenant Portal',   desc: 'View available rentals, manage lease, request maintenance',       icon: '🏢', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200 hover:border-purple-400' },
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
      <div className="min-h-screen bg-[#FEFEFE] font-sans flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome{firstName ? `, ${firstName}` : ''}
          </h1>
          <button
            onClick={() => {
              fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.replace('/sign-in'));
            }}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            Sign Out
          </button>
        </div>
        <p className="text-gray-500 text-sm mb-10">Choose your portal</p>

        <div className="grid gap-5 sm:grid-cols-2">
          {workspaces.map((ws) => {
            const meta = WORKSPACES[ws];
            if (!meta) return null;
            return (
              <button
                key={ws}
                onClick={() => router.push(`/portal/${ws}`)}
                className={`rounded-2xl border p-6 text-left transition-all ${meta.bg}`}
              >
                <div className="text-3xl mb-3">{meta.icon}</div>
                <div className={`font-semibold text-base ${meta.color}`}>{meta.label}</div>
                <div className="text-gray-600 text-sm mt-1">{meta.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
