# RF Signal calculations and RX model

import math
import random
import time
from app.constants import (
    BASE_RX_DBM, TILT_RANGE_DEG, SECTION_H_M, BASE_ANTENNA_HEIGHT_M
)
from app.services.geometry import bearing_deg
from app.utils.conversions import ticks_to_deg, deg_wrap180

def azimuth_loss_db(az_err_deg: float) -> float:
    """Calculate azimuth alignment loss.

    0.35 dB per deg near center, capped; smooth quadratic for gameplay.
    """
    return min(25.0, 0.02 * (az_err_deg ** 2) + 0.15 * abs(az_err_deg))

def tilt_loss_db(tilt_err_deg: float) -> float:
    """Calculate tilt alignment loss.

    Penalize vertical misalignment aggressively; LOS needs precise tilt.
    """
    return min(18.0, 0.05 * (tilt_err_deg ** 2) + 0.25 * abs(tilt_err_deg))

def height_bonus_db(h_tx_amsl: float, h_rx_amsl: float) -> float:
    """Calculate height bonus based on antenna elevations.

    Bonus grows with geometric mean of heights; capped ~8 dB.
    """
    if h_tx_amsl <= 0 or h_rx_amsl <= 0: return 0.0
    gmean = math.sqrt(h_tx_amsl * h_rx_amsl)
    return min(8.0, 2.0 * math.log(max(1.0, gmean)))

def freq_penalty_db(tx_mhz: float, rx_mhz: float) -> float:
    """Calculate frequency offset penalty.

    If tuned within 50 kHz, no penalty; otherwise heavy; 5 kHz per dB ramp.
    """
    off_khz = abs(tx_mhz - rx_mhz) * 1000.0
    if off_khz <= 50.0: return 0.0
    return min(40.0, (off_khz - 50.0) / 5.0)

def compute_one_way_rx(sess, tx, rx):
    """Compute one-way RX signal strength.

    Returns:
        tuple: (rx_dbm, bearing_tx_to_rx, ideal_tilt)
    """
    # Bearings
    brg_tx_to_rx = bearing_deg(tx.lat, tx.lon, rx.lat, rx.lon)
    # Player azimuth in degrees
    az_deg = ticks_to_deg(tx.az_ticks)
    az_err = abs(deg_wrap180(az_deg - brg_tx_to_rx))
    # Tilt error model: "ideal tilt" depends on height difference / distance
    # Use session distance instead of calculated distance
    D = sess.distance_km
    # Calculate antenna heights: base elevation + vehicle (2m) + sections (1.67m each, starting from 1)
    tx_h = tx.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (tx.mast_sections - 1) * SECTION_H_M
    rx_h = rx.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (rx.mast_sections - 1) * SECTION_H_M
    # Ideal tilt: if receiver is higher, tilt up (positive); if lower, tilt down (negative)
    height_diff_m = rx_h - tx_h
    raw_tilt = math.degrees(math.atan2(height_diff_m, max(1.0, D*1000.0))) * 2.0  # exaggerate for gameplay
    ideal_tilt = max(-TILT_RANGE_DEG, min(TILT_RANGE_DEG, raw_tilt))
    tilt_err = abs(tx.tilt_deg - ideal_tilt)

    # Loss/bonus + jitter
    # Make losses more sensitive - when perfectly aligned, losses should be minimal
    loss_az   = azimuth_loss_db(az_err)
    loss_tilt = tilt_loss_db(tilt_err)
    bonus_h   = height_bonus_db(tx_h, rx_h)
    pen_freq  = freq_penalty_db(tx.tx_mhz, rx.rx_mhz)

    # Keep RX fairly stable when controls aren't moving
    jitter_phase = math.sin(time.time()*0.6 + sess._seed)
    jitter_noise = random.uniform(-0.1, 0.1)
    jitter = (jitter_phase + jitter_noise) * 0.2

    # Base RX improves smoothly as azimuth/tilt errors shrink.
    # Within ±30° azimuth and ±15° tilt we should still see improvement,
    # and perfect alignment should reach the < -93 dBm target.
    az_factor = max(0.0, 1.0 - (az_err / 30.0))  # zero once error ≥ 30°
    tilt_factor = max(0.0, 1.0 - (tilt_err / TILT_RANGE_DEG))  # zero once error ≥ range
    alignment_bonus = 12.0 * az_factor * tilt_factor

    rx_dbm = BASE_RX_DBM + bonus_h - loss_az - loss_tilt - pen_freq + alignment_bonus + jitter
    # clamp - allow better RX when perfectly aligned
    rx_dbm = max(-120.0, min(-70.0, rx_dbm))
    return rx_dbm, brg_tx_to_rx, ideal_tilt
