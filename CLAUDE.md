# CLAUDE.md — Link Fight Codebase Guide

This file provides context for AI coding agents working on this repo.

---

## What This Is

Link Fight is a browser-based, multiplayer antenna alignment training game. A Gamemaster (GM) creates sessions; two players each control one radio node (azimuth, mast height, tilt) to maximize received signal strength (RX dBm). The server is a FastAPI app with in-memory sessions and a vanilla JS frontend with Three.js 3D visualization.

---

## Stack

- **Backend:** Python 3.12, FastAPI 0.115, Uvicorn 0.30
- **Frontend:** Vanilla HTML/CSS/JS (no framework, no bundler)
- **3D:** Three.js r0.160 + OrbitControls, loaded from CDN in HTML
- **Icons:** Lucide, loaded from CDN
- **Storage:** In-memory dict only — no database, no files, no Redis

---

## File Map

```
app/
  main.py                  FastAPI app init, mounts static + all routers
  constants.py             ALL tuneable constants — start here for RF/site config
  models/
    session.py             NodeState class, Session class, SESSIONS dict, SESSION_LOCKS
    requests.py            Pydantic models: GMCreateBody, PlayerSetBody
  services/
    session_manager.py     Session CRUD, validation helpers, public_brief()
    rf_calculations.py     RF model: compute_one_way_rx() — core physics
    geometry.py            bearing_deg(), distance_km() (Haversine)
  utils/
    conversions.py         ticks_to_deg(), deg_wrap180()
    display.py             rx_color() → "green" | "orange" | "red"
  routers/
    gm.py                  POST /simple/gm/create, PUT /simple/gm/{sid}/update, GET /simple/{sid}/gm_view
    player.py              POST /simple/{sid}/team/{team}/set, GET /simple/{sid}/player_view
    ui.py                  GET / , GET /gm , GET /player , GET /health
    debug.py               GET /debug/* (session count, routes, file info)
  static/
    css/styles.css         All styles; CSS custom properties for theming
    js/
      antenna3d.js         Antenna3DVisualization class (Three.js)
      gm.js                GM page: create session, poll loop, 3D update
      player.js            Player page: join, controls, apply loop, poll loop
    templates/
      index.html           Landing page
      gm.html              GM UI
      player.html          Player UI
```

---

## Key Concepts

### Azimuth Scale
- **7200 ticks = 360°** → 1 tick = 0.05°
- 0=North, 1800=East, 3600=South, 5400=West
- `ticks_to_deg(ticks)` in `utils/conversions.py`
- Players see and input tick values, not degrees

### Session ID
- 8 hex characters (from `uuid4().hex[:8]`)
- Validated by regex `^[a-f0-9]{8}$` in `session_manager.py`

### Node State (`NodeState`)
Each node tracks:
- `az_ticks` (0–7200), `tilt_deg` (−15..+15), `mast_sections` (1..9)
- `tx_mhz`, `rx_mhz`, `local_ip`, `call_id`
- `lat`, `lon`, `elev_asl_m` (set at creation, overrideable per session)

### RF Model (`rf_calculations.py: compute_one_way_rx`)
Returns `(rx_dbm, bearing_tx_to_rx, ideal_tilt_tx, ideal_tilt_rx)`.

Only the **transmitter's** azimuth and tilt determine RX at the receiver — not the receiver's own alignment. This is intentional gameplay design.

Loss factors applied to `RX_BEST_DB = -85 dBm`:
- `azimuth_loss_db` — quadratic+linear on TX azimuth error, cap 25 dB
- `tilt_loss_db` — quadratic+linear on TX tilt error, cap 18 dB
- `height_bonus_db` — 0.5 dB per extra mast section on either end, no cap
- `height_mismatch_loss_db` — log of height ratio, cap 8 dB
- `freq_penalty_db` — 0 if within 1 MHz; ramps at 50 kHz/dB, cap 40 dB

Final value clamped to `[−120, −80]`.

### Ideal Tilt Calculation
Ideal tilt is derived from **site elevation difference only** (not mast sections):
```python
raw_tilt = (site_diff_m / distance_m) * TILT_AMPLIFICATION
```
`TILT_AMPLIFICATION = 2000.0` scales a small real-world angle into the ±15° range.

### Frequency Pairing
Node B's frequencies auto-cross-pair with Node A at session creation:
- A TX → B RX, B TX → A RX
- The `create_session()` function enforces this if B's freqs aren't explicitly set differently

