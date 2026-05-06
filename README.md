```
 ______  ______  __  __  __  __     _____   ______  _____     ______  ______  __    __
/\___  \/\___  \/\ \/\ \/\ \/\ \   /\  __-./\  __ \/\__  _\  /\  ___\/\  __ \/\ "-./  \
\/_/  /_\/_/  /_\ \ \/\ \ \ \/\ \  \ \ \/\ \ \ \/\ \/_/\ \/  \ \ \___\ \ \/\ \ \ \-./\ \
  /\_____\/\_____\ \_____\ \_____\  \ \____-\ \_____\ \ \_\   \ \_____\ \_____\ \_\ \ \_\
  \/_____/\/_____/\/_____/\/_____/   \/____/ \/_____/  \/_/    \/_____/\/_____/\/_/  \/_/
```

Personal site. FastAPI backend, Jinja2 templates, vanilla JS. Deployed to Azure via GitHub Actions.

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + Uvicorn |
| Templates | Jinja2 |
| Frontend | Vanilla JS, CSS |
| Realtime | WebSockets |
| Deploy | Azure Web App + GitHub Actions |

## Pages

- `/` — Home
- `/resume` — Resume
- `/train` — Train
- `/graffiti` — Collaborative graffiti canvas (WebSocket-synced, multi-user)

## Dev Server

**Prerequisites:** Python 3.11+

```bash
# Create and activate venv
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install deps
pip install -r requirements.txt

# Run
uvicorn app.main:app --reload
```

Server runs at `http://localhost:8000`. `--reload` hot-reloads on file changes.

## Project Structure

```
app/
├── main.py          # FastAPI app, routes, WebSocket handler
├── static/          # CSS, JS
├── templates/       # Jinja2 HTML templates
└── images/          # Static image assets
tests/               # JS tests
```

## Deploy

Push to `main` → GitHub Actions builds and deploys to Azure Web App automatically.
