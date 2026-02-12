'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roles: string[];
  status: string;
  assignedAgent: string | null;
  source: string;
  createdAt: string;
}

const roleColors: Record<string, string> = {
  buyer: 'bg-blue-100 text-blue-700',
  renter: 'bg-purple-100 text-purple-700',
  seller: 'bg-green-100 text-green-700',
  landlord: 'bg-teal-100 text-teal-700',
};

const statusColors: Record<string, string> = {
  new: 'bg-red-100 text-red-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  active: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);

  function fetchLeads(authKey: string) {
    setLoading(true);
    fetch(`/api/leads?key=${encodeURIComponent(authKey)}`)
      .then(res => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then(data => {
        setLeads(data.leads);
        setTotal(data.total);
        setAuthed(true);
        setLoading(false);
        sessionStorage.setItem('admin_key', authKey);
      })
      .catch(() => {
        setError('Invalid key');
        setLoading(false);
      });
  }

  useEffect(() => {
    const saved = sessionStorage.getItem('admin_key');
    if (saved) {
      fetchLeads(saved);
    } else {
      setLoading(false);
    }
  }, []);

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border p-8 max-w-sm w-full">
          <h1 className="text-xl font-bold mb-4">Admin Access</h1>
          <form onSubmit={e => { e.preventDefault(); fetchLeads(key); }}>
            <input
              type="password"
              value={key}
              onChange={e => { setKey(e.target.value); setError(''); }}
              placeholder="Enter admin key"
              className="w-full border rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button type="submit" className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800">
              View Leads
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-wide" style={{ color: '#C4A052' }}>MALLAN</h1>
          <p className="text-xs text-gray-400">Lead Distribution Hub</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300">{total} total leads</span>
          <Link href="/admin" className="text-sm text-gray-400 hover:text-white">Admin Home</Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-red-600">{leads.filter(l => l.status === 'new').length}</p>
            <p className="text-xs text-gray-500">New Leads</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-yellow-600">{leads.filter(l => l.status === 'contacted').length}</p>
            <p className="text-xs text-gray-500">Contacted</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-blue-600">{leads.filter(l => l.status === 'active').length}</p>
            <p className="text-xs text-gray-500">Active Clients</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">Client Leads</h2>
            <button onClick={() => fetchLeads(sessionStorage.getItem('admin_key') || '')} className="text-sm text-blue-600 hover:underline">
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No leads yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Roles</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Assigned</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leads.map(lead => (
                    <tr key={lead.id} className={`hover:bg-gray-50 ${lead.status === 'new' ? 'bg-yellow-50/50' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm">{lead.firstName} {lead.lastName}</p>
                        <p className="text-xs text-gray-500">via {lead.source}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {lead.roles.map(r => (
                            <span key={r} className={`px-2 py-0.5 text-xs rounded-full font-medium ${roleColors[r] || 'bg-gray-100 text-gray-600'}`}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm">{lead.email}</p>
                        <p className="text-xs text-gray-500">{lead.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusColors[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                          {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {lead.assignedAgent || <span className="italic text-gray-400">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
