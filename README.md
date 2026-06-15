# Link Fight — Antenna Alignment Training Simulator

A browser-based, multiplayer antenna alignment training game. Two players (Node A and Node B) compete to establish and optimize a simulated point-to-point radio link. A Gamemaster controls session parameters and monitors both nodes in real time.

---

## What It Does

The Gamemaster creates a session with configurable site elevations, frequencies, and link distance. Two player URLs are generated — one per node. Each player adjusts three controls (azimuth, mast height, tilt) to maximize their received signal strength (RX dBm). The GM sees both players' telemetry plus "ideal" solution values that players cannot see.

Signal quality bands:

| RX Level     | Quality   | Bar Color |
|--------------|-----------|-----------|
| ≥ −90 dBm    | Excellent | Green     |
| −90 to −94   | Good      | Green     |
| −94 to −98   | Fair      | Orange    |
| −98 to −105  | Poor      | Orange    |
| < −105       | Critical  | Red       |

---

## Tech Stack

| Layer    | Technology                               |
|----------|------------------------------------------|
| Backend  | Python 3.12, FastAPI 0.115, Uvicorn 0.30 |
| Frontend | Vanilla HTML/CSS/JS (no framework)       |
| 3D       | Three.js r0.160 (CDN) + OrbitControls   |
| Icons    | Lucide (CDN)                             |
| Storage  | In-memory dict — no database, no files  |

---

## Project Structure

```
linkfightapp/
├── app/
│   ├── main.py                  # FastAPI app, mounts routers and static files
│   ├── constants.py             # Site coordinates, RF model constants — edit here first
│   ├── models/
│   │   ├── session.py           # NodeState, Session dataclasses + SESSIONS dict
│   │   └── requests.py          # Pydantic models: GMCreateBody, PlayerSetBody
│   ├── services/
│   │   ├── session_manager.py   # Session CRUD, validation helpers, public_brief()
│   │   ├── rf_calculations.py   # RF signal model — compute_one_way_rx()
│   │   └── geometry.py          # bearing_deg(), distance_km() (Haversine)
│   ├── utils/
│   │   ├── conversions.py       # ticks_to_deg(), deg_wrap180()
│   │   └── display.py           # rx_color() → "green" | "orange" | "red"
│   ├── routers/
│   │   ├── gm.py                # POST /simple/gm/create, GET /simple/{sid}/gm_view
│   │   ├── player.py            # POST /simple/{sid}/team/{team}/set, GET player_view
│   │   ├── ui.py                # Serves /, /gm, /player HTML pages
│   │   └── debug.py             # /debug/* endpoints (session count, routes)
│   └── static/
│       ├── css/styles.css       # All styles; CSS custom properties at :root
│       ├── js/
│       │   ├── antenna3d.js     # Three.js Antenna3DVisualization class
│       │   ├── gm.js            # GM page: create session, poll loop, 3D update
│       │   └── player.js        # Player page: join, controls, apply, poll loop
│       └── templates/
│           ├── index.html       # Landing page
│           ├── gm.html          # Gamemaster UI
│           └── player.html      # Player UI
├── requirements.txt
├── run.bat                      # Windows launcher (kills :8000, starts uvicorn)
├── run.sh                       # Unix launcher
└── .gitignore
```

---

## Setup

### Windows

```powershell
cd "C:\path\to\linkfightapp"
python -m venv .venv

# If script execution is blocked:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### macOS / Linux

```bash
cd /path/to/linkfightapp
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Running

### Windows (recommended)
```bat
.\run.bat
```
This kills anything on port 8000, then starts Uvicorn with `--reload`.

### Manual (any OS)
```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000/** in your browser.

---

## Workflow

1. **GM** opens `http://127.0.0.1:8000/gm`
2. GM fills in Node A's TX/RX frequencies, local IP, site elevation, and link distance → **Create Session**
3. Node B's fields auto-fill (cross-paired frequencies, paired IP, 180° opposite azimuth)
4. GM shares the two player URLs shown after session creation:
   - `http://127.0.0.1:8000/player?sid=<id>&team=A`
   - `http://127.0.0.1:8000/player?sid=<id>&team=B`
