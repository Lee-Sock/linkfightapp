# Link Fight — Simple 2-Node Prototype (Refactored)

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from app.routers import debug, gm, player, ui
import traceback
import sys

# Initialize FastAPI application
app = FastAPI(title="Link Fight — Simple 2-Node Prototype (MVP)")

# Exception handler
@app.exception_handler(Exception)
async def any_error(request: Request, exc: Exception):
    """Make 500s visible in terminal and return simple JSON."""
    print("\n=== UNHANDLED ERROR ===", file=sys.stderr)
    traceback.print_exc()
    return JSONResponse({"error": str(exc)}, status_code=500)

# Mount static files directory
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Include routers
app.include_router(debug.router)
app.include_router(gm.router)
app.include_router(player.router)
app.include_router(ui.router)

# Run server
# - Map deployment view (GM): drag markers to place A/B
# - Live map view: show both players' LOS and a landscape/side view
#   with terrain/obstacles and vertical pointing (tilt)
# =========================================================

# ---------- Helpers ----------
def ticks_to_deg(ticks: int) -> float:
    # 7200 ticks = 360 deg -> 1 tick = 0.05 deg
    return ((ticks % 7200) * 0.05) % 360.0

def deg_wrap180(d: float) -> float:
    d = (d + 180.0) % 360.0 - 180.0
    return d

def distance_km(lat1, lon1, lat2, lon2):
    # Haversine
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = p2 - p1
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def bearing_deg(lat1, lon1, lat2, lon2):
    # Initial bearing
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1)*math.sin(p2) - math.sin(p1)*math.cos(p2)*math.cos(dl)
    brg = (math.degrees(math.atan2(y, x)) + 360.0) % 360.0
    return brg

# ---------- Hardcoded Sites ----------
SITE_A = {"name": "Node A", "lat": 1.3300, "lon": 103.8000, "elev_asl_m": 10.0}
SITE_B = {"name": "Node B", "lat": 1.3600, "lon": 103.9000, "elev_asl_m": 30.0}

SECTION_H_M = 1.67  # Each mast section adds 1.67m in height
VEHICLE_HEIGHT_M = 2.0  # Vehicle base height
DEFAULT_SECTION_HEIGHT_M = 1.67  # Default section that antenna sits on
BASE_ANTENNA_HEIGHT_M = VEHICLE_HEIGHT_M + DEFAULT_SECTION_HEIGHT_M  # 3.67m total base
MAX_SECTIONS = 9
MIN_SECTIONS = 1  # Slider starts from 1, not 0
TILT_RANGE_DEG = 15.0  # ±15° mobility range

# ---------- Simple RX Model (no complex RF) ----------
# Base floor and smooth penalties/bonuses. Designed to be *fun* and intuitive:
#   RX_dBm = base + height_bonus - az_loss - tilt_loss - freq_penalty + jitter
BASE_RX_DBM = -108.0
AZIMUTH_TOL_DEG = 5.0   # hidden "good enough" window
TILT_TOL_DEG    = 3.0   # (currently not used directly, but kept for tuning)

def azimuth_loss_db(az_err_deg: float) -> float:
    # 0.35 dB per deg near center, capped; smooth quadratic for gameplay
    return min(25.0, 0.02 * (az_err_deg ** 2) + 0.15 * abs(az_err_deg))

def tilt_loss_db(tilt_err_deg: float) -> float:
    # penalize vertical misalignment aggressively; LOS needs precise tilt
    return min(18.0, 0.05 * (tilt_err_deg ** 2) + 0.25 * abs(tilt_err_deg))

def height_bonus_db(h_tx_amsl: float, h_rx_amsl: float) -> float:
    # Bonus grows with geometric mean of heights; capped ~8 dB
    if h_tx_amsl <= 0 or h_rx_amsl <= 0: return 0.0
    gmean = math.sqrt(h_tx_amsl * h_rx_amsl)
    return min(8.0, 2.0 * math.log(max(1.0, gmean)))

