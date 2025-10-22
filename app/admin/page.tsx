'use client'
import { useEffect, useState } from 'react'

type Metric = { totalDeals: number; unpaid: number; expiring: number }
type NewAgent = { firstName: string; lastName: string; email: string; licenseNo: string; expiry: string; splitPlan: string }

export default function AdminPanel() {
  const [metrics, setMetrics] = useState<Metric>({ totalDeals: 0, unpaid: 0, expiring: 0 })
  const [form, setForm] = useState<NewAgent>({ firstName: '', lastName: '', email: '', licenseNo: '', expiry: '', splitPlan: '70-30' })

  // load metrics
  useEffect(() => {
    fetch('/api/crm/admin/metrics', { headers: { Authorization: `Bearer ${document.cookie.at}` } })
      .then((r) => r.json())
      .then(setMetrics)
      .catch(() => window.location.href = '/agent/login')
  }, [])

  // create agent
  const handleAdd = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.licenseNo || !form.expiry) {
      alert('Please fill all fields'); return
    }
    const res = await fetch('/api/crm/admin/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      alert('Agent added + Neon-Auth user created')
      setForm({ firstName: '', lastName: '', email: '', licenseNo: '', expiry: '', splitPlan: '70-30' })
    } else {
      alert(await res.text())
    }
  }

  return (
    <main className="container mx-auto p-6">
      {/* ===== EXISTING METRICS CARDS ===== */}
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="border rounded p-4"><div className="text-sm text-gray-500">Total Deals</div><div className="text-3xl font-bold">{metrics.totalDeals}</div></div>
        <div className="border rounded p-4"><div className="text-sm text-gray-500">Unpaid Commission</div><div className="text-3xl font-bold">${metrics.unpaid.toLocaleString()}</div></div>
        <div className="border rounded p-4"><div className="text-sm text-gray-500">Licences Expiring &lt; 30 d</div><div className="text-3xl font-bold">{metrics.expiring}</div></div>
      </div>

      {/* ===== NEW: ADD AGENT FORM ===== */}
      <section className="border rounded p-6 max-w-3xl">
        <h2 className="text-xl font-semibold mb-4">Add New Agent</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input className="input" placeholder="First Name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <input className="input" placeholder="Last Name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          <input className="input" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="License #" value={form.licenseNo} onChange={(e) => setForm({ ...form, licenseNo: e.target.value })} />
          <input className="input" placeholder="Licence Expiry (YYYY-MM-DD)" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} />
          <select className="input" value={form.splitPlan} onChange={(e) => setForm({ ...form, splitPlan: e.target.value })}>
            <option value="80-20">80-20 (Broker)</option>
            <option value="70-30">70-30 (Agent)</option>
          </select>
        </div>
        <button onClick={handleAdd} className="btn-primary mt-4">Create Agent</button>
      </section>
    </main>
  )
}
