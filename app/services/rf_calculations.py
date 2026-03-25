# RF Signal calculations and RX model

import math
import random
from app.constants import (
    RX_BEST_DB,
    HEIGHT_BONUS_PER_SECTION,
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


def height_bonus_db(sections_tx: int, sections_rx: int) -> float:
    """Calculate height bonus based on mast sections.

    Each extra section (above baseline of 1) on either side adds
    HEIGHT_BONUS_PER_SECTION dB. Range: 0.0 to 2.4 dB.
    """
    extra = max(0, sections_tx - 1) + max(0, sections_rx - 1)
    return HEIGHT_BONUS_PER_SECTION * extra


def freq_penalty_db(tx_mhz: float, rx_mhz: float) -> float:
    """Calculate frequency offset penalty.

    If tuned within 1 MHz, no penalty; otherwise ramp at 50 kHz per dB.
    This is less aggressive than the original 5 kHz/dB to make gameplay more forgiving
    while still encouraging proper frequency tuning.
    """
    off_khz = abs(tx_mhz - rx_mhz) * 1000.0
    if off_khz <= 1000.0:  # Within 1 MHz = no penalty
        return 0.0
    # 50 kHz per dB ramp (was 5 kHz/dB - too aggressive)
    return min(40.0, (off_khz - 1000.0) / 50.0)


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
    bonus_h = height_bonus_db(tx.mast_sections, rx.mast_sections)
    pen_freq = freq_penalty_db(tx.tx_mhz, rx.rx_mhz)

    # Deterministic jitter based on session seed (not time-based for reproducibility)
    jitter_seed = int(sess._seed * 1000) + int(az_err * 10) + int(tilt_err * 10)
    random.seed(jitter_seed)
    jitter = random.uniform(-0.2, 0.2)
    random.seed()  # Reset seed

    # Calculate final RX
    rx_dbm = (
        RX_BEST_DB
        + bonus_h
        - loss_az
        - loss_tilt
        - pen_freq
        + jitter
    )

    # Debug logging
    print(
        f"[RF Calc] AZ loss: {loss_az:.2f} dB | TILT: {loss_tilt:.2f} dB | "
        f"FREQ: {pen_freq:.2f} dB | HEIGHT: {bonus_h:.2f} dB | "
        f"JITTER: {jitter:.2f} dB | "
        f"BASE: {RX_BEST_DB} dBm | RAW: {rx_dbm:.2f} dBm"
    )

    # Clamp to valid range
    rx_dbm = max(-120.0, min(-80.0, rx_dbm))

    return rx_dbm, brg_tx_to_rx, ideal_tilt
