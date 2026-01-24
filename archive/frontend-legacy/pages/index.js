import { useState } from "react";

export default function Home() {
  const [agentEmail, setAgentEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [message, setMessage] = useState("");

  async function addAgent(e) {
    e.preventDefault();
    const res = await fetch("/api/agents", {
      method: "POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ email: agentEmail })
    });
    const j = await res.json();
    setMessage("Agent created: " + JSON.stringify(j));
  }

  async function addLead(e){
    e.preventDefault();
    const res = await fetch("/api/leads", {
      method: "POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ phone: leadPhone })
    });
    const j = await res.json();
    setMessage("Lead assigned: " + JSON.stringify(j));
  }

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>Brokerage MVP (Local)</h1>

      <section style={{ marginBottom: 20 }}>
        <h2>Onboard agent</h2>
        <form onSubmit={addAgent}>
          <input placeholder="agent email" value={agentEmail} onChange={e=>setAgentEmail(e.target.value)} />
          <button type="submit" style={{ marginLeft: 8 }}>Create Agent</button>
        </form>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h2>Send lead</h2>
        <form onSubmit={addLead}>
          <input placeholder="lead phone" value={leadPhone} onChange={e=>setLeadPhone(e.target.value)} />
          <button type="submit" style={{ marginLeft: 8 }}>Create Lead</button>
        </form>
      </section>

      <div style={{ marginTop: 20 }}>
        <strong>Result:</strong>
        <pre>{message}</pre>
      </div>
    </div>
  )
}
