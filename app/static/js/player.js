// Player UI JavaScript

const E = id => document.getElementById(id);

let viz3d = null;
let currentTeam = '';

// Current control values
let currentAz = 0;
let currentTilt = 0;
let currentMast = 1;

// Track if user has made changes that haven't been applied yet
let hasUnappliedChanges = false;
let lastAppliedAz = 0;
let lastAppliedTilt = 0;
let lastAppliedMast = 1;

// RX level is now 80-108 dB (lower = better)
// 80 = perfect alignment, 108 = worst
function pct(rx) {
  const best = 80, worst = 108;
  // Invert percentage: 80 dB = 100%, 108 dB = 0%
  return Math.max(0, Math.min(100, (worst - rx) / (worst - best) * 100));
}

function color(rx) {
  // Lower RX dB = better signal
  if (rx <= 86) return 'green';       // Excellent (80-86 dB)
  if (rx <= 93) return 'orange';      // Acceptable (87-93 dB)
  return 'red';                        // Poor (94-108 dB)
}

function fmtBrief(b) {
  return `Node: ${b.node} | Local IP: ${b.local_ip} | TX: ${b.tx_MHz} MHz | RX: ${b.rx_MHz} MHz | `
    + `Distant end: ${b.distant_end} | Site elev: ${b.site_elevation_m} m | Azimuth sector: ${b.azimuth_sector_deg}`;
}

// Debounce timer for auto-apply
let applyTimeout = null;

// Update display values and sync sliders
function updateDisplays() {
  E('az_slider').value = currentAz;
  E('az_input').value = currentAz;
  E('mast_slider').value = currentMast;
  E('mast_display').textContent = currentMast;
  E('tilt_slider').value = currentTilt;
  E('tilt_display').textContent = currentTilt + '°';
}

// Update 3D visualization locally
function updateVisualization() {
  if (viz3d && viz3d.updateCameraForFirstPerson) {
    viz3d.updateCameraForFirstPerson(currentAz, currentTilt, currentMast);
  }
}

// Debounced apply function for smooth sliding
function debounceApply() {
  if (applyTimeout) clearTimeout(applyTimeout);
  applyTimeout = setTimeout(() => {
    apply();
  }, 150);
}

// Control value adjusters with clamping (for keyboard)
function adjustAz(delta) {
  currentAz = Math.max(0, Math.min(7200, currentAz + delta));
  hasUnappliedChanges = true;
  updateDisplays();
  updateVisualization();
  debounceApply();
}

function adjustTilt(delta) {
  currentTilt = Math.max(-15, Math.min(15, currentTilt + delta));
  hasUnappliedChanges = true;
  updateDisplays();
  updateVisualization();
  debounceApply();
}

function adjustMast(delta) {
  currentMast = Math.max(1, Math.min(9, currentMast + delta));
  hasUnappliedChanges = true;
  updateDisplays();
  updateVisualization();
  debounceApply();
}

// Slider control handlers
function setupControls() {
  // Azimuth slider - auto-apply with debounce
  E('az_slider').oninput = () => {
    currentAz = parseInt(E('az_slider').value);
    E('az_input').value = currentAz;
    hasUnappliedChanges = true;
    updateVisualization();
    debounceApply();
  };

  // Azimuth numeric input
  E('az_input').onchange = () => {
    currentAz = Math.max(0, Math.min(7200, parseInt(E('az_input').value) || 0));
    E('az_slider').value = currentAz;
    hasUnappliedChanges = true;
    updateVisualization();
    debounceApply();
  };

  // Mast slider
  E('mast_slider').oninput = () => {
    currentMast = parseInt(E('mast_slider').value);
    E('mast_display').textContent = currentMast;
    hasUnappliedChanges = true;
    updateVisualization();
  };
  E('mast_slider').onchange = () => {
    apply();  // Apply on release
  };

  // Tilt slider
  E('tilt_slider').oninput = () => {
    currentTilt = parseInt(E('tilt_slider').value);
    E('tilt_display').textContent = currentTilt + '°';
    hasUnappliedChanges = true;
    updateVisualization();
  };
  E('tilt_slider').onchange = () => {
    apply();  // Apply on release
  };
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
  // Only handle if not typing in an input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  switch(e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      adjustAz(-10);
      break;
    case 'ArrowRight':
      e.preventDefault();
      adjustAz(10);
      break;
    case 'ArrowUp':
      e.preventDefault();
      adjustTilt(1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      adjustTilt(-1);
      break;
    case 'PageUp':
      e.preventDefault();
      adjustMast(1);
      break;
    case 'PageDown':
      e.preventDefault();
      adjustMast(-1);
      break;
  }
});

function readQueryDefaults() {
  try {
    const url = new URL(window.location.href);
    const sid = url.searchParams.get('sid') || '';
    const team = (url.searchParams.get('team') || 'A').toUpperCase();
    console.log('Player.js: Reading URL defaults - sid:', sid, 'team:', team);
    if (sid) {
      const sidInput = E('sid');
      if (sidInput) {
        sidInput.value = sid;
        console.log('Player.js: Session ID set to:', sid);
      }
    }
    if (team === 'A' || team === 'B') {
      const teamSelect = E('team');
      if (teamSelect) {
        teamSelect.value = team;
        console.log('Player.js: Team set to:', team);
      }
    }
  } catch (err) {
    console.error('Player.js: Error in readQueryDefaults:', err);
  }
}

