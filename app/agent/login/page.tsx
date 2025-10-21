'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AgentLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) {
      document.cookie = `at=${await res.text()}; path=/`
      router.push('/agent')
    } else {
      alert('Invalid credentials')
    }
  }

  return (
    <main className="max-w-md mx-auto mt-20 p-6 border rounded">
      <h1 className="text-2xl font-bold mb-4">Agent Login</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input className="input" placeholder="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" placeholder="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn-primary w-full">Sign In</button>
      </form>
    </main>
  )
}