def freq_penalty_db(tx_mhz: float, rx_mhz: float) -> float:
    # If tuned within 50 kHz, no penalty; otherwise heavy; 5 kHz per dB ramp
    off_khz = abs(tx_mhz - rx_mhz) * 1000.0
    if off_khz <= 50.0: return 0.0
    return min(40.0, (off_khz - 50.0) / 5.0)

def rx_color(rx_dbm: float) -> str:
    if rx_dbm < -93.0:   return "green"   # Best link
    if -95.0 <= rx_dbm < -93.0: return "orange"
    if -103.0 <= rx_dbm < -95.0: return "orange"
    if -110.0 <= rx_dbm < -103.0: return "red"
    return "red"  # Anything worse than -110 is also red

# ---------- Session State ----------
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

from fastapi import Request
from fastapi.responses import JSONResponse

@app.get("/debug/sessions")
def debug_sessions():
    # See what sessions exist
    return {"sessions": list(SESSIONS.keys())}

@app.exception_handler(Exception)
async def any_error(request: Request, exc: Exception):
    # Make 500s visible in your terminal and return a simple JSON
    import traceback, sys
    print("\n=== UNHANDLED ERROR ===", file=sys.stderr)
    traceback.print_exc()
    return JSONResponse({"error": str(exc)}, status_code=500)


class Session:
    def __init__(self):
        self.id = uuid4().hex[:8]
        self.A = NodeState(SITE_A["name"], SITE_A["lat"], SITE_A["lon"], SITE_A["elev_asl_m"])
        self.B = NodeState(SITE_B["name"], SITE_B["lat"], SITE_B["lon"], SITE_B["elev_asl_m"])
        self._seed = random.uniform(0, 1000)
        self.distance_km = 5.0  # Fixed distance in km

SESSIONS: dict[str, Session] = {}

# ---------- API Models ----------
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
    A_azimuth_ticks: Optional[int] = None
    B_azimuth_ticks: Optional[int] = None
    # Distance between nodes (km)
    distance_km: float = 5.0

class PlayerSetBody(BaseModel):
    azimuth_ticks: Optional[int] = None  # 0..7200
    tilt_deg: Optional[float] = None     # -15..+15
    mast_sections: Optional[int] = None  # 1..9
    tx_MHz: Optional[float] = None       # optional re-tune
    rx_MHz: Optional[float] = None

# ---------- Core compute ----------
def compute_one_way_rx(sess: Session, tx: NodeState, rx: NodeState):
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

def public_brief(sess: Session, team: Literal["A", "B"]):
    me = sess.A if team == "A" else sess.B
    other = sess.B if team == "A" else sess.A
    # Coarse azimuth sector (not exact): nearest 10°
    brg = bearing_deg(me.lat, me.lon, other.lat, other.lon)
    coarse = round(brg / 10.0) * 10
    return {
        "node": me.name,
        "local_ip": me.local_ip,
        "tx_MHz": round(me.tx_mhz, 3),
        "rx_MHz": round(me.rx_mhz, 3),
        "distant_end": other.name,
        "site_elevation_m": me.elev_asl_m,
        "azimuth_sector_deg": f"{int((coarse-10)%360)}–{int((coarse+10)%360)}"
    }

# ---------- Endpoints ----------
@app.get("/", response_class=HTMLResponse)
def root():
    return HTMLResponse("""
    <!doctype html>
    <html>
    <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>Link Fight — Simple 2-Node Prototype</title>
        <style>
            body{font:14px system-ui;margin:0;padding:20px;background:#f5f5f5}
            .wrap{max-width:600px;margin:40px auto;background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
            h1{margin:0 0 20px;color:#333}
            p{color:#666;line-height:1.6}
            a{color:#0066cc;text-decoration:none;font-weight:500}
            a:hover{text-decoration:underline}
            .links{margin-top:20px}
            .links a{display:block;padding:10px;margin:8px 0;background:#f0f0f0;border-radius:5px}
        </style>
    </head>
    <body>
        <div class="wrap">
            <h1>Link Fight — Simple 2-Node Prototype</h1>
            <p>Welcome! This is a simple 2-node link fight simulation.</p>
            <div class="links">
                <a href="/gm">Gamemaster Interface</a>
                <a href="/player">Player Interface</a>
                <a href="/health">Health Check</a>
            </div>
        </div>
    </body>
    </html>
    """)