5. Each **Player** opens their URL, clicks **Join**, then adjusts azimuth / mast / tilt to maximize RX
6. GM watches live telemetry including ideal azimuth, ideal tilt, and signal strength for both nodes

---

## How the RF Signal Level Is Calculated

This is the core mechanic. Every 900ms, each player's screen calls `/simple/{sid}/player_view` which runs `compute_one_way_rx()` in `app/services/rf_calculations.py`.

### The full pipeline: controls → variables → RX dBm

**Step 1 — Player inputs three controls:**
- `azimuth_ticks` (0–7200) — horizontal direction the dish is pointing
- `tilt_deg` (−15° to +15°) — vertical tilt up/down
- `mast_sections` (1–9) — how many mast sections are extended

These are posted to `/simple/{sid}/team/{team}/set` and stored in the `NodeState` object.

**Step 2 — The server computes antenna heights:**
```python
tx_h = tx.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (tx.mast_sections - 1) * SECTION_H_M
rx_h = rx.elev_asl_m + BASE_ANTENNA_HEIGHT_M + (rx.mast_sections - 1) * SECTION_H_M
# e.g. Node A at 10m site, 1 section: 10 + 3.67 + 0 = 13.67m total
# e.g. Node A at 10m site, 9 sections: 10 + 3.67 + (8 × 1.67) = 27.03m total
```

**Step 3 — Compute the true bearing between nodes:**
```python
brg_tx_to_rx = bearing_deg(tx.lat, tx.lon, rx.lat, rx.lon)
# Haversine-based compass bearing, e.g. ~75° (northeast) for the default Singapore sites
```

**Step 4 — Compute azimuth error (the key variable):**
```python
az_err_tx = abs(deg_wrap180(ticks_to_deg(tx.az_ticks) - brg_tx_to_rx))
# ticks_to_deg: 0–7200 ticks → 0–360°  (1 tick = 0.05°)
# deg_wrap180: wraps to −180..+180 so we get the shortest angular difference
# az_err_tx = how many degrees off from pointing directly at the target
```

**Step 5 — Compute ideal tilt and tilt error:**
```python
site_diff_m = rx.elev_asl_m - tx.elev_asl_m   # e.g. 30 - 10 = 20m
distance_m  = sess.distance_km * 1000           # e.g. 5000m
raw_tilt    = (site_diff_m / distance_m) * TILT_AMPLIFICATION  # (20/5000) * 2000 = 8°
ideal_tilt  = clamp(raw_tilt, -15, +15)         # e.g. 8° (tilt up toward higher site)
tilt_err    = abs(tx.tilt_deg - ideal_tilt)     # how far off from the ideal angle
```

The `TILT_AMPLIFICATION = 2000` constant inflates what would be a tiny real-world angle (0.004 rad = 0.23°) into a meaningful game range of ±15°. This is a deliberate game design choice, not physical reality.

**Step 6 — Apply all loss/bonus factors to the baseline of −85 dBm:**

| Factor | Variable | Formula | Cap |
|--------|----------|---------|-----|
| Azimuth loss | `az_err_tx` (degrees) | `0.02 × err² + 0.15 × \|err\|` | 25 dB |
| Tilt loss | `tilt_err` (degrees) | `0.05 × err² + 0.25 × \|err\|` | 18 dB |
| Height bonus | extra sections on each end | `0.5 dB × total_extra_sections` | none |
| Height mismatch loss | `tx_h` / `rx_h` ratio | `4 × log(max/min height)` | 8 dB |
| Frequency offset penalty | `\|tx_MHz − rx_MHz\|` | 0 if within 1 MHz; else `(offset_kHz − 1000) / 50` | 40 dB |
| Jitter | deterministic noise | ±0.2 dBm seeded from session + az_err + tilt_err | ±0.2 |

