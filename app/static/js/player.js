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

// Detect mobile layout
const isMobile = () => window.innerWidth < 768;

function pct(rx) {
  const lo = -120, hi = -70;
  return Math.max(0, Math.min(100, (rx - lo) / (hi - lo) * 100));
}

function getQualityBadge(rx) {
  if (rx >= -80) return { text: 'Excellent', class: 'badge-success' };
  if (rx >= -90) return { text: 'Good', class: 'badge-success' };
  if (rx >= -95) return { text: 'Fair', class: 'badge-warning' };
  if (rx >= -103) return { text: 'Poor', class: 'badge-warning' };
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

// Update display values and sync controls
function updateDisplays() {
  const mobile = isMobile();
  
  if (mobile) {
    // Mobile controls
    E('az_input_mobile').value = currentAz;
    E('az_display_mobile').textContent = currentAz + ' ticks';
    E('mast_slider_mobile').value = currentMast;
    E('mast_display_mobile').textContent = currentMast;
    E('tilt_slider_mobile').value = currentTilt;
    E('tilt_display_mobile').textContent = currentTilt + '°';
  } else {
    // Desktop controls
    E('az_input_desktop').value = currentAz;
    E('az_display_desktop').textContent = currentAz + ' ticks';
    E('mast_slider_desktop').value = currentMast;
    E('mast_display_desktop').textContent = currentMast;
    E('tilt_slider_desktop').value = currentTilt;
    E('tilt_display_desktop').textContent = currentTilt + '°';
  }
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

// Setup azimuth button handlers
function setupAzimuthButtons() {
  // Mobile azimuth buttons
  document.querySelectorAll('#mobileControls .btn-azimuth-adjust').forEach(btn => {
    btn.onclick = () => {
      const delta = parseInt(btn.dataset.delta);
      adjustAz(delta);
    };
  });
  
  // Desktop azimuth buttons
  document.querySelectorAll('#desktopControls .btn-azimuth-adjust').forEach(btn => {
    btn.onclick = () => {
      const delta = parseInt(btn.dataset.delta);
      adjustAz(delta);
    };
  });
  
  // Mobile azimuth input
  E('az_input_mobile').onchange = () => {
    currentAz = Math.max(0, Math.min(7200, parseInt(E('az_input_mobile').value) || 0));
    hasUnappliedChanges = true;
    updateDisplays();
    updateVisualization();
    debounceApply();
  };
  
  // Desktop azimuth input
  E('az_input_desktop').onchange = () => {
    currentAz = Math.max(0, Math.min(7200, parseInt(E('az_input_desktop').value) || 0));
    hasUnappliedChanges = true;
    updateDisplays();
    updateVisualization();
    debounceApply();
  };
}

// Setup controls based on current layout
function setupControls() {
  const mobile = isMobile();
  
  // Setup azimuth buttons (both mobile and desktop)
  setupAzimuthButtons();
  
  if (mobile) {
    // Mobile mast slider
    E('mast_slider_mobile').oninput = () => {
      currentMast = parseInt(E('mast_slider_mobile').value);
      hasUnappliedChanges = true;
      updateVisualization();
    };
    E('mast_slider_mobile').onchange = () => apply();

    // Mobile tilt slider
    E('tilt_slider_mobile').oninput = () => {
      currentTilt = parseInt(E('tilt_slider_mobile').value);
      E('tilt_display_mobile').textContent = currentTilt + '°';
      hasUnappliedChanges = true;
      updateVisualization();
    };
    E('tilt_slider_mobile').onchange = () => apply();
  } else {
    // Desktop mast slider
    E('mast_slider_desktop').oninput = () => {
      currentMast = parseInt(E('mast_slider_desktop').value);
      hasUnappliedChanges = true;
      updateVisualization();
    };
    E('mast_slider_desktop').onchange = () => apply();

    // Desktop tilt slider
    E('tilt_slider_desktop').oninput = () => {
      currentTilt = parseInt(E('tilt_slider_desktop').value);
      E('tilt_display_desktop').textContent = currentTilt + '°';
      hasUnappliedChanges = true;
      updateVisualization();
    };
    E('tilt_slider_desktop').onchange = () => apply();
  }
}

// Handle window resize to switch layouts
function handleResize() {
  const mobile = isMobile();
  const mobileControls = E('mobileControls');
  const desktopControls = E('desktopControls');
  
  if (mobile) {
    mobileControls.classList.remove('hidden');
    desktopControls.classList.add('hidden');
    // Re-init viz container if needed
    if (viz3d) {
      viz3d.container = E('antenna3d-container');
    }
  } else {
    mobileControls.classList.add('hidden');
    desktopControls.classList.remove('hidden');
    // Re-init viz container if needed
    if (viz3d) {
      viz3d.container = E('antenna3d-container-desktop');
    }
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

// Setup initial layout
handleResize();
window.addEventListener('resize', handleResize);

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
    E('joinStatus').innerHTML = '<span class="badge badge-error">Failed to join session</span>';
    return;
  }

  const j = await r.json();
  if (j.brief) E('brief').textContent = fmtBrief(j.brief);
  
  currentAz = 0;
  currentTilt = 0;
  currentMast = 1;
  updateDisplays();

  await apply();

  console.log('Join successful, showing status');
  E('joinStatus').innerHTML = `<span class="badge badge-success"><i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> Joined as ${team === 'A' ? 'Node 1' : 'Node 2'}</span>`;
  lucide.createIcons();
  showToast(`Joined as ${team === 'A' ? 'Node 1' : 'Node 2'}!`);

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
      
      const containerId = isMobile() ? 'antenna3d-container' : 'antenna3d-container-desktop';
      viz3d = new Antenna3DVisualization(containerId, 'player', team);
      console.log('3D visualization initialized successfully');

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

      if (j.brief) E('brief').textContent = fmtBrief(j.brief);

      if (j.telemetry) {
        const rx = j.telemetry.rx_level_dBm;
        E('rx').textContent = `${rx.toFixed(1)} dBm`;
        E('fill').style.width = pct(rx).toFixed(0) + '%';
        
        const quality = getQualityBadge(rx);
        E('rxQuality').textContent = quality.text;
        E('rxQuality').className = `badge ${quality.class}`;
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