@app.get("/health", response_class=PlainTextResponse)
def health(): return "ok"

@app.post("/simple/gm/create")
def simple_gm_create(body: GMCreateBody):
    s = Session()
    # radio settings
    s.A.tx_mhz, s.A.rx_mhz, s.A.local_ip, s.A.call_id = body.A_tx_MHz, body.A_rx_MHz, body.A_local_ip, body.A_call_id
    s.B.tx_mhz, s.B.rx_mhz, s.B.local_ip, s.B.call_id = body.B_tx_MHz, body.B_rx_MHz, body.B_local_ip, body.B_call_id
    # elevations
    s.A.elev_asl_m = body.A_elev_asl_m
    s.B.elev_asl_m = body.B_elev_asl_m
    # distance
    s.distance_km = body.distance_km
    # initial azimuths on 0..7200 scale
    if body.A_azimuth_ticks is not None:
        s.A.az_ticks = max(0, min(7200, int(body.A_azimuth_ticks)))
    else:
        s.A.az_ticks = random.randint(0, 7199)
    if body.B_azimuth_ticks is not None:
        s.B.az_ticks = max(0, min(7200, int(body.B_azimuth_ticks)))
    else:
        # If A is set but B is not, make B 180° apart (±3600 ticks)
        s.B.az_ticks = (s.A.az_ticks + 3600) % 7200
    SESSIONS[s.id] = s
    return {"id": s.id}

@app.put("/simple/gm/{sid}/update")
def simple_gm_update(sid: str, body: GMCreateBody):
    s = SESSIONS.get(sid)
    if not s: raise HTTPException(404, "Session not found")
    s.A.tx_mhz, s.A.rx_mhz, s.A.local_ip, s.A.call_id = body.A_tx_MHz, body.A_rx_MHz, body.A_local_ip, body.A_call_id
    s.B.tx_mhz, s.B.rx_mhz, s.B.local_ip, s.B.call_id = body.B_tx_MHz, body.B_rx_MHz, body.B_local_ip, body.B_call_id
    s.A.elev_asl_m = body.A_elev_asl_m
    s.B.elev_asl_m = body.B_elev_asl_m
    s.distance_km = body.distance_km
    if body.A_azimuth_ticks is not None:
        s.A.az_ticks = max(0, min(7200, int(body.A_azimuth_ticks)))
    if body.B_azimuth_ticks is not None:
        s.B.az_ticks = max(0, min(7200, int(body.B_azimuth_ticks)))
    return {"ok": True}

@app.post("/simple/{sid}/team/{team}/set")
def simple_player_set(sid: str, team: Literal["A","B"], body: PlayerSetBody):
    s = SESSIONS.get(sid)
    if not s: raise HTTPException(404, "Session not found")
    t = s.A if team == "A" else s.B
    if body.azimuth_ticks is not None:
        ticks = max(0, min(int(body.azimuth_ticks), 7200))
        t.az_ticks = ticks
    if body.tilt_deg is not None:
        t.tilt_deg = max(-TILT_RANGE_DEG, min(TILT_RANGE_DEG, float(body.tilt_deg)))
    if body.mast_sections is not None:
        t.mast_sections = max(MIN_SECTIONS, min(int(body.mast_sections), MAX_SECTIONS))
    if body.tx_MHz is not None:
        t.tx_mhz = float(body.tx_MHz)
    if body.rx_MHz is not None:
        t.rx_mhz = float(body.rx_MHz)
    return {"ok": True}

