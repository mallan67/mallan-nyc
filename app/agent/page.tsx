'use client'
import { useEffect, useState } from 'react'

type Deal = { id: string; address: string; side: string; status: string; price: number }
const statuses = ['Lead', 'Showing', 'Offer', 'Contract', 'Closed']

export default function AgentDashboard() {
  const [deals, setDeals] = useState<Deal[]>([])

  useEffect(() => {
    fetch('/api/crm/deals', { headers: { Authorization: `Bearer ${document.cookie.at}` } })
      .then((r) => r.json())
      .then(setDeals)
      .catch(() => window.location.href = '/agent/login')
  }, [])

  return (
    <main className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">My Pipeline</h1>
      <div className="grid grid-cols-5 gap-4">
        {statuses.map((s) => (
          <div key={s} className="border rounded p-3">
            <h2 className="font-semibold mb-2">{s}</h2>
            {deals.filter((d) => d.status === s).map((d) => (
              <div key={d.id} className="bg-white shadow p-2 mb-2 rounded">
                <div className="text-sm">{d.address}</div>
                <div className="text-xs text-gray-500">${d.price.toLocaleString()}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  )
}
