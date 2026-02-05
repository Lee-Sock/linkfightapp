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
# RX Level: 80-108 dB range (lower = better signal, higher = worse)
# Signal quality thresholds (for UI color coding):
#   80-81 dB = Green (perfect alignment)
#   82-86 dB = Green (very good)
#   87-93 dB = Orange (acceptable)
#   94-108 dB = Red (poor/bad)
RX_BEST_DB = 80.0       # Best possible signal (perfect alignment)
RX_WORST_DB = 108.0     # Worst possible signal (completely misaligned)
RX_GREEN_THRESHOLD = 86.0   # Below this = green
RX_ORANGE_THRESHOLD = 93.0  # Below this = orange, above = red
AZIMUTH_TOL_DEG = 5.0   # hidden "good enough" window
TILT_TOL_DEG = 3.0      # hidden "good enough" window for tilt