@app.get("/simple/{sid}/gm_view")
def simple_gm_view(sid: str):
    s = SESSIONS.get(sid)
    if not s: raise HTTPException(404, "Session not found")
    rxA, brgBA, tiltA = compute_one_way_rx(s, s.B, s.A)  # what A receives (B→A)
    rxB, brgAB, tiltB = compute_one_way_rx(s, s.A, s.B)  # what B receives (A→B)
    
    # Calculate antenna elevations
    ant_elev_A = s.A.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (s.A.mast_sections - 1) * SECTION_H_M
    ant_elev_B = s.B.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (s.B.mast_sections - 1) * SECTION_H_M
    
    # Calculate ideal settings for GM view (thresholds)
    # For Node A pointing at Node B
    ideal_az_A = brgAB
    ideal_az_A_ticks = round((ideal_az_A / 360.0) * 7200) % 7200
    ideal_tilt_A = tiltB  # Tilt needed for A to point at B
    
    # For Node B pointing at Node A
    ideal_az_B = brgBA
    ideal_az_B_ticks = round((ideal_az_B / 360.0) * 7200) % 7200
    ideal_tilt_B = tiltA  # Tilt needed for B to point at A
    
    return {
        "id": s.id,
        "A": {
            "pos": {"lat": s.A.lat, "lon": s.A.lon, "elev_asl_m": s.A.elev_asl_m},
            "mast_sections": s.A.mast_sections,
            "antenna_elevation_m": round(ant_elev_A, 2),
            "az_ticks": s.A.az_ticks,
            "az_deg": round(ticks_to_deg(s.A.az_ticks), 2),
            "tilt_deg": round(s.A.tilt_deg, 2),
            "tx": s.A.tx_mhz, "rx": s.A.rx_mhz, "ip": s.A.local_ip, "call_id": s.A.call_id,
            "rx_level_dBm": round(rxA, 1), "color": rx_color(rxA),
            # GM-only thresholds
            "ideal_azimuth_ticks": ideal_az_A_ticks,
            "ideal_azimuth_deg": round(ideal_az_A, 2),
            "ideal_tilt_deg": int(round(ideal_tilt_A)),
        },
        "B": {
            "pos": {"lat": s.B.lat, "lon": s.B.lon, "elev_asl_m": s.B.elev_asl_m},
            "mast_sections": s.B.mast_sections,
            "antenna_elevation_m": round(ant_elev_B, 2),
            "az_ticks": s.B.az_ticks,
            "az_deg": round(ticks_to_deg(s.B.az_ticks), 2),
            "tilt_deg": round(s.B.tilt_deg, 2),
            "tx": s.B.tx_mhz, "rx": s.B.rx_mhz, "ip": s.B.local_ip, "call_id": s.B.call_id,
            "rx_level_dBm": round(rxB, 1), "color": rx_color(rxB),
            # GM-only thresholds
            "ideal_azimuth_ticks": ideal_az_B_ticks,
            "ideal_azimuth_deg": round(ideal_az_B, 2),
            "ideal_tilt_deg": int(round(ideal_tilt_B)),
        },
        "distance_km": round(s.distance_km, 3),
    }

@app.get("/simple/{sid}/player_view")
def simple_player_view(sid: str, team: Literal["A","B"]):
    s = SESSIONS.get(sid)
    if not s: raise HTTPException(404, "Session not found")
    me = s.A if team == "A" else s.B
    other = s.B if team == "A" else s.A
    rx_me, _, _ = compute_one_way_rx(s, other, me)  # I receive from the other side
    return {
        "brief": public_brief(s, team),
        "controls": {
            "mast_sections_max": MAX_SECTIONS,
            "mast_sections_min": MIN_SECTIONS,
            "tilt_range_deg": [-TILT_RANGE_DEG, TILT_RANGE_DEG],
            "azimuth_ticks_range": [0, 7200]
        },
        "my_current": {
            "mast_sections": me.mast_sections,
            "tilt_deg": round(me.tilt_deg, 2),
            "azimuth_ticks": me.az_ticks
        },
        "telemetry": {
            "rx_level_dBm": round(rx_me, 1),
            "color": rx_color(rx_me)
        }
    }

