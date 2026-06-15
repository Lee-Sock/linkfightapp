// Gamemaster UI JavaScript

const E = id => document.getElementById(id);

function cls(rx) {
  if (rx >= -94) return 'success';
  if (rx >= -105) return 'warning';
  return 'error';
}

let viz3d = null;

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

// --- Node 1 → Node 2 auto-logic ---

function parsePairIp(ipStr) {
  const parts = ipStr.trim().split('.');
  if (parts.length !== 4) return null;
  let last = parseInt(parts[3], 10);
  if (Number.isNaN(last)) return null;
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

function syncNode2FromNode1() {
  const aTx = Number(E('A_tx').value);
  const aRx = Number(E('A_rx').value);
  if (!Number.isNaN(aTx)) E('B_rx').value = aTx.toFixed(3);
  if (!Number.isNaN(aRx)) E('B_tx').value = aRx.toFixed(3);

  const info = parsePairIp(E('A_ip').value);
  if (info) {
    E('B_ip').value = info.ip2;
    E('A_cid').value = String(info.last2);
    E('B_cid').value = String(info.last1);
  }

  
  const aAz = Number(E('A_az').value);
  const bAz = Number(E('B_az').value);

}

['A_tx', 'A_rx', 'A_ip', 'A_az'].forEach(id => {
  const el = E(id);
  if (el) el.addEventListener('input', syncNode2FromNode1);
});

syncNode2FromNode1();

// --- Create + Poll ---

async function create() {
  const aAz = E('A_az').value.trim();
  const bAz = E('B_az').value.trim();
  
  //if (aAz) {
  //  const aAzNum = Number(aAz);
  //  if (!Number.isNaN(aAzNum) && aAzNum >= 0 && aAzNum <= 7200) {
  //    bAz = String((aAzNum + 3600) % 7200);
  //  }
  //}
  
  const body = {
    A_tx_MHz: Number(E('A_tx').value), A_rx_MHz: Number(E('A_rx').value),
    A_local_ip: E('A_ip').value, A_call_id: E('A_cid').value,
    B_tx_MHz: Number(E('B_tx').value), B_rx_MHz: Number(E('B_rx').value),
    B_local_ip: E('B_ip').value, B_call_id: E('B_cid').value,
    A_elev_asl_m: Number(E('A_elev').value), B_elev_asl_m: Number(E('B_elev').value),
    A_azimuth_ticks: aAz ? Number(aAz) : null,
    B_azimuth_ticks: bAz ? Number(bAz) : null,
    distance_km: Number(E('distance').value) || 5.0
  };
  
  const r = await fetch('/simple/gm/create', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify(body) 
  });
  
  if (!r.ok) { 
    const errorData = await r.json();
    const errorDetails = errorData.detail[0].msg;
    showToast('Failed to create session' + errorDetails , 'error');
    return; 
  }
  
  const j = await r.json(); 
  const sid = j.id;
  
  // Show session info
  const sessionInfo = E('sessionInfo');
  const sidRow = E('sidRow');
  const links = E('links');
  
  sessionInfo.classList.remove('hidden');
  sidRow.textContent = sid;
  
  const a = `/player?sid=${sid}&team=A`; 
  const b = `/player?sid=${sid}&team=B`;
  
  links.innerHTML = `
    <a href="${a}" target="_blank" class="session-link">
      <span class="badge badge-success" style="min-width: 60px;">Node A</span>
      <span style="flex: 1; font-family: var(--font-mono); font-size: 0.875rem;">${a}</span>
      <i data-lucide="external-link" class="session-link-icon" style="width: 16px; height: 16px;"></i>
    </a>
    <a href="${b}" target="_blank" class="session-link">
      <span class="badge badge-warning" style="min-width: 60px;">Node B</span>
      <span style="flex: 1; font-family: var(--font-mono); font-size: 0.875rem;">${b}</span>
      <i data-lucide="external-link" class="session-link-icon" style="width: 16px; height: 16px;"></i>
    </a>
  `;
  
  lucide.createIcons();
  showToast('Session created successfully!');
  window.history.replaceState(null, '', '/gm?sid=' + sid);
}

