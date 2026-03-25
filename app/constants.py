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
# RX levels in dBm (negative; closer to 0 = stronger)
#   -85 to -90 dBm = Excellent
#   -91 to -94 dBm = Good
#   -95 to -98 dBm = Fair
#   -99 to -105 dBm = Poor
#   worse than -105 = Critical
RX_BEST_DB = -85.0
HEIGHT_BONUS_PER_SECTION = 0.5   # dB per extra mast section (above 1), max 8 dB
TILT_AMPLIFICATION = 2000.0      # scales height_diff/distance into meaningful tilt degrees
