# RF Signal calculations and RX model
#
# RX Level Model: 80-108 dB range
# - 80-81 dB = perfect alignment (best signal)
# - 82-84 dB = excellent
# - 85-86 dB = very good
# - 87-89 dB = good
# - 90-93 dB = acceptable
# - 94-96 dB = marginal
# - 97-100 dB = poor
# - 101-105 dB = very poor
# - 106-108 dB = worst (max loss)

import math
import random
import time
from app.constants import (
    TILT_RANGE_DEG, SECTION_H_M, BASE_ANTENNA_HEIGHT_M
)
from app.services.geometry import bearing_deg
from app.utils.conversions import ticks_to_deg, deg_wrap180

# New constants for 80-108 dB range
BASE_RX_DB = 108.0  # Worst case (completely misaligned)
BEST_RX_DB = 80.0   # Best case (perfectly aligned)

def azimuth_loss_db(az_err_deg: float) -> float:
    """Calculate azimuth alignment penalty (adds to RX dB).

    Higher error = higher loss = worse signal.
    0° error = 0 loss, scales up with error.
    """
    # Max penalty ~12 dB for azimuth misalignment
    return min(12.0, 0.01 * (az_err_deg ** 2) + 0.1 * abs(az_err_deg))

def tilt_loss_db(tilt_err_deg: float) -> float:
    """Calculate tilt alignment penalty (adds to RX dB).

    Higher error = higher loss = worse signal.
    """
    # Max penalty ~8 dB for tilt misalignment
    return min(8.0, 0.03 * (tilt_err_deg ** 2) + 0.15 * abs(tilt_err_deg))

def mast_bonus_db(mast_sections_tx: int, mast_sections_rx: int) -> float:
    """Calculate mast height bonus (reduces RX dB = better signal).

    More mast sections = better signal propagation.
    """
    # Each additional section above base provides small bonus
    avg_sections = (mast_sections_tx + mast_sections_rx) / 2.0
    # Bonus of up to 4 dB for maxed out masts (9 sections each)
    return min(4.0, (avg_sections - 1) * 0.5)

def freq_penalty_db(tx_mhz: float, rx_mhz: float) -> float:
    """Calculate frequency offset penalty (adds to RX dB).

    If tuned within 50 kHz, no penalty; otherwise scales up.
    """
    off_khz = abs(tx_mhz - rx_mhz) * 1000.0
    if off_khz <= 50.0: return 0.0
    # Max penalty ~8 dB for frequency mismatch
    return min(8.0, (off_khz - 50.0) / 100.0)

def compute_one_way_rx(sess, tx, rx):
    """Compute one-way RX signal strength.

    Returns:
        tuple: (rx_db, bearing_tx_to_rx, ideal_tilt)

    RX dB range: 80-108 (lower is better, 80 = perfect alignment)
    """
    # Bearings
    brg_tx_to_rx = bearing_deg(tx.lat, tx.lon, rx.lat, rx.lon)
    # Player azimuth in degrees
    az_deg = ticks_to_deg(tx.az_ticks)
    az_err = abs(deg_wrap180(az_deg - brg_tx_to_rx))

    # Tilt error model: "ideal tilt" depends on height difference / distance
    D = sess.distance_km
    # Calculate antenna heights: base elevation + vehicle (2m) + sections (1.67m each, starting from 1)
    tx_h = tx.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (tx.mast_sections - 1) * SECTION_H_M
    rx_h = rx.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (rx.mast_sections - 1) * SECTION_H_M

    # Ideal tilt: if receiver is higher, tilt up (positive); if lower, tilt down (negative)
    height_diff_m = rx_h - tx_h
    raw_tilt = math.degrees(math.atan2(height_diff_m, max(1.0, D*1000.0))) * 2.0  # exaggerate for gameplay
    ideal_tilt = max(-TILT_RANGE_DEG, min(TILT_RANGE_DEG, raw_tilt))
    tilt_err = abs(tx.tilt_deg - ideal_tilt)

    # Calculate penalties (increase RX dB = worse signal)
    loss_az = azimuth_loss_db(az_err)
    loss_tilt = tilt_loss_db(tilt_err)
    pen_freq = freq_penalty_db(tx.tx_mhz, rx.rx_mhz)

    # Calculate bonuses (decrease RX dB = better signal)
    bonus_mast = mast_bonus_db(tx.mast_sections, rx.mast_sections)

    # Alignment bonus: perfect alignment gives significant improvement
    # az_err < 5° and tilt_err < 3° = "perfect" zone
    az_factor = max(0.0, 1.0 - (az_err / 30.0))  # 1.0 at 0°, 0.0 at 30°+
    tilt_factor = max(0.0, 1.0 - (tilt_err / TILT_RANGE_DEG))  # 1.0 at 0°, 0.0 at 15°+
    alignment_bonus = 8.0 * az_factor * tilt_factor  # Up to 8 dB bonus for perfect alignment

    # Keep RX fairly stable when controls aren't moving
    jitter_phase = math.sin(time.time()*0.6 + sess._seed)
    jitter_noise = random.uniform(-0.1, 0.1)
    jitter = (jitter_phase + jitter_noise) * 0.3

    # Final calculation:
    # Start at best possible (80), add penalties, subtract bonuses
    # Perfect alignment: 80 + 0 + 0 + 0 - 4 - 8 = 68 → clamped to 80
    # Worst case: 80 + 12 + 8 + 8 - 0 - 0 = 108
    rx_db = BEST_RX_DB + loss_az + loss_tilt + pen_freq - bonus_mast - alignment_bonus + jitter

    # Clamp to valid range (80-108)
    rx_db = max(BEST_RX_DB, min(BASE_RX_DB, rx_db))

    return rx_db, brg_tx_to_rx, ideal_tilt
