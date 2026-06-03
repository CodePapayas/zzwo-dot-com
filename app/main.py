import json
import os
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

# Support Azure's forwarded headers / root path
root_path = os.environ.get("ROOT_PATH", "")
app = FastAPI(root_path=root_path)

# Trust proxy headers so url_for generates https:// URLs behind Azure's reverse proxy
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])

# Resolve paths using pathlib - works regardless of working directory
APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
IMAGES_DIR = APP_DIR / "images"
TEMPLATES_DIR = APP_DIR / "templates"

# Verify directories exist at startup
if not STATIC_DIR.is_dir():
    raise RuntimeError(f"Static directory not found: {STATIC_DIR}")
if not IMAGES_DIR.is_dir():
    raise RuntimeError(f"Images directory not found: {IMAGES_DIR}")
if not TEMPLATES_DIR.is_dir():
    raise RuntimeError(f"Templates directory not found: {TEMPLATES_DIR}")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")

templates = Jinja2Templates(directory=TEMPLATES_DIR)


class GraffitiRoom:
    def __init__(self):
        self.clients: list[WebSocket] = []
        self.snapshot: bytes | None = None

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.append(ws)
        if self.snapshot:
            await ws.send_bytes(self.snapshot)
        elif len(self.clients) > 1:
            try:
                await self.clients[0].send_text(json.dumps({"type": "req_state"}))
            except Exception:
                pass

    def disconnect(self, ws: WebSocket):
        if ws in self.clients:
            self.clients.remove(ws)

    async def broadcast_text(self, text: str, sender: WebSocket):
        dead = []
        for client in self.clients:
            if client is not sender:
                try:
                    await client.send_text(text)
                except Exception:
                    dead.append(client)
        for c in dead:
            self.disconnect(c)

    async def broadcast_bytes(self, data: bytes, sender: WebSocket):
        self.snapshot = data
        dead = []
        for client in self.clients:
            if client is not sender:
                try:
                    await client.send_bytes(data)
                except Exception:
                    dead.append(client)
        for c in dead:
            self.disconnect(c)


room = GraffitiRoom()


NAV_ITEMS = [
    {"endpoint": "home", "text": "Home"},
    {"endpoint": "resume", "text": "Resume"},
    {"endpoint": "train", "text": "Train"},
    {"endpoint": "graffiti", "text": "Graffiti Wall"},
]


@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "nav_items": NAV_ITEMS, "active_page": "home"},
    )


@app.get("/resume")
async def resume(request: Request):
    return templates.TemplateResponse(
        "resume.html",
        {"request": request, "nav_items": NAV_ITEMS, "active_page": "resume"},
    )


@app.get("/train")
async def train(request: Request):
    return templates.TemplateResponse(
        "train.html",
        {"request": request, "nav_items": NAV_ITEMS, "active_page": "train"},
    )


@app.get("/graffiti")
async def graffiti(request: Request):
    return templates.TemplateResponse(
        "graffiti.html",
        {"request": request, "nav_items": NAV_ITEMS, "active_page": "graffiti"},
    )


@app.websocket("/ws/graffiti")
async def graffiti_ws(ws: WebSocket):
    await room.connect(ws)
    try:
        while True:
            msg = await ws.receive()
            if msg.get("text"):
                await room.broadcast_text(msg["text"], ws)
            elif msg.get("bytes"):
                await room.broadcast_bytes(msg["bytes"], ws)
    except WebSocketDisconnect:
        room.disconnect(ws)
