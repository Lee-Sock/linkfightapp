# Player endpoints

from typing import Literal
from fastapi import APIRouter
from app.models.requests import PlayerSetBody
from app.services.session_manager import (
    get_session,
    update_player_controls,
    public_brief,
)
from app.services.rf_calculations import compute_one_way_rx
from app.utils.display import rx_color
from app.constants import MAX_SECTIONS, MIN_SECTIONS, TILT_RANGE_DEG

router = APIRouter(tags=["player"])


@router.post("/simple/{sid}/team/{team}/set")
async def simple_player_set(sid: str, team: Literal["A", "B"], body: PlayerSetBody):
    await update_player_controls(sid, team, body)
    return {"ok": True}


@router.get("/simple/{sid}/player_view")
def simple_player_view(sid: str, team: Literal["A", "B"]):
    s = get_session(sid)
    me = s.A if team == "A" else s.B
    other = s.B if team == "A" else s.A
    rx_me, _, _ = compute_one_way_rx(s, other, me)  # I receive from the other side

    return {
        "brief": public_brief(s, team),
        "controls": {
            "mast_sections_max": MAX_SECTIONS,
            "mast_sections_min": MIN_SECTIONS,
            "tilt_range_deg": [-TILT_RANGE_DEG, TILT_RANGE_DEG],
            "azimuth_ticks_range": [0, 7200],
        },
        "my_current": {
            "mast_sections": me.mast_sections,
            "tilt_deg": round(me.tilt_deg, 2),
            "azimuth_ticks": me.az_ticks,
        },
        # NEW: Add other node's state for 3D visualization
        "other_current": {
            "mast_sections": other.mast_sections,
            "tilt_deg": round(other.tilt_deg, 2),
            "azimuth_ticks": other.az_ticks,
        },
        "telemetry": {"rx_level_dBm": round(rx_me, 1), "color": rx_color(rx_me)},
    }
