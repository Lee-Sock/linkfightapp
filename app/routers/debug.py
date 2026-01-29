# Debug endpoints

import os
from fastapi import APIRouter
from app.models.session import SESSIONS

router = APIRouter(tags=["debug"])

@router.get("/debug/file")
def dbg_file():
    return {"__file__": __file__, "size": os.path.getsize(__file__)}

@router.get("/debug/routes")
def dbg_routes():
    from app.main import app
    return [getattr(r, "path", str(r)) for r in app.routes]

@router.get("/debug/sessions")
def debug_sessions():
    return {"sessions": list(SESSIONS.keys())}