// Initialize everything when script loads
console.log('Player.js: Script loaded, initializing...');

// Read URL params FIRST
readQueryDefaults();

// Then setup controls
try {
  setupControls();
  console.log('Player.js: Controls initialized');
} catch (err) {
  console.error('Player.js: Error setting up controls:', err);
}

async function join() {
  const sid = E('sid').value.trim();
  const team = E('team').value;
  currentTeam = team;
  if (!sid) return;

  const r = await fetch(`/simple/${sid}/player_view?team=${team}`);
  if (!r.ok) {
    E('joinStatus').textContent = 'Failed to join';
    E('joinStatus').className = 'kv';
    return;
  }

  const j = await r.json();
  if (j.brief) E('brief').textContent = fmtBrief(j.brief);
  // Don't load server values - start fresh at az=0, tilt=0, mast=1
  // Player will aim their antenna from scratch
  currentAz = 0;
  currentTilt = 0;
  currentMast = 1;
  updateDisplays();

  // Apply initial values to server
  await apply();

  // Show joined status
  console.log('Join successful, showing status');
  E('joinStatus').textContent = '✓ Joined as ' + (team === 'A' ? 'Node 1' : 'Node 2');
  E('joinStatus').className = 'kv status-joined';

  // Initialize 3D visualization
  if (!viz3d) {
    console.log('Initializing 3D visualization...');
    try {
      if (typeof THREE === 'undefined') {
        console.error('THREE.js not loaded!');
        return;
      }
      if (typeof Antenna3DVisualization === 'undefined') {
        console.error('Antenna3DVisualization class not loaded!');
        return;
      }
      // Initialize in player mode with current team
      viz3d = new Antenna3DVisualization('antenna3d-container', 'player', team);
      console.log('3D visualization initialized successfully');

      // Initial update with both antenna states
      if (j.my_current && j.other_current) {
        viz3d.updateFromPlayerData({
          myNode: team,
          myAz: j.my_current.azimuth_ticks,
          myTilt: j.my_current.tilt_deg,
          myMast: j.my_current.mast_sections,
          otherAz: j.other_current.azimuth_ticks,
          otherTilt: j.other_current.tilt_deg,
          otherMast: j.other_current.mast_sections
        });
      }
    } catch (error) {
      console.error('Error initializing 3D visualization:', error);
    }
  }
}

async function apply() {
  const sid = E('sid').value.trim();
  const team = E('team').value;
  if (!sid) return;

  try {
    const response = await fetch(`/simple/${sid}/team/${team}/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        azimuth_ticks: currentAz,
        tilt_deg: currentTilt,
        mast_sections: currentMast
      })
    });

    if (response.ok) {
      // Mark as applied
      hasUnappliedChanges = false;
      lastAppliedAz = currentAz;
      lastAppliedTilt = currentTilt;
      lastAppliedMast = currentMast;
    }
  } catch (error) {
    console.error('Error applying changes:', error);
  }
}

async function poll() {
  while (true) {
    await new Promise(r => setTimeout(r, 900));
    const sid = E('sid').value.trim();
    const team = E('team').value;
    if (!sid) continue;

    try {
      const r = await fetch(`/simple/${sid}/player_view?team=${team}`);
      if (!r.ok) continue;

      const j = await r.json();

      // Update brief
      if (j.brief) E('brief').textContent = fmtBrief(j.brief);

      // Update telemetry
      if (j.telemetry) {
        const rx = j.telemetry.rx_level_dBm;
        const rxColor = color(rx);
        E('rx').textContent = `RX: ${rx.toFixed(1)} dB`;
        E('rx').style.color = rxColor === 'green' ? '#0a0' : rxColor === 'orange' ? '#cc0' : '#c00';
        E('fill').style.width = pct(rx).toFixed(0) + '%';
      }

      // Don't overwrite local controls from server - player controls their own antenna
      // Just track what was last applied for comparison
      if (j.my_current) {
        lastAppliedAz = j.my_current.azimuth_ticks;
        lastAppliedTilt = j.my_current.tilt_deg;
        lastAppliedMast = j.my_current.mast_sections;
      }

      // Update 3D visualization
      if (viz3d && j.my_current && j.other_current) {
        try {
          viz3d.updateFromPlayerData({
            myNode: team,
            myAz: j.my_current.azimuth_ticks,
            myTilt: j.my_current.tilt_deg,
            myMast: j.my_current.mast_sections,
            otherAz: j.other_current.azimuth_ticks,
            otherTilt: j.other_current.tilt_deg,
            otherMast: j.other_current.mast_sections
          });
        } catch (error) {
          console.error('Error updating 3D visualization:', error);
        }
      }
    } catch (error) {
      console.error('Poll error:', error);
    }
  }
}

let polling = false;

// Set up join button handler
try {
  const joinBtn = E('join');
  if (joinBtn) {
    joinBtn.onclick = async () => {
      console.log('Player.js: Join button clicked');
      await join();
      if (!polling) {
        polling = true;
        poll();
      }
    };
    console.log('Player.js: Join button handler set up');
  } else {
    console.error('Player.js: Join button not found!');
  }
} catch (err) {
  console.error('Player.js: Error setting up join button:', err);
}

console.log('Player.js: Initialization complete');
