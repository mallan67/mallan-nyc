'use client'
import { useEffect, useState } from 'react'

type Metric = { totalDeals: number; unpaid: number; expiring: number }

export default function AdminPanel() {
  const [m, setM] = useState<Metric>({ totalDeals: 0, unpaid: 0, expiring: 0 })

  useEffect(() => {
    fetch('/api/crm/admin/metrics', { headers: { Authorization: `Bearer ${document.cookie.at}` } })
      .then((r) => r.json())
      .then(setM)
      .catch(() => window.location.href = '/agent/login')
  }, [])

  return (
    <main className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-3 gap-6">
        <div className="border rounded p-4"><div className="text-sm text-gray-500">Total Deals</div><div className="text-3xl font-bold">{m.totalDeals}</div></div>
        <div className="border rounded p-4"><div className="text-sm text-gray-500">Unpaid Commission</div><div className="text-3xl font-bold">${m.unpaid.toLocaleString()}</div></div>
        <div className="border rounded p-4"><div className="text-sm text-gray-500">Licences Expiring &lt; 30 d</div><div className="text-3xl font-bold">{m.expiring}</div></div>
      </div>
    </main>
  )
}
