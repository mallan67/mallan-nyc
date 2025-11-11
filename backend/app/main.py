from fastapi import FastAPI, HTTPException, Request
import uuid
import json
from pydantic import BaseModel
from typing import Optional
import threading

app = FastAPI(title="Brokerage MVP")

@app.middleware("http")
async def add_request_id_and_log(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    try:
        print(f"REQUEST START id={request_id} method={request.method} path={request.url.path} remote={request.client}")
    except Exception:
        pass
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response

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
    # only log + preserve bodies for API-like endpoints
    try:
        if request.url.path.startswith("/api") or request.url.path.startswith("/agents") or request.url.path.startswith("/leads"):
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
            # pretty print JSON if possible
            try:
                parsed = json.loads(body_text) if body_text else None
                if parsed is not None:
                    print("body:", json.dumps(parsed, ensure_ascii=False))
                else:
                    print("body:", body_text)
            except Exception:
                print("body:", body_text)
            print("=========================")

            # re-inject body for downstream consumers
            async def receive():
                return {"type": "http.request", "body": body, "more_body": False}
            request._receive = receive
    except Exception as e:
        print("Middleware log error:", e)
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

@app.get("/health")
def health():
    return {"status": "ok"}