```python
rx_dbm = -85.0 + height_bonus - az_loss - tilt_loss - height_mismatch - freq_penalty + jitter
rx_dbm = clamp(rx_dbm, -120, -80)
```

**Step 7 — Server returns the result:**
The player's browser displays this value as a filled signal bar (−120 dBm = 0%, −80 dBm = 100%) and a quality badge.

### Important asymmetry

Only the **transmitter's** azimuth and tilt affect what the receiver gets. Node A's signal reception is determined by how well Node B's dish is aimed at Node A — not by how A is aimed. Players must independently aim at each other. Both must be correctly aligned before either gets a good signal, because each link direction is computed independently.

### Example scenario (default sites)

Node A: lat 1.33, lon 103.80, elev 10m
Node B: lat 1.36, lon 103.90, elev 30m
Distance: 5 km (manually set)

- True bearing A→B: ~75° (northeast)
- True bearing B→A: ~255° (southwest)
- Ideal tilt for A (pointing up at B): +8° (B is 20m higher)
- Ideal tilt for B (pointing down at A): −8°

If Node A sets azimuth = 1500 ticks (= 75°) and tilt = +8°, azimuth error = 0°, tilt error = 0°, and Node A's signal contribution is at maximum. Node B independently must do the same.

---

## How the Three Controls Drive the 3D Visualization

The 3D view in `app/static/js/antenna3d.js` is a Three.js scene. Every time a player moves a control, the browser calls `updateVisualization()` locally (instant, no network) and also sends a network request via the debounced `apply()` function.

### Azimuth → dish rotation around vertical (Y) axis

```javascript
azimuthRad = (azimuthTicks / 7200) * Math.PI * 2

element.rotation.order = 'YXZ'
element.rotation.y = Math.PI - azimuthRad
```

The `Math.PI` offset aligns the dish's zero-tick direction with North in the Three.js scene (where −Z = North). Moving the azimuth slider/buttons rotates the dish clockwise when viewed from above. The compass rose and horizon markers (N/E/S/W labels at 0/1800/3600/5400 ticks) serve as reference.

### Tilt → dish pitch around horizontal (X) axis

```javascript
tiltRad = (tiltDeg * Math.PI) / 180

element.rotation.x = tiltRad
```

Positive tilt (slider up) tilts the dish rim upward. Negative tilt points it downward. The YXZ rotation order means tilt is always applied in the dish's own rotated frame — so "up" always means up regardless of azimuth.

### Mast sections → mast height and dish elevation

```javascript
mastHeight = 2.0 + (mastSections - 1) * 1.67   // in player mode

mast.scale.y = mastHeight
mast.position.y = 2 + mastHeight / 2
element.position.y = 2 + mastHeight             // dish sits on top of mast
labelSprite.position.y = 4 + mastHeight         // label floats above dish
```

The camera also adjusts as mast grows:
```javascript
cameraDistance = 15 + mastHeight * 0.3
cameraHeight   = 6  + mastHeight * 0.5
```

### The "other" antenna position in player mode

The target antenna (other node) is not placed at its real geographic coordinates. Instead it's always placed 40 units away **in the direction you are currently pointing**, so you can see where your dish is aimed relative to the target:

```javascript
x = Math.sin(azimuthRad) * 40    // East (+) / West (−)
z = -Math.cos(azimuthRad) * 40   // North (−) / South (+)
otherAntenna.position.set(x, 0, z)
```

When your azimuth is correct, the other antenna sits directly in front of your dish.

### GM mode — two nodes, terrain mounds, and signal beams

In GM mode the scene shows both nodes at scaled positions along the Z axis. Elevation is exaggerated by `elevScale = 0.4` so a 20m height difference is visible:

```javascript
yA = elevA * 0.4    // node A's world Y position
yB = elevB * 0.4    // node B's world Y position
separation = clamp(distKm * 4, 15, 40)  // X-axis distance between nodes
```

Cone-shaped terrain mounds scale their height to match the elevation visual.

