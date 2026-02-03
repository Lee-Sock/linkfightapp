# Pydantic request models

from pydantic import BaseModel, Field, validator
from typing import Literal, Optional
from app.constants import SITE_A, SITE_B, MAX_SECTIONS, MIN_SECTIONS, TILT_RANGE_DEG


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
    A_azimuth_ticks: Optional[int] = Field(None, ge=0, le=7200)
    B_azimuth_ticks: Optional[int] = Field(None, ge=0, le=7200)
    # Distance between nodes (km)
    distance_km: float = Field(5.0, gt=0, le=1000)

    @validator("distance_km")
    def validate_distance(cls, v):
        if v <= 0:
            raise ValueError("Distance must be greater than 0")
        if v > 1000:
            raise ValueError("Distance cannot exceed 1000 km")
        return v


class PlayerSetBody(BaseModel):
    azimuth_ticks: Optional[int] = Field(None, ge=0, le=7200)  # 0..7200
    tilt_deg: Optional[float] = Field(
        None, ge=-TILT_RANGE_DEG, le=TILT_RANGE_DEG
    )  # -15..+15
    mast_sections: Optional[int] = Field(None, ge=MIN_SECTIONS, le=MAX_SECTIONS)  # 1..9
    tx_MHz: Optional[float] = None  # optional re-tune
    rx_MHz: Optional[float] = None
