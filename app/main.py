from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI()

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
IMAGES_DIR = APP_DIR / "images"
TEMPLATES_DIR = APP_DIR / "templates"

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

@app.get("/")
async def home(request: Request):
    nav_items = [
        {"endpoint": "home", "text": "Home"},
        {"endpoint": "train", "text": "Train"}
    ]

    return templates.TemplateResponse(
        "index.html",
        {"request": request, "nav_items": nav_items, "active_page": "home"},
    )


@app.get("/train")
async def train(request: Request):
    nav_items = [
        {"endpoint": "home", "text": "Home"},
        {"endpoint": "train", "text": "Train"},
    ]
    return templates.TemplateResponse(
        "train.html",
        {"request": request, "nav_items": nav_items, "active_page": "train"},
    )
