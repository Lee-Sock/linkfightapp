# RF Signal calculations and RX model

import math
import random
from app.constants import (
    RX_BEST_DB,
    HEIGHT_BONUS_PER_SECTION,
    TILT_AMPLIFICATION,
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


def height_mismatch_loss_db(h_tx: float, h_rx: float) -> float:
    """Penalty for height difference between antennas.

    Higher mismatch = harder to maintain LOS. Reducible by raising the lower mast.
    ratio=1 (same height) -> 0 dB, ratio=2 -> ~2.8 dB, ratio=5 -> ~6.4 dB
    """
    ratio = max(h_tx, h_rx) / max(1.0, min(h_tx, h_rx))
    return min(8.0, 4.0 * math.log(max(1.0, ratio)))


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

    # Bearing from transmitter to receiver
    try:
        brg_tx_to_rx = bearing_deg(tx.lat, tx.lon, rx.lat, rx.lon)
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid coordinates: {e}")

    # TX azimuth error — is the transmitter pointing at the receiver?
    # RX's alignment doesn't matter here; RX's own signal depends on TX's aim
    az_err_tx = abs(deg_wrap180(ticks_to_deg(tx.az_ticks) - brg_tx_to_rx))

    # Use session distance
    D = sess.distance_km

    # Calculate antenna heights with validation
    tx_h = tx.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (tx.mast_sections - 1) * SECTION_H_M
    rx_h = rx.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (rx.mast_sections - 1) * SECTION_H_M

    # Validate heights
    if tx_h <= 0 or rx_h <= 0:
        raise ValueError("Antenna heights must be positive")

    # Ideal tilt for TX side (what tilt does the transmitter need to aim at the receiver?)
    height_diff_m = rx_h - tx_h
    distance_m = max(1.0, D * 1000.0)
    raw_tilt = (height_diff_m / distance_m) * TILT_AMPLIFICATION
    ideal_tilt_tx = max(-TILT_RANGE_DEG, min(TILT_RANGE_DEG, raw_tilt))
    ideal_tilt_rx = max(-TILT_RANGE_DEG, min(TILT_RANGE_DEG, -raw_tilt))
    tilt_err_tx = abs(tx.tilt_deg - ideal_tilt_tx)

    # One-sided losses — only the transmitter's alignment affects the receiver's signal
    loss_az = azimuth_loss_db(az_err_tx)
    loss_tilt = tilt_loss_db(tilt_err_tx)
    bonus_h = height_bonus_db(tx.mast_sections, rx.mast_sections)
    loss_hmismatch = height_mismatch_loss_db(tx_h, rx_h)
    pen_freq = freq_penalty_db(tx.tx_mhz, rx.rx_mhz)

    # Deterministic jitter based on session seed (not time-based for reproducibility)
    jitter_seed = int(sess._seed * 1000) + int(az_err_tx * 10) + int(tilt_err_tx * 10)
    random.seed(jitter_seed)
    jitter = random.uniform(-0.2, 0.2)
    random.seed()  # Reset seed

    # Calculate final RX
    rx_dbm = (
        RX_BEST_DB
        + bonus_h
        - loss_az
        - loss_tilt
        - loss_hmismatch
        - pen_freq
        + jitter
    )

    # Debug logging
    print(
        f"[RF Calc] AZ: -{loss_az:.1f} (tx err:{az_err_tx:.0f}°) | "
        f"TILT: -{loss_tilt:.1f} (tx err:{tilt_err_tx:.1f}°, ideal:{ideal_tilt_tx:.1f}°) | "
        f"H.MIS: -{loss_hmismatch:.1f} | H.BON: +{bonus_h:.1f} | "
        f"FREQ: -{pen_freq:.1f} | RAW: {rx_dbm:.1f} dBm"
    )

    # Clamp to valid range
    rx_dbm = max(-120.0, min(-80.0, rx_dbm))

    return rx_dbm, brg_tx_to_rx, ideal_tilt_tx, ideal_tilt_rx
