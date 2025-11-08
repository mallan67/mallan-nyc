from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import threading

app = FastAPI(title="Brokerage MVP")

# Simple in-memory stores for the MVP
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


@app.middleware("http")
async def log_api_calls(request: Request, call_next):
    """
    Middleware that logs incoming requests whose path begins with /api.
    It reads and logs the body, then *re-injects* the body back into the
    request so downstream FastAPI handlers can read it again.
    """
    if request.url.path.startswith("/api"):
        body = await request.body()
        try:
            body_text = body.decode("utf-8", errors="replace")
        except Exception:
            body_text = "<could not decode body>"

        print("=== INCOMING API CALL ===")
        print("path:", request.url.path)
        print("method:", request.method)
        print("remote:", request.client)
        try:
            print("headers:", {k: v for k, v in request.headers.items()})
        except Exception:
            print("headers: <unserializable>")
        print("body:", body_text)
        print("=========================")

        # Re-inject the body for downstream consumers (call_next)
        # This assigns a small receive() coroutine that returns the original body.
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        # Note: request._receive is a private attribute but this is a common
        # pragmatic approach for middleware that reads the body.
        request._receive = receive

    response = await call_next(request)
    return response


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
