# Session management service

import re
import asyncio
from typing import Literal
from fastapi import HTTPException
from app.models.session import (
    Session,
    SESSIONS,
    get_session_lock,
    update_session_access,
)
from app.models.requests import GMCreateBody, PlayerSetBody
from app.constants import MAX_SECTIONS, MIN_SECTIONS, TILT_RANGE_DEG
from app.services.geometry import bearing_deg

# Session ID validation pattern (8 hex characters)
SESSION_ID_PATTERN = re.compile(r"^[a-f0-9]{8}$")


def validate_session_id(sid: str) -> None:
    """Validate session ID format."""
    if not sid:
        raise HTTPException(400, "Session ID is required")
    if not SESSION_ID_PATTERN.match(sid):
        raise HTTPException(400, "Invalid session ID format")


def validate_distance(distance_km: float) -> float:
    """Validate and clamp distance."""
    if distance_km <= 0:
        raise HTTPException(400, "Distance must be greater than 0")
    if distance_km > 1000:
        raise HTTPException(400, "Distance cannot exceed 1000 km")
    return distance_km


def validate_azimuth_ticks(ticks: int) -> int:
    """Validate and clamp azimuth ticks."""
    try:
        ticks = int(ticks)
        if ticks < 0 or ticks > 7200:
            raise HTTPException(400, "Azimuth must be between 0 and 7200 ticks")
        return ticks
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid azimuth value")


def validate_tilt(tilt: float) -> float:
    """Validate and clamp tilt."""
    try:
        tilt = float(tilt)
        if tilt < -TILT_RANGE_DEG or tilt > TILT_RANGE_DEG:
            raise HTTPException(
                400,
                f"Tilt must be between -{TILT_RANGE_DEG} and +{TILT_RANGE_DEG} degrees",
            )
        return tilt
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid tilt value")


def validate_mast_sections(sections: int) -> int:
    """Validate and clamp mast sections."""
    try:
        sections = int(sections)
        if sections < MIN_SECTIONS or sections > MAX_SECTIONS:
            raise HTTPException(
                400, f"Mast sections must be between {MIN_SECTIONS} and {MAX_SECTIONS}"
            )
        return sections
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid mast sections value")


def get_session(sid: str) -> Session:
    """Get session by ID or raise 404."""
    validate_session_id(sid)
    s = SESSIONS.get(sid)
    if not s:
        raise HTTPException(404, "Session not found")
    update_session_access(s)
    return s


def create_session(body: GMCreateBody) -> Session:
    """Create a new session with GM configuration."""
    # Validate inputs
    body.distance_km = validate_distance(body.distance_km)

    s = Session()
    # radio settings
    s.A.tx_mhz, s.A.rx_mhz, s.A.local_ip, s.A.call_id = (
        body.A_tx_MHz,
        body.A_rx_MHz,
        body.A_local_ip,
        body.A_call_id,
    )
    s.B.tx_mhz, s.B.rx_mhz, s.B.local_ip, s.B.call_id = (
        body.B_tx_MHz,
        body.B_rx_MHz,
        body.B_local_ip,
        body.B_call_id,
    )
    # elevations
    s.A.elev_asl_m = body.A_elev_asl_m
    s.B.elev_asl_m = body.B_elev_asl_m
    # distance
    s.distance_km = body.distance_km
    # initial azimuths on 0..7200 scale
    if body.A_azimuth_ticks is not None:
        s.A.az_ticks = validate_azimuth_ticks(body.A_azimuth_ticks)
    else:
        s.A.az_ticks = __import__("random").randint(0, 7199)
    if body.B_azimuth_ticks is not None:
        s.B.az_ticks = validate_azimuth_ticks(body.B_azimuth_ticks)
    else:
        # If A is set but B is not, make B 180° apart (±3600 ticks)
        s.B.az_ticks = (s.A.az_ticks + 3600) % 7200
    SESSIONS[s.id] = s
    return s


async def update_session(sid: str, body: GMCreateBody):
    """Update existing session configuration."""
    validate_session_id(sid)
    body.distance_km = validate_distance(body.distance_km)

    lock = await get_session_lock(sid)
    async with lock:
        s = get_session(sid)
        s.A.tx_mhz, s.A.rx_mhz, s.A.local_ip, s.A.call_id = (
            body.A_tx_MHz,
            body.A_rx_MHz,
            body.A_local_ip,
            body.A_call_id,
        )
        s.B.tx_mhz, s.B.rx_mhz, s.B.local_ip, s.B.call_id = (
            body.B_tx_MHz,
            body.B_rx_MHz,
            body.B_local_ip,
            body.B_call_id,
        )
        s.A.elev_asl_m = body.A_elev_asl_m
        s.B.elev_asl_m = body.B_elev_asl_m
        s.distance_km = body.distance_km
        if body.A_azimuth_ticks is not None:
            s.A.az_ticks = validate_azimuth_ticks(body.A_azimuth_ticks)
        if body.B_azimuth_ticks is not None:
            s.B.az_ticks = validate_azimuth_ticks(body.B_azimuth_ticks)


async def update_player_controls(
    sid: str, team: Literal["A", "B"], body: PlayerSetBody
):
    """Update player controls for a specific team."""
    validate_session_id(sid)
    if team not in ["A", "B"]:
        raise HTTPException(400, "Team must be 'A' or 'B'")

    lock = await get_session_lock(sid)
    async with lock:
        s = get_session(sid)
        t = s.A if team == "A" else s.B
        if body.azimuth_ticks is not None:
            t.az_ticks = validate_azimuth_ticks(body.azimuth_ticks)
        if body.tilt_deg is not None:
            t.tilt_deg = validate_tilt(body.tilt_deg)
        if body.mast_sections is not None:
            t.mast_sections = validate_mast_sections(body.mast_sections)
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
        "azimuth_sector_deg": f"{int((coarse - 10) % 360)}–{int((coarse + 10) % 360)}",
    }