**Signal beams:** a colored line is drawn from each dish's feed horn outward in the dish's facing direction. The color maps to signal quality (bright green → amber → dark red). The beam direction is extracted by applying the dish element's world quaternion to the local `(0, 0, −1)` vector (the concave/forward direction):

```javascript
forward = new THREE.Vector3(0, 0, -1)
forward.applyQuaternion(element.getWorldQuaternion(...))
```

**Node A's tilt negation in GM mode:** Node A sits at `+Z` in world space but must appear to face Node B at `−Z`. This is achieved by adding a group-level Y rotation (bearing offset). Because this group rotation flips the reference frame, Node A's tilt must be negated so it still visually pitches up/down correctly — `updateAntenna(antennaA, az, -tilt, mast, offsetA)`. This is a known compensating hack.

---

## API Reference

| Method | Endpoint                              | Who calls it          |
|--------|---------------------------------------|-----------------------|
| POST   | `/simple/gm/create`                   | GM create button      |
| PUT    | `/simple/gm/{sid}/update`             | GM update (not in UI) |
| GET    | `/simple/{sid}/gm_view`               | GM poll (every 900ms) |
| POST   | `/simple/{sid}/team/{team}/set`       | Player on any control change |
| GET    | `/simple/{sid}/player_view?team=A\|B` | Player poll (every 900ms) |
| GET    | `/health`                             | Returns `ok`          |
| GET    | `/debug/sessions`                     | Session count only    |
| GET    | `/debug/routes`                       | All registered routes |

---

## Session Lifecycle

- Sessions live in memory (`SESSIONS` dict in `app/models/session.py`)
- Each session gets an 8-char hex ID (e.g. `a3f9c012`)
- Sessions expire after **1 hour** of inactivity
- Cleanup runs probabilistically every ~100 accesses
- **All sessions are lost on server restart** — by design for simplicity

---

## Configuration

All tuneable constants are in `app/constants.py`:

```python
SITE_A = {"name": "Node A", "lat": 1.3300, "lon": 103.8000, "elev_asl_m": 10.0}
SITE_B = {"name": "Node B", "lat": 1.3600, "lon": 103.9000, "elev_asl_m": 30.0}

SECTION_H_M = 1.67           # Height added per mast section (metres)
VEHICLE_HEIGHT_M = 2.0       # Base vehicle height
BASE_ANTENNA_HEIGHT_M = 3.67 # Vehicle + 1 default section
MAX_SECTIONS = 9
MIN_SECTIONS = 1
TILT_RANGE_DEG = 15.0        # ±15° player range

RX_BEST_DB = -85.0           # Best possible signal (0 loss, all bonuses)
HEIGHT_BONUS_PER_SECTION = 0.5
TILT_AMPLIFICATION = 2000.0  # Scales real elevation diff into ±15° game range
```

Site elevations and distance can be overridden per session via the GM form. Lat/lon are only used for bearing calculation (not distance) so the default Singapore coordinates only matter if bearing accuracy matters for a scenario.

---

## Azimuth Scale

Azimuth uses a **7200-tick scale** (military-style mils-adjacent):

- 7200 ticks = 360° → **1 tick = 0.05°**
- 0 = North, 1800 = East, 3600 = South, 5400 = West
- Conversion: `degrees = (ticks % 7200) * 0.05`
- Players adjust in steps of ±1, ±100, ±1000 ticks or via keyboard arrows (±10 ticks)

---

## Development Progress

### What has been built

**Core backend (complete)**
- FastAPI server with four routers (GM, player, UI, debug)
- In-memory session management with locking and expiry
- RF signal model with azimuth, tilt, height, and frequency loss factors
- Pydantic request validation
- Session ID validation and per-session async locks

**GM interface (complete)**
- Create session form with Node A → Node B auto-fill (frequencies cross-paired, IP paired, azimuth 180° offset)
- Live telemetry polling (900ms) showing RX level, mast, azimuth, tilt for both nodes
- Ideal azimuth and ideal tilt displayed for GM only
- Session links generated and shown after creation
- Dark military theme (CSS `gm-theme` class)
- 3D visualization in GM mode with both nodes, terrain mounds, and signal beams

