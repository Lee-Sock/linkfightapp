# Pydantic request models

from pydantic import BaseModel
from typing import Literal, Optional
from app.constants import SITE_A, SITE_B

class GMCreateBody(BaseModel):
    A_tx_MHz: float = 1300.750
    A_rx_MHz: float = 1800.250
    A_local_ip: str = "10.1.1.9"
    A_call_id: str = "8"

    B_tx_MHz: float = 1300.750
    B_rx_MHz: float = 1800.250
    B_local_ip: str = "10.1.1.8"
    B_call_id: str = "7"

    # New: site elevations (can be tweaked per scenario)
    A_elev_asl_m: float = SITE_A["elev_asl_m"]
    B_elev_asl_m: float = SITE_B["elev_asl_m"]
    # Initial azimuths (0-7200 scale)
    A_azimuth_ticks: Optional[int] = None
    B_azimuth_ticks: Optional[int] = None
    # Distance between nodes (km)
    distance_km: float = 5.0

class PlayerSetBody(BaseModel):
    azimuth_ticks: Optional[int] = None  # 0..7200
    tilt_deg: Optional[float] = None     # -15..+15
    mast_sections: Optional[int] = None  # 1..9
    tx_MHz: Optional[float] = None       # optional re-tune
    rx_MHz: Optional[float] = None
