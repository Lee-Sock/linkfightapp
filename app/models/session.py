# Session state models

import random
from uuid import uuid4
from app.constants import SITE_A, SITE_B

class NodeState:
    def __init__(self, name, lat, lon, elev_asl_m):
        self.name = name
        self.lat = lat
        self.lon = lon
        self.elev_asl_m = elev_asl_m
        # Player controls
        self.az_ticks = 0            # 0..7200 (0.05 deg per tick)
        self.tilt_deg = 0.0          # -15 .. +15
        self.mast_sections = 1       # 1..9 (starts at 1, includes default section)
        # Radio panel
        self.tx_mhz = 1300.750
        self.rx_mhz = 1800.250
        self.local_ip = "10.1.1.9"
        self.call_id = "8"           # GM-only; players don't see

class Session:
    def __init__(self):
        self.id = uuid4().hex[:8]
        self.A = NodeState(SITE_A["name"], SITE_A["lat"], SITE_A["lon"], SITE_A["elev_asl_m"])
        self.B = NodeState(SITE_B["name"], SITE_B["lat"], SITE_B["lon"], SITE_B["elev_asl_m"])
        self._seed = random.uniform(0, 1000)
        self.distance_km = 5.0  # Fixed distance in km

# In-memory session storage
SESSIONS: dict[str, Session] = {}
