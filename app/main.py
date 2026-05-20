import asyncio
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


_MAX_CLIENTS = 50
_MAX_EVENTS = 1000
_MAX_TEXT_BYTES = 2048


_WIPE_COUNTDOWN = 10


class GraffitiRoom:
    def __init__(self):
        self.clients: set[WebSocket] = set()
        self.events: list[str] = []
        self.locked: bool = False

    async def _unlock_after_countdown(self):
        await asyncio.sleep(_WIPE_COUNTDOWN)
        self.locked = False

    async def connect(self, ws: WebSocket) -> bool:
        if len(self.clients) >= _MAX_CLIENTS:
            await ws.close(code=1008)
            return False
        await ws.accept()
        self.clients.add(ws)
        await self._broadcast_meta()
        for event in self.events:
            try:
                await ws.send_text(event)
            except Exception:
                break
        return True

    def disconnect(self, ws: WebSocket):
        self.clients.discard(ws)

    async def _broadcast_meta(self):
        msg = json.dumps({
            "type": "clients",
            "count": len(self.clients),
            "eventCount": len(self.events),
            "maxEvents": _MAX_EVENTS,
        })
        dead = []
        for client in list(self.clients):
            try:
                await client.send_text(msg)
            except Exception:
                dead.append(client)
        for c in dead:
            self.disconnect(c)

    async def broadcast_text(self, text: str, sender: WebSocket):
        msg = json.loads(text)
        if msg.get("type") == "reset":
            self.locked = False
            self.events.clear()
        elif self.locked:
            return
        else:
            self.events.append(text)
            if len(self.events) >= _MAX_EVENTS:
                self.locked = True
                self.events.clear()
                asyncio.create_task(self._unlock_after_countdown())
                wipe = json.dumps({"type": "reset", "auto": True})
                for client in list(self.clients):
                    try:
                        await client.send_text(wipe)
                    except Exception:
                        self.disconnect(client)
                await self._broadcast_meta()
                return

        dead = []
        for client in list(self.clients):
            if client is not sender:
                try:
                    await client.send_text(text)
                except Exception:
                    dead.append(client)
        for c in dead:
            self.disconnect(c)
        await self._broadcast_meta()


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
    if not await room.connect(ws):
        return
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            text = msg.get("text")
            if text is not None and len(text) <= _MAX_TEXT_BYTES:
                await room.broadcast_text(text, ws)
    except WebSocketDisconnect:
        pass
    finally:
        room.disconnect(ws)
        await room._broadcast_meta()