async function update() {
  const aAz = E('A_az').value.trim();
  const bAz = E('B_az').value.trim();
  
  //if (aAz) {
  //  const aAzNum = Number(aAz);
  //  if (!Number.isNaN(aAzNum) && aAzNum >= 0 && aAzNum <= 7200) {
  //    bAz = String((aAzNum + 3600) % 7200);
  //  }
  //}
  
  const body = {
    A_tx_MHz: Number(E('A_tx').value), A_rx_MHz: Number(E('A_rx').value),
    A_local_ip: E('A_ip').value, A_call_id: E('A_cid').value,
    B_tx_MHz: Number(E('B_tx').value), B_rx_MHz: Number(E('B_rx').value),
    B_local_ip: E('B_ip').value, B_call_id: E('B_cid').value,
    A_elev_asl_m: Number(E('A_elev').value), B_elev_asl_m: Number(E('B_elev').value),
    A_azimuth_ticks: aAz ? Number(aAz) : null,
    B_azimuth_ticks: bAz ? Number(bAz) : null,
    distance_km: Number(E('distance').value) || 5.0
  };
  const url2 = new URL(window.location.href);
  const sid2 = url2.searchParams.get('sid');
  console.log('/simple/gm/' + sid2 + '/update')
  const r = await fetch('/simple/gm/' + sid2 + '/update', { 
    method: 'PUT', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify(body), 
  });
  
  if (!r.ok) { 
    const errorData = await r.json();
    const errorDetails = errorData.detail[0].msg;
    showToast('Failed to update session' + errorDetails , 'error');
    return; 
  }
  
  // Show session info
  const sessionInfo = E('sessionInfo');
  const sidRow = E('sidRow');
  const links = E('links');
  
  sessionInfo.classList.remove('hidden');
  sidRow.textContent = sid2;
  
  const a = `/player?sid=${sid2}&team=A`; 
  const b = `/player?sid=${sid2}&team=B`;
  
  links.innerHTML = `
    <a href="${a}" target="_blank" class="session-link">
      <span class="badge badge-success" style="min-width: 60px;">Node A</span>
      <span style="flex: 1; font-family: var(--font-mono); font-size: 0.875rem;">${a}</span>
      <i data-lucide="external-link" class="session-link-icon" style="width: 16px; height: 16px;"></i>
    </a>
    <a href="${b}" target="_blank" class="session-link">
      <span class="badge badge-warning" style="min-width: 60px;">Node B</span>
      <span style="flex: 1; font-family: var(--font-mono); font-size: 0.875rem;">${b}</span>
      <i data-lucide="external-link" class="session-link-icon" style="width: 16px; height: 16px;"></i>
    </a>
  `;
  
  lucide.createIcons();
  showToast('Session updated successfully!');
  window.history.replaceState(null, '', '/gm?sid=' + sid2);
}

