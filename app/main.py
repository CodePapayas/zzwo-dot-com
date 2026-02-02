import os
from pathlib import Path

from fastapi import FastAPI, Request
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

@app.get("/")
async def home(request: Request):
    nav_items = [
        {"endpoint": "home", "text": "Home"},
        {"endpoint": "resume", "text": "Resume"},
        {"endpoint": "train", "text": "Train"}
    ]

    return templates.TemplateResponse(
        "index.html",
        {"request": request, "nav_items": nav_items, "active_page": "home"},
    )


@app.get("/resume")
async def resume(request: Request):
    nav_items = [
        {"endpoint": "home", "text": "Home"},
        {"endpoint": "resume", "text": "Resume"},
        {"endpoint": "train", "text": "Train"},
    ]
    return templates.TemplateResponse(
        "resume.html",
        {"request": request, "nav_items": nav_items, "active_page": "resume"},
    )


@app.get("/train")
async def train(request: Request):
    nav_items = [
        {"endpoint": "home", "text": "Home"},
        {"endpoint": "resume", "text": "Resume"},
        {"endpoint": "train", "text": "Train"},
    ]
    return templates.TemplateResponse(
        "train.html",
        {"request": request, "nav_items": nav_items, "active_page": "train"},
    )
