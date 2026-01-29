# Physical and RF Configuration Constants

# ---------- Hardcoded Sites ----------
SITE_A = {"name": "Node A", "lat": 1.3300, "lon": 103.8000, "elev_asl_m": 10.0}
SITE_B = {"name": "Node B", "lat": 1.3600, "lon": 103.9000, "elev_asl_m": 30.0}

# ---------- Physical Constants ----------
SECTION_H_M = 1.67  # Each mast section adds 1.67m in height
VEHICLE_HEIGHT_M = 2.0  # Vehicle base height
DEFAULT_SECTION_HEIGHT_M = 1.67  # Default section that antenna sits on
BASE_ANTENNA_HEIGHT_M = VEHICLE_HEIGHT_M + DEFAULT_SECTION_HEIGHT_M  # 3.67m total base
MAX_SECTIONS = 9
MIN_SECTIONS = 1  # Slider starts from 1, not 0
TILT_RANGE_DEG = 15.0  # ±15° mobility range

# ---------- RF Model Constants ----------
# Base floor and smooth penalties/bonuses. Designed to be *fun* and intuitive:
#   RX_dBm = base + height_bonus - az_loss - tilt_loss - freq_penalty + jitter
BASE_RX_DBM = -108.0
AZIMUTH_TOL_DEG = 5.0   # hidden "good enough" window
TILT_TOL_DEG    = 3.0   # (currently not used directly, but kept for tuning)