**Player interface (complete)**
- URL-based auto-join (`?sid=xxx&team=A`)
- Azimuth control: ±1/±100/±1000 buttons + direct number input + keyboard arrows
- Mast slider: vertical on desktop, horizontal on mobile (1–9)
- Tilt slider: vertical on desktop, horizontal on mobile (−15° to +15°)
- Keyboard shortcuts: arrows = azimuth/tilt, PgUp/PgDn = mast
- Signal bar (0–100% from −120 to −80 dBm) + quality badge
- Auto-apply on control change (150ms debounce)
- Toast notifications

**3D visualization (complete but historically buggy — see below)**
- Parabolic dish wireframe with concentric ring + radial spoke grid
- Dish rim ring, feed horn, and support struts
- Player mode: daytime sky, compass rose (N/E/S/W), horizon tick markers
- GM mode: dark military sky, both nodes, elevation terrain mounds, colored signal beams
- Orbit controls (click-drag rotate, scroll zoom, right-click pan)
- Pauses rendering when browser tab is not visible

**Responsive UI (complete)**
- Desktop: mast/tilt sliders vertical on left/right of 3D view, azimuth controls above
- Mobile (<768px): all controls stacked vertically, sliders horizontal
- CSS custom properties for theming (`--space-*`, `--color-*`, etc.)

### Commit history summary

| Range | What happened |
|-------|---------------|
| Initial commits | Basic FastAPI app, in-memory sessions, first RF model |
| UI modernisation | Green theme, responsive layout, card-based design |
| Backend hardening | Thread safety (asyncio locks), session expiry, input validation |
| RF model tuning | Frequency penalty loosened (5 kHz/dB → 50 kHz/dB); tilt and elevation made meaningful; one-sided TX-only formula adopted |
| 3D dish geometry | Replaced cone with parabolic wireframe dish; fixed concave direction to face −Z locally |
| 3D beam fixing | ~8 commits iterating on signal beam direction — beams were firing from wrong side, pointing wrong way, or hardcoded between antennas instead of following dish facing |
| GM 3D fixes | Node B tilt inversion, bearing offsets on group vs element, elevation scaling |
| Final fixes | Mast height independence from tilt, height display accuracy |

---

## Outstanding Bugs & Known Issues

### 1. Distance not computed from lat/lon
`distance_km` is a manually set field (default 5 km). The nodes' lat/lon are only used for bearing computation. This means the bearing is always the real Singapore bearing (~75° A→B) regardless of what distance you set. For a 100 km session the angles shown are still the Singapore geometry — visually inconsistent but functionally workable.

### 2. Debug endpoints have no authentication
`check_debug_access()` in `debug.py` is a stub that always passes. The commented-out env var guard (`ENABLE_DEBUG`) should be activated before any deployment outside a local LAN.

### 3. Excessive `console.log` in player.js
`player.js` has `[DEBUG]` log statements on every control interaction, every apply call, and every poll iteration. These should be stripped for any production use.

### 4. `app/main_original_backup.py` — dead file
An old backup of `main.py` remains in the `app/` directory. It's not imported anywhere. It should be deleted when it's no longer needed as a reference.

### 5. No error message detail on session create failure
If the GM's create request fails (e.g. bad frequency, distance out of range), the UI shows a generic "Failed to create session" toast without surfacing the actual validation error from the server.

### 6. Three.js loaded from CDN only
If the CDN (`cdn.jsdelivr.net` for Three.js, `unpkg.com` for Lucide) is unavailable, the 3D visualization and icons silently fail. There is a `typeof THREE === 'undefined'` guard in JS that logs an error, but no graceful text-based fallback.

### 7. Frequency penalty tolerance is very wide
The current model applies **zero penalty** if TX and RX frequencies are within 1 MHz of each other. The earlier implementation was 5 kHz/dB (which was too aggressive for gameplay), relaxed to 50 kHz/dB. The 1 MHz free zone means players rarely encounter this penalty in practice.