# ---------- Minimal UIs (no maps to keep this tiny) ----------
# ---- Plain HTML constant for /player (NOT an f-string) ----
PLAYER_HTML = r"""<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Player — Simple Link Fight</title>
<style>
  body{font:14px system-ui;margin:0}
  .wrap{max-width:800px;margin:16px auto;padding:12px}
  h2{margin:6px 0 10px}
  .card{border:1px solid #ddd;border-radius:10px;padding:12px;margin:12px 0}
  label{display:block;font-size:12px;color:#444;margin:8px 0 4px}
  input,button,select{padding:8px;width:100%}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  .row>div{flex:1 1 180px}
  .meter{height:20px;background:#eee;border-radius:10px;overflow:hidden;margin:8px 0}
  .fill{height:100%;width:0%;background:linear-gradient(90deg,#c00,#cc0,#0a0);transition:width 0.3s}
  .kv{font-size:12px;color:#666}
  .slider-container{display:flex;align-items:center;gap:12px}
  .slider-container input[type="range"]{flex:1;min-width:0}
  .slider-container input[type="number"]{width:80px;flex-shrink:0}
  .status-joined{color:#0a0;font-weight:500}
</style>
</head>
<body><div class="wrap">
<h2>Player</h2>

<div class="card">
  <div class="row">
    <div><label>Session</label><input id="sid" placeholder="paste session id"/></div>
    <div><label>Node</label>
      <select id="team">
        <option value="A">Node 1</option>
        <option value="B">Node 2</option>
      </select>
    </div>
    <div style="align-self:end"><button id="join">Join</button></div>
  </div>
  <div class="kv" id="brief">—</div>
  <div class="kv" id="joinStatus" style="margin-top:8px;font-weight:500"></div>
</div>

<div class="card">
  <h3>Controls</h3>
  <div>
    <div style="margin-bottom:16px">
      <label>Azimuth (ticks 0–7200)</label>
      <div class="slider-container">
        <input id="az" type="range" min="0" max="7200" value="0"/>
        <input id="az_val" type="number" min="0" max="7200" value="0"/>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <label>Tilt (° −15..+15)</label>
      <div class="slider-container">
        <input id="tilt" type="range" min="-15" max="15" value="0"/>
        <input id="tilt_val" type="number" min="-15" max="15" value="0"/>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <label>Mast Sections (1..9)</label>
      <div class="slider-container">
        <input id="mast" type="range" min="1" max="9" value="1"/>
        <input id="mast_val" type="number" min="1" max="9" value="1"/>
      </div>
    </div>
  </div>
  <div class="row">
    <div><button id="apply">Apply</button></div>
  </div>
</div>

<div class="card">
  <h3>RX</h3>
  <div class="meter"><div id="fill" class="fill"></div></div>
  <div id="rx" class="kv">—</div>
</div>

<script>
const E=id=>document.getElementById(id);

function pct(rx){ const lo=-120, hi=-70; return Math.max(0, Math.min(100, (rx-lo)/(hi-lo)*100)); }
function color(rx){
  if(rx < -93) return 'green';      // Best link
  if(rx >= -95 && rx < -93) return 'orange';
  if(rx >= -103 && rx < -95) return 'orange';
  if(rx >= -110 && rx < -103) return 'red';
  return 'red';  // Anything worse than -110
}
function fmtBrief(b){
  return `Node: ${b.node} | Local IP: ${b.local_ip} | TX: ${b.tx_MHz} MHz | RX: ${b.rx_MHz} MHz | `
       + `Distant end: ${b.distant_end} | Site elev: ${b.site_elevation_m} m | Azimuth sector: ${b.azimuth_sector_deg}`;
}

function bindSlider(sliderId, numberId, min, max){
  const s = E(sliderId), n = E(numberId);
  if (!s || !n) return;
  const clamp = v => Math.max(min, Math.min(max, v));

  // slider → number
  s.addEventListener('input', () => {
    n.value = s.value;
  });

  // number → slider
  n.addEventListener('input', () => {
    let v = Number(n.value);
    if (isNaN(v)) v = 0;
    v = clamp(v);
    n.value = v;
    s.value = v;
  });
}

// set up bindings immediately (script is at end of body)
bindSlider('az','az_val',0,7200);
bindSlider('tilt','tilt_val',-15,15);
bindSlider('mast','mast_val',1,9);

function readQueryDefaults(){
  const url = new URL(window.location.href);
  const sid = url.searchParams.get('sid') || '';
  const team = (url.searchParams.get('team') || 'A').toUpperCase();
  if (sid) E('sid').value = sid;
  if (team === 'A' || team === 'B') E('team').value = team;
}

async function join(){
  const sid=E('sid').value.trim(); const team=E('team').value;
  if(!sid) return;
  const r=await fetch(`/simple/${sid}/player_view?team=${team}`);
  if(!r.ok){
    E('joinStatus').textContent = 'Failed to join';
    E('joinStatus').className = 'kv';
    return;
  }
  const j=await r.json();
  if(j.brief) E('brief').textContent = fmtBrief(j.brief);
  if(j.my_current){
    E('az').value = j.my_current.azimuth_ticks;
    E('az_val').value = j.my_current.azimuth_ticks;
    E('tilt').value = j.my_current.tilt_deg;
    E('tilt_val').value = j.my_current.tilt_deg;
    E('mast').value = j.my_current.mast_sections;
    E('mast_val').value = j.my_current.mast_sections;
  }
  // Show joined status
  E('joinStatus').textContent = '✓ Joined';
  E('joinStatus').className = 'kv status-joined';
}

async function apply(){
  const sid=E('sid').value.trim(); const team=E('team').value;
  if(!sid) return;
  await fetch(`/simple/${sid}/team/${team}/set`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      azimuth_ticks:Number(E('az').value),
      tilt_deg:Number(E('tilt').value),
      mast_sections:Number(E('mast').value)
    })
  });
}

async function poll(){
  while(true){
    await new Promise(r=>setTimeout(r, 900));
    const sid=E('sid').value.trim(); const team=E('team').value;
    if(!sid) continue;
    const r=await fetch(`/simple/${sid}/player_view?team=${team}`); if(!r.ok) continue;
    const j=await r.json();
    if(j.brief) E('brief').textContent = fmtBrief(j.brief);
    if(j.telemetry){
      const rx=j.telemetry.rx_level_dBm;
      E('rx').textContent = `RX: ${rx.toFixed(1)} dBm`;
      E('fill').style.width = pct(rx).toFixed(0)+'%';
    }
  }
}

let polling = false;

E('join').onclick=async()=>{
  await join();
  if(!polling){
    polling = true;
    poll();
  }
};
E('apply').onclick=async()=>{ await apply(); };

readQueryDefaults();
</script>

</div></body></html>"""

