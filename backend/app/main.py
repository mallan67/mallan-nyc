from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import threading

app = FastAPI(title="Brokerage MVP")

agents = []
leads = []
lock = threading.Lock()
next_agent = 0

class Agent(BaseModel):
    email: str
    phone: Optional[str] = None
    name: Optional[str] = None

class Lead(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    channel: Optional[str] = "web"

@app.post("/agents")
def create_agent(a: Agent):
    with lock:
        agent_id = len(agents) + 1
        agent = {"id": agent_id, **a.dict()}
        agents.append(agent)
    return {"id": agent_id, "agent": agent}

@app.get("/agents")
def list_agents():
    return agents

@app.post("/leads")
def create_lead(l: Lead):
    global next_agent
    if not agents:
        raise HTTPException(status_code=400, detail="No agents available")
    with lock:
        assignee = agents[next_agent % len(agents)]
        next_agent += 1
        lead_id = len(leads) + 1
        lead = {"id": lead_id, **l.dict(), "assignee": assignee}
        leads.append(lead)
    return lead

@app.get("/leads")
def list_leads():
    return leads
