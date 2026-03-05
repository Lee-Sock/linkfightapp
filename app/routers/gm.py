# Gamemaster endpoints

from fastapi import APIRouter
from app.models.requests import GMCreateBody
from app.services.session_manager import create_session, update_session, get_session
from app.services.rf_calculations import compute_one_way_rx
from app.utils.conversions import ticks_to_deg
from app.utils.display import rx_color
from app.constants import BASE_ANTENNA_HEIGHT_M, SECTION_H_M

router = APIRouter(tags=["gamemaster"])


@router.post("/simple/gm/create")
def simple_gm_create(body: GMCreateBody):
    s = create_session(body)
    return {"id": s.id}


@router.put("/simple/gm/{sid}/update")
async def simple_gm_update(sid: str, body: GMCreateBody):
    await update_session(sid, body)
    return {"ok": True}


@router.get("/simple/{sid}/gm_view")
def simple_gm_view(sid: str):
    s = get_session(sid)
    rxA, brgBA, tiltA = compute_one_way_rx(s, s.B, s.A)  # what A receives (B→A)
    rxB, brgAB, tiltB = compute_one_way_rx(s, s.A, s.B)  # what B receives (A→B)

    # Calculate antenna elevations
    ant_elev_A = (
        s.A.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (s.A.mast_sections - 1) * SECTION_H_M
    )
    ant_elev_B = (
        s.B.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (s.B.mast_sections - 1) * SECTION_H_M
    )

    # Calculate ideal settings for GM view (thresholds)
    # For Node A pointing at Node B
    ideal_az_A = brgAB
    ideal_az_A_ticks = round((ideal_az_A / 360.0) * 7200) % 7200
    ideal_tilt_A = tiltB  # Tilt needed for A to point at B

    # For Node B pointing at Node A
    ideal_az_B = brgBA
    ideal_az_B_ticks = round((ideal_az_B / 360.0) * 7200) % 7200
    ideal_tilt_B = tiltA  # Tilt needed for B to point at A

    return {
        "id": s.id,
        "A": {
            "pos": {"lat": s.A.lat, "lon": s.A.lon, "elev_asl_m": s.A.elev_asl_m},
            "mast_sections": s.A.mast_sections,
            "antenna_elevation_m": round(ant_elev_A, 2),
            "az_ticks": s.A.az_ticks,
            "az_deg": round(ticks_to_deg(s.A.az_ticks), 2),
            "tilt_deg": round(s.A.tilt_deg, 2),
            "tx": s.A.tx_mhz,
            "rx": s.A.rx_mhz,
            "ip": s.A.local_ip,
            "call_id": s.A.call_id,
            "rx_level_dBm": round(rxA, 1),
            "color": rx_color(rxA),
            # GM-only thresholds
            "ideal_azimuth_ticks": ideal_az_A_ticks,
            "ideal_azimuth_deg": round(ideal_az_A, 2),
            "ideal_tilt_deg": int(round(ideal_tilt_A)),
        },
        "B": {
            "pos": {"lat": s.B.lat, "lon": s.B.lon, "elev_asl_m": s.B.elev_asl_m},
            "mast_sections": s.B.mast_sections,
            "antenna_elevation_m": round(ant_elev_B, 2),
            "az_ticks": s.B.az_ticks,
            "az_deg": round(ticks_to_deg(s.B.az_ticks), 2),
            "tilt_deg": round(s.B.tilt_deg, 2),
            "tx": s.B.tx_mhz,
            "rx": s.B.rx_mhz,
            "ip": s.B.local_ip,
            "call_id": s.B.call_id,
            "rx_level_dBm": round(rxB, 1),
            "color": rx_color(rxB),
            # GM-only thresholds
            "ideal_azimuth_ticks": ideal_az_B_ticks,
            "ideal_azimuth_deg": round(ideal_az_B, 2),
            "ideal_tilt_deg": int(round(ideal_tilt_B)),
        },
        "distance_km": round(s.distance_km, 3),
    }