@app.get("/player", response_class=HTMLResponse)
def player_ui():
    # Return the constant defined above; NOT an f-string.
    return HTMLResponse(PLAYER_HTML)

# ---- Plain HTML constant for /gm (NOT an f-string) ----
GM_HTML = r"""<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Gamemaster — Simple Link Fight</title>
<style>
  body{font:14px system-ui;margin:0}
  .wrap{max-width:900px;margin:16px auto;padding:12px}
  h2{margin:6px 0 10px}
  h4{margin:4px 0 8px}
  .card{border:1px solid #ddd;border-radius:10px;padding:12px;margin:12px 0}
  label{display:block;font-size:12px;color:#444;margin:6px 0 4px}
  input,button{padding:8px;width:100%}
  .row{display:flex;gap:12px;flex-wrap:wrap}
  .row>div{flex:1 1 170px}
  pre{white-space:pre-wrap;background:#fafafa;border:1px solid #eee;padding:8px;border-radius:8px}
  .kv{font-size:12px;color:#666}
  .ok{color:#0a0}.warn{color:#c90}.bad{color:#c00}
  small{font-size:11px;color:#666}
  input:disabled{background:#f0f0f0;color:#666;cursor:not-allowed}
  input.readonly{background:#f0f0f0;color:#666}
</style>
</head>
<body><div class="wrap">
<h2>Gamemaster</h2>

<div class="card">
  <h3>Create Session</h3>
  <div class="row">
    <div>
      <h4>Node 1</h4>
      <label>TX (MHz)</label><input id="A_tx" value="1300.750"/>
      <label>RX (MHz)</label><input id="A_rx" value="1800.250"/>
      <label>Local IP</label><input id="A_ip" value="10.1.1.9"/>
      <label>Call ID</label><input id="A_cid" value="8" disabled/>
      <label>Site elevation (m)</label><input id="A_elev" value="10"/>
      <label>Azimuth (0-7200)</label><input id="A_az" type="number" min="0" max="7200" value=""/>
    </div>
    <div>
      <h4>Node 2 (auto from Node 1)</h4>
      <label>TX (MHz)</label><input id="B_tx" value="1300.750" disabled/>
      <label>RX (MHz)</label><input id="B_rx" value="1800.250" disabled/>
      <label>Local IP</label><input id="B_ip" value="10.1.1.8" disabled/>
      <label>Call ID</label><input id="B_cid" value="7" disabled/>
      <label>Site elevation (m)</label><input id="B_elev" value="30"/>
      <label>Azimuth (0-7200)</label><input id="B_az" type="number" min="0" max="7200" value="" disabled/>
    </div>
  </div>
  <small>Node 2 TX, RX, Local IP, and Azimuth auto-fill from Node 1 (TX/RX swap, paired IP, 180° azimuth offset). Call IDs are auto-generated from IP pairing.</small>
  <div class="row" style="margin-top:10px">
    <div style="flex:0 0 200px">
      <label>Distance (km)</label><input id="distance" type="number" min="0.1" max="100" step="0.1" value="5.0"/>
    </div>
  </div>
  <div class="row" style="margin-top:10px">
    <div><button id="create">Create Session</button></div>
  </div>
  <div class="kv" id="sidRow">Session: —</div>
  <div class="kv" id="links">Player links will appear here after creation…</div>
</div>

<div class="card">
  <h3>Live View</h3>
  <div id="live">—</div>
</div>

<script>
const E=id=>document.getElementById(id);
function cls(rx){ if(rx>=-90&&rx<=-80) return 'ok'; if(rx>=-95&&rx<-90) return 'warn'; if(rx>=-105&&rx<-95) return 'warn'; return 'bad'; }

// --- Node 1 → Node 2 auto-logic ---

function parsePairIp(ipStr){
  const parts = ipStr.trim().split('.');
  if (parts.length !== 4) return null;
  let last = parseInt(parts[3],10);
  if (Number.isNaN(last)) return null;
  // Pair logic: 1↔2, 3↔4, 5↔6, 7↔8, etc.
  // If odd, add 1; if even, subtract 1
  let pair = (last % 2 === 1) ? last + 1 : last - 1;
  if (pair < 1) pair = 1;
  if (pair > 254) pair = 254;
  parts[3] = String(pair);
  return {
    ip1: ipStr.trim(),
    ip2: parts.join('.'),
    last1: last,
    last2: pair
  };
}

function syncNode2FromNode1(){
  // TX/RX cross-link
  const aTx = Number(E('A_tx').value);
  const aRx = Number(E('A_rx').value);
  if (!Number.isNaN(aTx)) E('B_rx').value = aTx.toFixed(3);
  if (!Number.isNaN(aRx)) E('B_tx').value = aRx.toFixed(3);

  // IP pairing + Call IDs (each node uses the other node's last octet)
  const info = parsePairIp(E('A_ip').value);
  if (info){
    E('B_ip').value = info.ip2;
    // Node 1 Call ID = Node 2 last octet, Node 2 Call ID = Node 1 last octet
    E('A_cid').value = String(info.last2);
    E('B_cid').value = String(info.last1);
  }

  // Azimuth: Node 2 is 180° (3600 ticks) apart from Node 1
  const aAz = Number(E('A_az').value);
  if (!Number.isNaN(aAz) && aAz >= 0 && aAz <= 7200){
    // Calculate 180° apart (3600 ticks), wrapping around 7200
    const bAz = (aAz + 3600) % 7200;
    E('B_az').value = Math.round(bAz);
  } else {
    E('B_az').value = '';
  }
}

['A_tx','A_rx','A_ip','A_az'].forEach(id=>{
  const el = E(id);
  if (el) el.addEventListener('input', syncNode2FromNode1);
});

// initialise Node 2 once on load
syncNode2FromNode1();

// --- Create + Poll ---

async function create(){
  const aAz = E('A_az').value.trim();
  // Node 2 azimuth is always calculated from Node 1 (180° apart)
  let bAz = '';
  if (aAz){
    const aAzNum = Number(aAz);
    if (!Number.isNaN(aAzNum) && aAzNum >= 0 && aAzNum <= 7200){
      bAz = String((aAzNum + 3600) % 7200);
    }
  }
  const body={
    A_tx_MHz: Number(E('A_tx').value), A_rx_MHz: Number(E('A_rx').value),
    A_local_ip: E('A_ip').value, A_call_id: E('A_cid').value,
    B_tx_MHz: Number(E('B_tx').value), B_rx_MHz: Number(E('B_rx').value),
    B_local_ip: E('B_ip').value, B_call_id: E('B_cid').value,
    A_elev_asl_m: Number(E('A_elev').value), B_elev_asl_m: Number(E('B_elev').value),
    A_azimuth_ticks: aAz ? Number(aAz) : null,
    B_azimuth_ticks: bAz ? Number(bAz) : null,
    distance_km: Number(E('distance').value) || 5.0
  };
  const r=await fetch('/simple/gm/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok){ alert('Create failed: '+r.status); return; }
  const j=await r.json(); const sid=j.id;
  E('sidRow').textContent='Session: '+sid;
  const a=`/player?sid=${sid}&team=A`; const b=`/player?sid=${sid}&team=B`;
  E('links').innerHTML = `A: <a href="${a}" target="_blank">${a}</a><br/>B: <a href="${b}" target="_blank">${b}</a>`;
  window.history.replaceState(null,'', '/gm?sid='+sid);
}

async function poll(){
  while(true){
    await new Promise(r=>setTimeout(r, 900));
    const url = new URL(window.location.href);
    const sid = (E('sidRow').textContent.match(/Session:\s+(\w+)/)||[])[1] || url.searchParams.get('sid') || '';
    if(!sid) continue;
    const r=await fetch('/simple/'+sid+'/gm_view'); if(!r.ok) continue;
    const j=await r.json();
    E('sidRow').textContent='Session: '+j.id;
    E('live').innerHTML = `
      <pre>
Node 1: RX <span class="${cls(j.A.rx_level_dBm)}">${j.A.rx_level_dBm} dBm</span> | mast ${j.A.mast_sections} | az ${j.A.az_ticks} | tilt ${j.A.tilt_deg}° | Antenna Elev: ${j.A.antenna_elevation_m}m
        TX ${j.A.tx} MHz | RX ${j.A.rx} MHz | IP ${j.A.ip} | Call ${j.A.call_id}
        Ideal: az ${j.A.ideal_azimuth_ticks} (${j.A.ideal_azimuth_deg}°) | tilt ${j.A.ideal_tilt_deg}°
Node 2: RX <span class="${cls(j.B.rx_level_dBm)}">${j.B.rx_level_dBm} dBm</span> | mast ${j.B.mast_sections} | az ${j.B.az_ticks} | tilt ${j.B.tilt_deg}° | Antenna Elev: ${j.B.antenna_elevation_m}m
        TX ${j.B.tx} MHz | RX ${j.B.rx} MHz | IP ${j.B.ip} | Call ${j.B.call_id}
        Ideal: az ${j.B.ideal_azimuth_ticks} (${j.B.ideal_azimuth_deg}°) | tilt ${j.B.ideal_tilt_deg}°
Distance: ${j.distance_km} km
      </pre>`;
  }
}

E('create').onclick=create;
poll();
</script>

</div></body></html>"""

@app.get("/gm", response_class=HTMLResponse)
def gm_ui():
    return HTMLResponse(GM_HTML)

# ------------- Run -------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
