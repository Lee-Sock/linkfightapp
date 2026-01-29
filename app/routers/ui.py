# UI endpoints

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, PlainTextResponse, FileResponse
import os

router = APIRouter(tags=["ui"])

@router.get("/", response_class=HTMLResponse)
def root():
    # Serve the index.html file
    template_path = os.path.join("app", "static", "templates", "index.html")
    if os.path.exists(template_path):
        with open(template_path, "r") as f:
            return HTMLResponse(f.read())
    # Fallback inline HTML if file doesn't exist yet
    return HTMLResponse("""
    <!doctype html>
    <html>
    <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>Link Fight — Simple 2-Node Prototype</title>
        <style>
            body{font:14px system-ui;margin:0;padding:20px;background:#f5f5f5}
            .wrap{max-width:600px;margin:40px auto;background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
            h1{margin:0 0 20px;color:#333}
            p{color:#666;line-height:1.6}
            a{color:#0066cc;text-decoration:none;font-weight:500}
            a:hover{text-decoration:underline}
            .links{margin-top:20px}
            .links a{display:block;padding:10px;margin:8px 0;background:#f0f0f0;border-radius:5px}
        </style>
    </head>
    <body>
        <div class="wrap">
            <h1>Link Fight — Simple 2-Node Prototype</h1>
            <p>Welcome! This is a simple 2-node link fight simulation.</p>
            <div class="links">
                <a href="/gm">Gamemaster Interface</a>
                <a href="/player">Player Interface</a>
                <a href="/health">Health Check</a>
            </div>
        </div>
    </body>
    </html>
    """)

@router.get("/health", response_class=PlainTextResponse)
def health():
    return "ok"

@router.get("/player", response_class=HTMLResponse)
def player_ui():
    template_path = os.path.join("app", "static", "templates", "player.html")
    if os.path.exists(template_path):
        with open(template_path, "r") as f:
            return HTMLResponse(f.read())
    return HTMLResponse("Player UI template not found")

@router.get("/gm", response_class=HTMLResponse)
def gm_ui():
    template_path = os.path.join("app", "static", "templates", "gm.html")
    if os.path.exists(template_path):
        with open(template_path, "r") as f:
            return HTMLResponse(f.read())
    return HTMLResponse("GM UI template not found")