async function poll() {
  while (true) {
    await new Promise(r => setTimeout(r, 900));
    const url = new URL(window.location.href);
    const sid = (E('sidRow').textContent.match(/Session:\s+(\w+)/) || [])[1] || url.searchParams.get('sid') || '';
    if (!sid) continue;
    
    const r = await fetch('/simple/' + sid + '/gm_view'); 
    if (!r.ok) continue;
    
    const j = await r.json();
    E('sidRow').textContent = j.id;
    
    // Update live telemetry with new card layout
    const live = E('live');
    if (j.A && j.B) {
      live.innerHTML = `
        <div style="margin-bottom: var(--space-3);">
          <div style="font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: 1px; font-size: 0.75rem; color: #4488ff; margin-bottom: var(--space-2);">ALPHA (Node A)</div>
          <div class="live-telemetry">
            <div class="telemetry-card">
              <div class="telemetry-label">RX Level</div>
              <div class="telemetry-value ${cls(j.A.rx_level_dBm)}">${j.A.rx_level_dBm} dBm</div>
            </div>
            <div class="telemetry-card">
              <div class="telemetry-label">Mast</div>
              <div class="telemetry-value">${j.A.mast_sections}</div>
            </div>
            <div class="telemetry-card">
              <div class="telemetry-label">Azimuth</div>
              <div class="telemetry-value">${j.A.az_ticks}</div>
            </div>
            <div class="telemetry-card">
              <div class="telemetry-label">Tilt</div>
              <div class="telemetry-value">${j.A.tilt_deg}°</div>
            </div>
          </div>
        </div>
        <div style="margin-bottom: var(--space-3);">
          <div style="font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: 1px; font-size: 0.75rem; color: #ff8844; margin-bottom: var(--space-2);">BRAVO (Node B)</div>
          <div class="live-telemetry">
            <div class="telemetry-card">
              <div class="telemetry-label">RX Level</div>
              <div class="telemetry-value ${cls(j.B.rx_level_dBm)}">${j.B.rx_level_dBm} dBm</div>
            </div>
            <div class="telemetry-card">
              <div class="telemetry-label">Mast</div>
              <div class="telemetry-value">${j.B.mast_sections}</div>
            </div>
            <div class="telemetry-card">
              <div class="telemetry-label">Azimuth</div>
              <div class="telemetry-value">${j.B.az_ticks}</div>
            </div>
            <div class="telemetry-card">
              <div class="telemetry-label">Tilt</div>
              <div class="telemetry-value">${j.B.tilt_deg}°</div>
            </div>
          </div>
        </div>
        <div style="padding: var(--space-3); background: #0d1117; border: 1px solid #30363d; border-radius: var(--radius-md); font-size: 0.8rem; font-family: 'Courier New', monospace;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div>
              <strong style="color: #4488ff;">ALPHA DETAILS</strong><br/>
              <span style="color: #8b949e;">TX: ${j.A.tx} MHz | RX: ${j.A.rx} MHz</span><br/>
              <span style="color: #8b949e;">IP: ${j.A.ip} | Call: ${j.A.call_id}</span><br/>
              <span style="color: #3fb950;">Ideal: Az ${j.A.ideal_azimuth_ticks} (${j.A.ideal_azimuth_deg}°) | Tilt ${j.A.ideal_tilt_deg}°</span><br/>
              <span style="color: #8b949e;">Elev: ${j.A.antenna_elevation_m}m</span>
            </div>
            <div>
              <strong style="color: #ff8844;">BRAVO DETAILS</strong><br/>
              <span style="color: #8b949e;">TX: ${j.B.tx} MHz | RX: ${j.B.rx} MHz</span><br/>
              <span style="color: #8b949e;">IP: ${j.B.ip} | Call: ${j.B.call_id}</span><br/>
              <span style="color: #3fb950;">Ideal: Az ${j.B.ideal_azimuth_ticks} (${j.B.ideal_azimuth_deg}°) | Tilt ${j.B.ideal_tilt_deg}°</span><br/>
              <span style="color: #8b949e;">Elev: ${j.B.antenna_elevation_m}m</span>
            </div>
          </div>
          <div style="margin-top: var(--space-3); text-align: center; color: #6aaa6a; font-weight: 600;">
            DISTANCE: ${j.distance_km} km
          </div>
        </div>
      `;
    }

    // Initialize 3D visualization on first poll with data
    if (!viz3d && j.A && j.B) {
      console.log('Initializing GM 3D visualization...');
      try {
        if (typeof THREE === 'undefined') {
          console.error('THREE.js not loaded!');
          continue;
        }
        if (typeof Antenna3DVisualization === 'undefined') {
          console.error('Antenna3DVisualization class not loaded!');
          continue;
        }
        viz3d = new Antenna3DVisualization('antenna3d-container', 'gm', 'A');
        console.log('GM 3D visualization initialized successfully');
      } catch (error) {
        console.error('Error initializing GM 3D visualization:', error);
      }
    }

    // Update 3D visualization
    if (viz3d && j.A && j.B) {
      try {
        viz3d.updateFromPlayerData({
          myNode: 'A',
          myAz: j.A.az_ticks,
          myTilt: j.A.tilt_deg,
          myMast: j.A.mast_sections,
          otherAz: j.B.az_ticks,
          otherTilt: j.B.tilt_deg,
          otherMast: j.B.mast_sections,
          myElevation: j.A.site_elevation_m,
          otherElevation: j.B.site_elevation_m,
          myRx: j.A.rx_level_dBm,
          otherRx: j.B.rx_level_dBm,
          distance_km: j.distance_km,
          idealAzA: j.A.ideal_azimuth_ticks,
          idealAzB: j.B.ideal_azimuth_ticks
        });
      } catch (error) {
        console.error('Error updating GM 3D visualization:', error);
      }
    }
  }
}

E('create').onclick = create;
E('update').onclick = update;
poll();
