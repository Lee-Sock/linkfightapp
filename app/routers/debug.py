# Debug endpoints

import os
from fastapi import APIRouter, HTTPException
from app.models.session import SESSIONS

router = APIRouter(tags=["debug"])


# Simple auth check - in production, use proper authentication
def check_debug_access():
    """Check if debug endpoints should be accessible.

    In production, these should be disabled or protected.
    For now, we allow them but limit sensitive data exposure.
    """
    # You can add environment variable check here
    # if os.getenv("ENABLE_DEBUG", "false").lower() != "true":
    #     raise HTTPException(403, "Debug endpoints disabled")
    pass


@router.get("/debug/file")
def dbg_file():
    """Get debug file information."""
    check_debug_access()
    return {"__file__": __file__, "size": os.path.getsize(__file__)}


@router.get("/debug/routes")
def dbg_routes():
    """List all registered routes."""
    check_debug_access()
    from app.main import app

    return [getattr(r, "path", str(r)) for r in app.routes]


@router.get("/debug/sessions")
def debug_sessions():
    """Get session statistics (not session IDs for security)."""
    check_debug_access()
    return {
        "session_count": len(SESSIONS),
        "message": "Session IDs not exposed for security",
    }
