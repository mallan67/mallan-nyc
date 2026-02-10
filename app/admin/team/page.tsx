'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Agent {
  id: string;
  name: string;
  title: string;
  photo: string;
  phone: string;
  email: string;
  bio: string;
  specialties: string[];
  languages: string[];
  featured: boolean;
}

export default function AdminTeamPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = () => {
    fetch('/api/agents/public')
      .then(res => res.json())
      .then(data => {
        setAgents(data.agents || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const saveAgents = async (updatedAgents: Agent[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/agents/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: updatedAgents }),
      });
      if (res.ok) {
        setAgents(updatedAgents);
        setMessage({ type: 'success', text: 'Changes saved successfully!' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error('Failed to save');
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save changes.' });
    }
    setSaving(false);
  };

  const addAgent = () => {
    const newAgent: Agent = {
      id: Date.now().toString(),
      name: '',
      title: 'Licensed Real Estate Salesperson',
      photo: '/images/agent-placeholder.svg',
      phone: '',
      email: '',
      bio: '',
      specialties: [],
      languages: ['English'],
      featured: false,
    };
    setEditingAgent(newAgent);
  };

  const editAgent = (agent: Agent) => {
    setEditingAgent({ ...agent });
  };

  const deleteAgent = (id: string) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      const updated = agents.filter(a => a.id !== id);
      saveAgents(updated);
    }
  };

  const saveEditingAgent = () => {
    if (!editingAgent) return;
    if (!editingAgent.name.trim()) {
      setMessage({ type: 'error', text: 'Agent name is required.' });
      return;
    }

    const exists = agents.find(a => a.id === editingAgent.id);
    let updated: Agent[];
    if (exists) {
      updated = agents.map(a => (a.id === editingAgent.id ? editingAgent : a));
    } else {
      updated = [...agents, editingAgent];
    }
    saveAgents(updated);
    setEditingAgent(null);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-gray-600 hover:text-black">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-semibold">Team Management</h1>
        </div>
        <button
          onClick={addAgent}
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
        >
          Add Agent
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 p-4 rounded ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Agent Editor Modal */}
      {editingAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-semibold mb-6">
              {agents.find(a => a.id === editingAgent.id) ? 'Edit Agent' : 'Add Agent'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={editingAgent.name}
                  onChange={e => setEditingAgent({ ...editingAgent, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={editingAgent.title}
                  onChange={e => setEditingAgent({ ...editingAgent, title: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Licensed Real Estate Salesperson / Associate Broker / Broker"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="tel"
                    value={editingAgent.phone}
                    onChange={e => setEditingAgent({ ...editingAgent, phone: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="(646) 555-0100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={editingAgent.email}
                    onChange={e => setEditingAgent({ ...editingAgent, email: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="name@mallan.nyc"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Photo URL</label>
                <input
                  type="text"
                  value={editingAgent.photo}
                  onChange={e => setEditingAgent({ ...editingAgent, photo: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="/images/agent-name.jpg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Bio</label>
                <textarea
                  value={editingAgent.bio}
                  onChange={e => setEditingAgent({ ...editingAgent, bio: e.target.value })}
                  className="w-full border rounded px-3 py-2 h-24"
                  placeholder="Agent biography..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Specialties (comma-separated)</label>
                <input
                  type="text"
                  value={editingAgent.specialties.join(', ')}
                  onChange={e =>
                    setEditingAgent({
                      ...editingAgent,
                      specialties: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                    })
                  }
                  className="w-full border rounded px-3 py-2"
                  placeholder="Upper East Side, Luxury Condos, First-Time Buyers"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Languages (comma-separated)</label>
                <input
                  type="text"
                  value={editingAgent.languages.join(', ')}
                  onChange={e =>
                    setEditingAgent({
                      ...editingAgent,
                      languages: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                    })
                  }
                  className="w-full border rounded px-3 py-2"
                  placeholder="English, Spanish"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="featured"
                  checked={editingAgent.featured}
                  onChange={e => setEditingAgent({ ...editingAgent, featured: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="featured" className="text-sm">Featured agent (shown first)</label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setEditingAgent(null)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEditingAgent}
                disabled={saving}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agents List */}
      {agents.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">No agents added yet.</p>
          <button
            onClick={addAgent}
            className="text-brand-gold hover:underline"
          >
            Add your first agent
          </button>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Featured</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => (
                <tr key={agent.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{agent.name}</td>
                  <td className="px-4 py-3 text-gray-600 text-sm">{agent.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div>{agent.phone}</div>
                    <div className="text-gray-400">{agent.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {agent.featured && (
                      <span className="px-2 py-1 bg-brand-gold/10 text-brand-gold text-xs rounded">
                        Featured
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => editAgent(agent)}
                      className="text-sm text-blue-600 hover:underline mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteAgent(agent.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
