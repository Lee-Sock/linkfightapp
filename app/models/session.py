# Session state models

import random
import time
import asyncio
from uuid import uuid4
from typing import Dict
from app.constants import SITE_A, SITE_B


class NodeState:
    def __init__(self, name, lat, lon, elev_asl_m):
        self.name = name
        self.lat = lat
        self.lon = lon
        self.elev_asl_m = elev_asl_m
        # Player controls
        self.az_ticks = 0  # 0..7200 (0.05 deg per tick)
        self.tilt_deg = 0.0  # -15 .. +15
        self.mast_sections = 1  # 1..9 (starts at 1, includes default section)
        # Radio panel
        self.tx_mhz = 1300.750
        self.rx_mhz = 1800.250
        self.local_ip = "10.1.1.9"
        self.call_id = "8"  # GM-only; players don't see


class Session:
    def __init__(self):
        self.id = uuid4().hex[:8]
        self.A = NodeState(
            SITE_A["name"], SITE_A["lat"], SITE_A["lon"], SITE_A["elev_asl_m"]
        )
        self.B = NodeState(
            SITE_B["name"], SITE_B["lat"], SITE_B["lon"], SITE_B["elev_asl_m"]
        )
        self._seed = random.uniform(0, 1000)
        self.distance_km = 5.0  # Fixed distance in km
        self.created_at = time.time()
        self.last_accessed = time.time()


# In-memory session storage
SESSIONS: Dict[str, Session] = {}

# Session locks for thread safety
SESSION_LOCKS: Dict[str, asyncio.Lock] = {}
GLOBAL_LOCK = asyncio.Lock()

# Session expiration settings
SESSION_MAX_AGE_SECONDS = 3600  # 1 hour


async def get_session_lock(sid: str) -> asyncio.Lock:
    """Get or create a lock for a specific session."""
    async with GLOBAL_LOCK:
        if sid not in SESSION_LOCKS:
            SESSION_LOCKS[sid] = asyncio.Lock()
        return SESSION_LOCKS[sid]


def cleanup_expired_sessions():
    """Remove sessions that haven't been accessed in SESSION_MAX_AGE_SECONDS."""
    now = time.time()
    expired_sids = [
        sid
        for sid, session in SESSIONS.items()
        if now - session.last_accessed > SESSION_MAX_AGE_SECONDS
    ]
    for sid in expired_sids:
        del SESSIONS[sid]
        if sid in SESSION_LOCKS:
            del SESSION_LOCKS[sid]


def update_session_access(session: Session):
    """Update the last accessed timestamp and cleanup old sessions periodically."""
    session.last_accessed = time.time()
    # Cleanup roughly every 100 accesses (simple heuristic)
    if len(SESSIONS) % 100 == 0:
        cleanup_expired_sessions()
