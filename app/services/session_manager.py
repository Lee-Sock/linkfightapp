# Session management service

import random
from typing import Literal
from fastapi import HTTPException
from app.models.session import Session, SESSIONS
from app.models.requests import GMCreateBody, PlayerSetBody
from app.constants import MAX_SECTIONS, MIN_SECTIONS, TILT_RANGE_DEG
from app.services.geometry import bearing_deg

def get_session(sid: str) -> Session:
    """Get session by ID or raise 404."""
    s = SESSIONS.get(sid)
    if not s:
        raise HTTPException(404, "Session not found")
    return s

def create_session(body: GMCreateBody) -> Session:
    """Create a new session with GM configuration."""
    s = Session()
    # radio settings
    s.A.tx_mhz, s.A.rx_mhz, s.A.local_ip, s.A.call_id = body.A_tx_MHz, body.A_rx_MHz, body.A_local_ip, body.A_call_id
    s.B.tx_mhz, s.B.rx_mhz, s.B.local_ip, s.B.call_id = body.B_tx_MHz, body.B_rx_MHz, body.B_local_ip, body.B_call_id
    # elevations
    s.A.elev_asl_m = body.A_elev_asl_m
    s.B.elev_asl_m = body.B_elev_asl_m
    # distance
    s.distance_km = body.distance_km
    # initial azimuths on 0..7200 scale
    if body.A_azimuth_ticks is not None:
        s.A.az_ticks = max(0, min(7200, int(body.A_azimuth_ticks)))
    else:
        s.A.az_ticks = random.randint(0, 7199)
    if body.B_azimuth_ticks is not None:
        s.B.az_ticks = max(0, min(7200, int(body.B_azimuth_ticks)))
    else:
        # If A is set but B is not, make B 180° apart (±3600 ticks)
        s.B.az_ticks = (s.A.az_ticks + 3600) % 7200
    SESSIONS[s.id] = s
    return s

def update_session(sid: str, body: GMCreateBody):
    """Update existing session configuration."""
    s = get_session(sid)
    s.A.tx_mhz, s.A.rx_mhz, s.A.local_ip, s.A.call_id = body.A_tx_MHz, body.A_rx_MHz, body.A_local_ip, body.A_call_id
    s.B.tx_mhz, s.B.rx_mhz, s.B.local_ip, s.B.call_id = body.B_tx_MHz, body.B_rx_MHz, body.B_local_ip, body.B_call_id
    s.A.elev_asl_m = body.A_elev_asl_m
    s.B.elev_asl_m = body.B_elev_asl_m
    s.distance_km = body.distance_km
    if body.A_azimuth_ticks is not None:
        s.A.az_ticks = max(0, min(7200, int(body.A_azimuth_ticks)))
    if body.B_azimuth_ticks is not None:
        s.B.az_ticks = max(0, min(7200, int(body.B_azimuth_ticks)))

def update_player_controls(sid: str, team: Literal["A", "B"], body: PlayerSetBody):
    """Update player controls for a specific team."""
    s = get_session(sid)
    t = s.A if team == "A" else s.B
    if body.azimuth_ticks is not None:
        ticks = max(0, min(int(body.azimuth_ticks), 7200))
        t.az_ticks = ticks
    if body.tilt_deg is not None:
        t.tilt_deg = max(-TILT_RANGE_DEG, min(TILT_RANGE_DEG, float(body.tilt_deg)))
    if body.mast_sections is not None:
        t.mast_sections = max(MIN_SECTIONS, min(int(body.mast_sections), MAX_SECTIONS))
    if body.tx_MHz is not None:
        t.tx_mhz = float(body.tx_MHz)
    if body.rx_MHz is not None:
        t.rx_mhz = float(body.rx_MHz)

def public_brief(sess: Session, team: Literal["A", "B"]):
    """Return public information for player (no sensitive GM data)."""
    me = sess.A if team == "A" else sess.B
    other = sess.B if team == "A" else sess.A
    # Coarse azimuth sector (not exact): nearest 10°
    brg = bearing_deg(me.lat, me.lon, other.lat, other.lon)
    coarse = round(brg / 10.0) * 10
    return {
        "node": me.name,
        "local_ip": me.local_ip,
        "tx_MHz": round(me.tx_mhz, 3),
        "rx_MHz": round(me.rx_mhz, 3),
        "distant_end": other.name,
        "site_elevation_m": me.elev_asl_m,
        "azimuth_sector_deg": f"{int((coarse-10)%360)}–{int((coarse+10)%360)}"
    }
