'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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

interface Agent {
  email: string;
  name: string;
}

const roleColors: Record<string, string> = {
  buyer: 'bg-blue-100 text-blue-700',
  renter: 'bg-purple-100 text-purple-700',
  seller: 'bg-green-100 text-green-700',
  landlord: 'bg-teal-100 text-teal-700',
};

const statusConfig: { value: string; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-red-100 text-red-700' },
  { value: 'contacted', label: 'Contacted', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'active', label: 'Active', color: 'bg-blue-100 text-blue-700' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-100 text-gray-500' },
];

export default function LeadsPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading...</div>}>
      <LeadsPage />
    </Suspense>
  );
}

function LeadsPage() {
  const searchParams = useSearchParams();
  const key = searchParams.get('key') || '';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  function fetchLeads() {
    setLoading(true);
    fetch(`/api/leads?key=${encodeURIComponent(key)}`)
      .then(res => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then(data => {
        setLeads(data.leads);
        setAgents(data.agents || []);
        setTotal(data.total);
        setLoading(false);
      })
      .catch(() => {
        setError('Unauthorized — invalid key');
        setLoading(false);
      });
  }

  function updateLead(id: string, updates: Record<string, string | null>) {
    fetch(`/api/leads/${id}?key=${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setLeads(prev => prev.map(l =>
            l.id === id ? { ...l, ...updates } : l
          ));
        }
      });
  }

  useEffect(() => {
    if (key) fetchLeads();
    else { setError('Missing key — add ?key=YOUR_KEY to the URL'); setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const filtered = leads.filter(l => {
    if (filterRole !== 'all' && !l.roles.includes(filterRole)) return false;
    if (filterStatus !== 'all' && l.status !== filterStatus) return false;
    return true;
  });

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border p-8 max-w-sm w-full text-center">
          <h1 className="text-xl font-bold mb-2">Lead Distribution Hub</h1>
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  const newCount = leads.filter(l => l.status === 'new').length;
  const contactedCount = leads.filter(l => l.status === 'contacted').length;
  const activeCount = leads.filter(l => l.status === 'active').length;
  const unassigned = leads.filter(l => !l.assignedAgent).length;

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
          <Link href="/admin" className="text-sm text-gray-400 hover:text-white">Admin</Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
          <button onClick={() => { setFilterStatus('new'); setFilterRole('all'); }} className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition-shadow ${filterStatus === 'new' ? 'ring-2 ring-red-300' : ''}`}>
            <p className="text-2xl font-bold text-red-600">{newCount}</p>
            <p className="text-xs text-gray-500">New Leads</p>
          </button>
          <button onClick={() => { setFilterStatus('contacted'); setFilterRole('all'); }} className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition-shadow ${filterStatus === 'contacted' ? 'ring-2 ring-yellow-300' : ''}`}>
            <p className="text-2xl font-bold text-yellow-600">{contactedCount}</p>
            <p className="text-xs text-gray-500">Contacted</p>
          </button>
          <button onClick={() => { setFilterStatus('active'); setFilterRole('all'); }} className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition-shadow ${filterStatus === 'active' ? 'ring-2 ring-blue-300' : ''}`}>
            <p className="text-2xl font-bold text-blue-600">{activeCount}</p>
            <p className="text-xs text-gray-500">Active Clients</p>
          </button>
          <button onClick={() => { setFilterStatus('all'); setFilterRole('all'); }} className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition-shadow ${filterStatus === 'all' && filterRole === 'all' ? 'ring-2 ring-gray-300' : ''}`}>
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </button>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-orange-600">{unassigned}</p>
            <p className="text-xs text-gray-500">Unassigned</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-gray-500 self-center mr-1">Filter by role:</span>
          {['all', 'buyer', 'renter', 'seller', 'landlord'].map(r => (
            <button key={r} onClick={() => setFilterRole(r)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${filterRole === r ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
          <span className="text-xs text-gray-400 self-center ml-2">
            Showing {filtered.length} of {total}
          </span>
          <button onClick={fetchLeads} className="ml-auto text-xs text-blue-600 hover:underline self-center">
            Refresh
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {total === 0 ? 'No leads yet — they\'ll appear when clients sign up' : 'No leads match this filter'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Roles</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Assigned To</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Registered</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-10">
                      <span className="sr-only">Expand</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(lead => {
                    const isExpanded = expandedId === lead.id;
                    const sc = statusConfig.find(s => s.value === lead.status) || statusConfig[0];
                    return (
                      <>{/* eslint-disable-next-line react/jsx-key */}
                        <tr className={`hover:bg-gray-50 cursor-pointer ${lead.status === 'new' ? 'bg-yellow-50/50' : ''}`}
                          onClick={() => setExpandedId(isExpanded ? null : lead.id)}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-sm">{lead.firstName} {lead.lastName}</p>
                            <p className="text-xs text-gray-400">via {lead.source}</p>
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
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <select
                              value={lead.status}
                              onChange={e => updateLead(lead.id, { status: e.target.value })}
                              className={`text-xs font-medium rounded-full px-3 py-1.5 border-0 cursor-pointer ${sc.color}`}
                            >
                              {statusConfig.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <select
                              value={lead.assignedAgent || ''}
                              onChange={e => updateLead(lead.id, { assignedAgent: e.target.value || null })}
                              className="text-sm border rounded-lg px-2 py-1.5 bg-white cursor-pointer w-full max-w-[160px]"
                            >
                              <option value="">Unassigned</option>
                              {agents.map(a => (
                                <option key={a.email} value={a.name}>{a.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                            {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <svg className={`w-4 h-4 text-gray-400 transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={lead.id + '-detail'} className="bg-gray-50">
                            <td colSpan={7} className="px-4 py-4">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {/* Quick Actions */}
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Quick Actions</h4>
                                  <div className="flex flex-col gap-2">
                                    <a href={`mailto:${lead.email}?subject=Welcome to Mallan Real Estate`}
                                      className="inline-flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-sm hover:bg-blue-50 hover:border-blue-200 transition-colors">
                                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                      </svg>
                                      Email {lead.firstName}
                                    </a>
                                    <a href={`tel:${lead.phone}`}
                                      className="inline-flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-sm hover:bg-green-50 hover:border-green-200 transition-colors">
                                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                      </svg>
                                      Call {lead.phone}
                                    </a>
                                    <a href={`sms:${lead.phone}`}
                                      className="inline-flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-sm hover:bg-purple-50 hover:border-purple-200 transition-colors">
                                      <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                      </svg>
                                      Text {lead.firstName}
                                    </a>
                                  </div>
                                </div>

                                {/* Lead Details */}
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Lead Details</h4>
                                  <div className="bg-white rounded-lg border p-3 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">Source</span>
                                      <span className="font-medium">{lead.source}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">Registered</span>
                                      <span className="font-medium">{new Date(lead.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">Interests</span>
                                      <span className="font-medium">{lead.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">Assigned</span>
                                      <span className="font-medium">{lead.assignedAgent || 'Unassigned'}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Activity */}
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Activity</h4>
                                  <div className="bg-white rounded-lg border p-3 text-sm text-gray-400 italic">
                                    <p>Search history and activity tracking will be available when the client portal launches.</p>
                                    <p className="mt-2 text-xs">Planned: saved searches, showing feedback, document uploads, offer history.</p>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
