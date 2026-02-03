# RF Signal calculations and RX model

import math
import random
from app.constants import (
    BASE_RX_DBM,
    TILT_RANGE_DEG,
    SECTION_H_M,
    BASE_ANTENNA_HEIGHT_M,
)
from app.services.geometry import bearing_deg
from app.utils.conversions import ticks_to_deg, deg_wrap180


def azimuth_loss_db(az_err_deg: float) -> float:
    """Calculate azimuth alignment loss.

    0.35 dB per deg near center, capped; smooth quadratic for gameplay.
    """
    return min(25.0, 0.02 * (az_err_deg**2) + 0.15 * abs(az_err_deg))


def tilt_loss_db(tilt_err_deg: float) -> float:
    """Calculate tilt alignment loss.

    Penalize vertical misalignment aggressively; LOS needs precise tilt.
    """
    return min(18.0, 0.05 * (tilt_err_deg**2) + 0.25 * abs(tilt_err_deg))


def height_bonus_db(h_tx_amsl: float, h_rx_amsl: float) -> float:
    """Calculate height bonus based on antenna elevations.

    Bonus grows with geometric mean of heights; capped ~8 dB.
    """
    if h_tx_amsl <= 0 or h_rx_amsl <= 0:
        return 0.0
    gmean = math.sqrt(h_tx_amsl * h_rx_amsl)
    return min(8.0, 2.0 * math.log(max(1.0, gmean)))


def freq_penalty_db(tx_mhz: float, rx_mhz: float) -> float:
    """Calculate frequency offset penalty.

    If tuned within 50 kHz, no penalty; otherwise heavy; 5 kHz per dB ramp.
    """
    off_khz = abs(tx_mhz - rx_mhz) * 1000.0
    if off_khz <= 50.0:
        return 0.0
    return min(40.0, (off_khz - 50.0) / 5.0)


def compute_one_way_rx(sess, tx, rx):
    """Compute one-way RX signal strength.

    Returns:
        tuple: (rx_dbm, bearing_tx_to_rx, ideal_tilt)

    Raises:
        ValueError: If session or nodes are invalid
    """
    # Validate inputs
    if not sess:
        raise ValueError("Session is required")
    if not tx or not rx:
        raise ValueError("Both transmitter and receiver nodes are required")
    if not hasattr(sess, "distance_km") or sess.distance_km <= 0:
        raise ValueError("Invalid session distance")

    # Bearings
    try:
        brg_tx_to_rx = bearing_deg(tx.lat, tx.lon, rx.lat, rx.lon)
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid coordinates: {e}")

    # Player azimuth in degrees
    az_deg = ticks_to_deg(tx.az_ticks)
    az_err = abs(deg_wrap180(az_deg - brg_tx_to_rx))

    # Use session distance
    D = sess.distance_km

    # Calculate antenna heights with validation
    tx_h = tx.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (tx.mast_sections - 1) * SECTION_H_M
    rx_h = rx.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (rx.mast_sections - 1) * SECTION_H_M

    # Validate heights
    if tx_h <= 0 or rx_h <= 0:
        raise ValueError("Antenna heights must be positive")

    # Ideal tilt calculation with safe division
    height_diff_m = rx_h - tx_h
    distance_m = max(1.0, D * 1000.0)  # Ensure minimum 1m to avoid division by zero
    raw_tilt = math.degrees(math.atan2(height_diff_m, distance_m)) * 2.0
    ideal_tilt = max(-TILT_RANGE_DEG, min(TILT_RANGE_DEG, raw_tilt))
    tilt_err = abs(tx.tilt_deg - ideal_tilt)

    # Loss/bonus calculations
    loss_az = azimuth_loss_db(az_err)
    loss_tilt = tilt_loss_db(tilt_err)
    bonus_h = height_bonus_db(tx_h, rx_h)
    pen_freq = freq_penalty_db(tx.tx_mhz, rx.rx_mhz)

    # Deterministic jitter based on session seed (not time-based for reproducibility)
    # Use a pseudo-random but deterministic value based on session seed and current values
    jitter_seed = int(sess._seed * 1000) + int(az_err * 10) + int(tilt_err * 10)
    random.seed(jitter_seed)
    jitter = random.uniform(-0.2, 0.2)
    random.seed()  # Reset seed

    # Alignment bonus calculation
    az_factor = max(0.0, 1.0 - (az_err / 30.0))
    tilt_factor = max(0.0, 1.0 - (tilt_err / TILT_RANGE_DEG))
    alignment_bonus = 12.0 * az_factor * tilt_factor

    # Calculate final RX
    rx_dbm = (
        BASE_RX_DBM
        + bonus_h
        - loss_az
        - loss_tilt
        - pen_freq
        + alignment_bonus
        + jitter
    )

    # Clamp to valid range
    rx_dbm = max(-120.0, min(-70.0, rx_dbm))

    return rx_dbm, brg_tx_to_rx, ideal_tilt
