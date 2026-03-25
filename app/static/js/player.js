// Player UI JavaScript - Unified Responsive Version

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

// Detect mobile layout - align with CSS breakpoint
const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

function pct(rx) {
  const lo = -120, hi = -80;
  return Math.max(0, Math.min(100, (rx - lo) / (hi - lo) * 100));
}

function getQualityBadge(rx) {
  if (rx >= -90) return { text: 'Excellent', class: 'badge-success' };
  if (rx >= -94) return { text: 'Good', class: 'badge-success' };
  if (rx >= -98) return { text: 'Fair', class: 'badge-warning' };
  if (rx >= -105) return { text: 'Poor', class: 'badge-warning' };
  return { text: 'Critical', class: 'badge-error' };
}

function fmtBrief(b) {
  return `Node: ${b.node} | Local IP: ${b.local_ip} | TX: ${b.tx_MHz} MHz | RX: ${b.rx_MHz} MHz | `
    + `Distant end: ${b.distant_end} | Site elev: ${b.site_elevation_m} m | Azimuth sector: ${b.azimuth_sector_deg}°`;
}

// Toast notification helper
function showToast(message, type = 'success') {
  const container = E('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? 'check-circle' : 
               type === 'error' ? 'x-circle' : 
               type === 'warning' ? 'alert-triangle' : 'info';
  
  toast.innerHTML = `
    <i data-lucide="${icon}" style="width: 20px; height: 20px;"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Update display values - now only one set of controls
function updateDisplays() {
  E('az_input').value = currentAz;
  E('az_display').textContent = currentAz + ' ticks';
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

// Debounce timer for auto-apply
let applyTimeout = null;

function debounceApply() {
  if (applyTimeout) clearTimeout(applyTimeout);
  applyTimeout = setTimeout(() => {
    console.log('[DEBUG] debounceApply: calling apply()');
    apply();
  }, 150);
}

// Control value adjusters with clamping (for keyboard and buttons)
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

// Setup unified controls - attach handlers once
function setupControls() {
  console.log('[DEBUG] setupControls: attaching event handlers');
  
  // Azimuth buttons - use event delegation
  document.querySelectorAll('.btn-azimuth-adjust').forEach(btn => {
    btn.onclick = () => {
      const delta = parseInt(btn.dataset.delta, 10);
      console.log('[DEBUG] Azimuth button clicked, delta:', delta);
      adjustAz(delta);
    };
  });
  
  // Azimuth input
  const azInput = E('az_input');
  if (azInput) {
    azInput.onchange = () => {
      currentAz = Math.max(0, Math.min(7200, parseInt(azInput.value) || 0));
      hasUnappliedChanges = true;
      updateDisplays();
      updateVisualization();
      debounceApply();
    };
  }
  
  // Mast slider
  const mastSlider = E('mast_slider');
  if (mastSlider) {
    mastSlider.oninput = () => {
      currentMast = parseInt(mastSlider.value, 10);
      E('mast_display').textContent = currentMast;
      hasUnappliedChanges = true;
      updateVisualization();
    };
    mastSlider.onchange = () => {
      console.log('[DEBUG] Mast slider changed, calling apply()');
      apply();
    };
  }

  // Tilt slider
  const tiltSlider = E('tilt_slider');
  if (tiltSlider) {
    tiltSlider.oninput = () => {
      currentTilt = parseInt(tiltSlider.value, 10);
      E('tilt_display').textContent = currentTilt + '°';
      hasUnappliedChanges = true;
      updateVisualization();
    };
    tiltSlider.onchange = () => {
      console.log('[DEBUG] Tilt slider changed, calling apply()');
      apply();
    };
  }
}

// Handle window resize - no need to switch layouts now
function handleResize() {
  console.log('[DEBUG] handleResize called, isMobile:', isMobile());
  
  // Just ensure 3D visualization adjusts to container size
  if (viz3d && viz3d.onWindowResize) {
    viz3d.onWindowResize();
  }
  
  updateDisplays();
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
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

console.log('Player.js: Script loaded, initializing...');

readQueryDefaults();

// Setup controls once
window.addEventListener('resize', handleResize);

try {
  setupControls();
  console.log('Player.js: Controls initialized');
} catch (err) {
  console.error('Player.js: Error setting up controls:', err);
}

async function join() {
  console.log('[DEBUG] Join function called');
  const sid = E('sid').value.trim();
  const team = E('team').value;
  currentTeam = team;
  console.log('[DEBUG] Join - sid:', sid, 'team:', team);
  if (!sid) {
    console.log('[DEBUG] Join - no sid, returning');
    return;
  }

  const r = await fetch(`/simple/${sid}/player_view?team=${team}`);
  console.log('[DEBUG] Join - fetch status:', r.status);
  if (!r.ok) {
    console.log('[DEBUG] Join - fetch failed');
    E('joinStatus').innerHTML = '<span class="badge badge-error">Failed to join session</span>';
    return;
  }

  const j = await r.json();
  console.log('[DEBUG] Join - response JSON:', j);
  
  if (j.brief) {
    console.log('[DEBUG] Join - setting brief');
    E('brief').textContent = fmtBrief(j.brief);
  }
  
  // Initialize current values from server if available
  if (j.my_current) {
    console.log('[DEBUG] Join - initializing from server state:', j.my_current);
    currentAz = j.my_current.azimuth_ticks || 0;
    currentTilt = j.my_current.tilt_deg || 0;
    currentMast = j.my_current.mast_sections || 1;
  } else {
    console.log('[DEBUG] Join - no my_current, using defaults');
    currentAz = 0;
    currentTilt = 0;
    currentMast = 1;
  }
  updateDisplays();

  console.log('[DEBUG] Join - calling apply()');
  await apply();

  console.log('[DEBUG] Join - successful, updating status');
  E('joinStatus').innerHTML = `<span class="badge badge-success"><i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> Joined as ${team === 'A' ? 'Node 1' : 'Node 2'}</span>`;
  lucide.createIcons();
  showToast(`Joined as ${team === 'A' ? 'Node 1' : 'Node 2'}!`);

  // Initialize 3D visualization - now only one container
  if (!viz3d) {
    console.log('[DEBUG] Join - Initializing 3D visualization...');
    try {
      if (typeof THREE === 'undefined') {
        console.error('[DEBUG] THREE.js not loaded!');
        return;
      }
      if (typeof Antenna3DVisualization === 'undefined') {
        console.error('[DEBUG] Antenna3DVisualization class not loaded!');
        return;
      }
      
      viz3d = new Antenna3DVisualization('antenna3d-container', 'player', team);
      console.log('[DEBUG] 3D visualization initialized successfully');

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
      console.error('[DEBUG] Error initializing 3D visualization:', error);
    }
  }
}

async function apply() {
  const sid = E('sid').value.trim();
  const team = E('team').value;
  if (!sid) return;

  const payload = { azimuth_ticks: currentAz, tilt_deg: currentTilt, mast_sections: currentMast };
  console.log('[DEBUG] apply() - sending payload to server:', payload, 'sid:', sid, 'team:', team);

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

    console.log('[DEBUG] apply() - response status:', response.status);
    if (response.ok) {
      hasUnappliedChanges = false;
      lastAppliedAz = currentAz;
      lastAppliedTilt = currentTilt;
      lastAppliedMast = currentMast;
      console.log('[DEBUG] apply() - update successful');
    } else {
      try {
        const text = await response.text();
        console.error('[DEBUG] apply() - server error response:', text);
      } catch (e) {
        console.error('[DEBUG] apply() - server error, could not read body');
      }
    }
  } catch (error) {
    console.error('Error applying changes:', error);
  }
}

async function poll() {
  console.log('[DEBUG] Poll function started');
  while (true) {
    await new Promise(r => setTimeout(r, 900));
    const sid = E('sid').value.trim();
    const team = E('team').value;
    if (!sid) {
      continue;
    }

    try {
      const r = await fetch(`/simple/${sid}/player_view?team=${team}`);
      if (!r.ok) {
        continue;
      }

      const j = await r.json();

      if (j.brief) {
        E('brief').textContent = fmtBrief(j.brief);
      }

      if (j.telemetry) {
        const rx = j.telemetry.rx_level_dBm;
        
        const rxEl = E('rx');
        const fillEl = E('fill');
        const qualityEl = E('rxQuality');
        
        if (rxEl) {
          rxEl.textContent = `${rx.toFixed(1)} dBm`;
        }
        if (fillEl) {
          const pctValue = pct(rx);
          fillEl.style.width = pctValue.toFixed(0) + '%';
        }
        
        const quality = getQualityBadge(rx);
        if (qualityEl) {
          qualityEl.textContent = quality.text;
          qualityEl.className = `badge ${quality.class}`;
        }
      }

      if (j.my_current) {
        lastAppliedAz = j.my_current.azimuth_ticks;
        lastAppliedTilt = j.my_current.tilt_deg;
        lastAppliedMast = j.my_current.mast_sections;
      }

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
