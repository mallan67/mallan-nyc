"use client";

import { useState } from "react";

export default function ClientAccess(){
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string|null>(null);

  async function submit(e:any){
    e.preventDefault();
    setMsg(null);
    const next = new URLSearchParams(window.location.search).get("next") || "/collection";
    const res = await fetch("/api/login", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ pass }) });
    if(res.ok){ window.location.href = next; }
    else { setMsg("Access denied. Please check the passphrase."); }
  }

  return (
    <div className="container section" style={{maxWidth:560}}>
      <h1 className="brand-title">Private Client Collection</h1>
      <p className="muted">Discreet listings curated for qualified clients. Access by invitation.</p>
      <form onSubmit={submit} className="glass" style={{padding:16,borderRadius:12}}>
        <input
          placeholder="Enter access passphrase"
          value={pass}
          onChange={e=>setPass(e.target.value)}
          style={{width:"100%",padding:"10px 12px",border:"1px solid #e2e8f0",borderRadius:10,marginBottom:8}}
        />
        <button className="btn-primary" type="submit">Enter</button>
        {msg && <div className="small" style={{marginTop:8,color:"#b91c1c"}}>{msg}</div>}
      </form>
      <p className="small muted" style={{marginTop:8}}>
        Note: This section does not represent MLS/RLS “active listings.” Availability is subject to owner consent and verification.
      </p>
    </div>
  );
}