### Session Expiry
- `SESSION_MAX_AGE_SECONDS = 3600` (1 hour of inactivity)
- Cleanup is probabilistic: triggered roughly every 100 session accesses
- Sessions don't survive server restart

---

## API Endpoints Summary

| Method | Path                                  | Who calls it |
|--------|---------------------------------------|--------------|
| POST   | `/simple/gm/create`                   | GM create button |
| PUT    | `/simple/gm/{sid}/update`             | GM update (not wired in UI currently) |
| GET    | `/simple/{sid}/gm_view`               | GM poll loop (every ~900ms) |
| POST   | `/simple/{sid}/team/{team}/set`       | Player apply() on control change |
| GET    | `/simple/{sid}/player_view?team=A\|B` | Player poll loop (every ~900ms) |

---

## Frontend Polling Pattern

Both GM and player pages use an infinite `while (true)` async loop with `await new Promise(r => setTimeout(r, 900))`. There is no WebSocket — pure polling.

Player changes are sent immediately (debounced 150ms) via `apply()` which POSTs to `/simple/{sid}/team/{team}/set`. The poll loop then confirms the server state and updates the 3D view.

---

## 3D Visualization (`antenna3d.js`)

`new Antenna3DVisualization(containerId, mode, myNode)`:
- `mode`: `'player'` or `'gm'`
- `myNode`: `'A'` or `'B'`

**Dish geometry:** concave faces **−Z** in local element space. Rotation:
- `element.rotation.order = 'YXZ'`
- `element.rotation.y = Math.PI - azimuthRad` (azimuth)
- `element.rotation.x = tiltRad` (tilt)

**GM mode offset:** Node A sits at `+Z` in world space, Node B at `−Z`. A bearing offset is applied to the group so visually correct azimuths make the dishes face each other. Node A's tilt is negated to compensate for its group rotation.

**Signal beams:** extracted from each dish element's world matrix, shot along the concave (−Z local → world-transformed) direction, colored by `rxToColor()`.

**Key method:** `updateFromPlayerData(data)` — called every poll. In player mode it updates `myAntenna` and repositions `otherAntenna` in the direction of the current azimuth. In GM mode it updates both nodes' rotations and the signal beams.

---

## Common Patterns

### Adding a new constant
Edit `app/constants.py` only. Import from there everywhere else.

### Adding a new endpoint
1. Add function to the appropriate router in `app/routers/`
2. No need to register anywhere — routers are already included in `main.py`

### Changing the RF model
Edit only `app/services/rf_calculations.py`. Constants in `constants.py`. No other file needs touching.

### Adding a new player control
1. Add field to `PlayerSetBody` in `models/requests.py`
2. Handle it in `update_player_controls()` in `services/session_manager.py`
3. Add to `NodeState` in `models/session.py`
4. Surface in `simple_player_view` response in `routers/player.py`
5. Wire up in `player.js`

---

## Coding Conventions

- All Python: standard library + fastapi + pydantic only (no ORM, no celery, etc.)
- Validation is done in `session_manager.py` via `validate_*` helpers that raise `HTTPException`
- Pydantic models are in `models/requests.py`; session state is plain Python classes (not Pydantic)
- JS: no imports, no bundler — plain `<script>` tags in HTML. Class/global style.
- CSS uses CSS custom properties (`--space-*`, `--color-*`, etc.) defined at `:root` in `styles.css`
- Version bust: static JS files use `?v=7` query string in HTML `<script src>` tags. Increment when making JS changes.

---

## Running Locally

```bash
# From repo root, with venv activated:
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Or on Windows:
.\run.bat
```

No `.env` file needed — there are no secrets or external services.

---

## Things to Be Careful About

- **No auth on player endpoints** — anyone with a session ID can set controls for either team. Don't expose to the open internet without adding auth.
- **Debug endpoints** (`/debug/*`) are unprotected — they're gated by a `check_debug_access()` stub. Enable the env var guard in `debug.py` before any production deployment.
- **Session ID guessing** — IDs are only 8 hex chars (4 billion combinations). Fine for LAN training, not for production.
- **In-memory only** — all data is lost on restart. This is intentional for simplicity.
- **Three.js from CDN** — `antenna3d.js` requires `THREE` and `THREE.OrbitControls` to be loaded first (they are, via `<script>` order in HTML). If CDN is unavailable, 3D visualization won't work.
- **`main_original_backup.py`** — legacy backup file in `app/`. Not imported anywhere. Can be deleted when no longer needed as reference.
