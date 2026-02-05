// Gamemaster UI JavaScript

const E = id => document.getElementById(id);
// RX level is now 80-108 dB (lower = better)
function cls(rx) {
  if (rx <= 86) return 'ok';       // Excellent (80-86 dB)
  if (rx <= 93) return 'warn';     // Acceptable (87-93 dB)
  return 'bad';                     // Poor (94-108 dB)
}

let viz3d = null;

// --- Node 1 → Node 2 auto-logic ---

function parsePairIp(ipStr) {
  const parts = ipStr.trim().split('.');
  if (parts.length !== 4) return null;
  let last = parseInt(parts[3], 10);
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

function syncNode2FromNode1() {
  // TX/RX cross-link
  const aTx = Number(E('A_tx').value);
  const aRx = Number(E('A_rx').value);
  if (!Number.isNaN(aTx)) E('B_rx').value = aTx.toFixed(3);
  if (!Number.isNaN(aRx)) E('B_tx').value = aRx.toFixed(3);

  // IP pairing + Call IDs (each node uses the other node's last octet)
  const info = parsePairIp(E('A_ip').value);
  if (info) {
    E('B_ip').value = info.ip2;
    // Node 1 Call ID = Node 2 last octet, Node 2 Call ID = Node 1 last octet
    E('A_cid').value = String(info.last2);
    E('B_cid').value = String(info.last1);
  }

  // Azimuth: Node 2 is 180° (3600 ticks) apart from Node 1
  const aAz = Number(E('A_az').value);
  if (!Number.isNaN(aAz) && aAz >= 0 && aAz <= 7200) {
    // Calculate 180° apart (3600 ticks), wrapping around 7200
    const bAz = (aAz + 3600) % 7200;
    E('B_az').value = Math.round(bAz);
  } else {
    E('B_az').value = '';
  }
}

['A_tx', 'A_rx', 'A_ip', 'A_az'].forEach(id => {
  const el = E(id);
  if (el) el.addEventListener('input', syncNode2FromNode1);
});

// initialise Node 2 once on load
syncNode2FromNode1();

// --- Create + Poll ---

async function create() {
  const aAz = E('A_az').value.trim();
  // Node 2 azimuth is always calculated from Node 1 (180° apart)
  let bAz = '';
  if (aAz) {
    const aAzNum = Number(aAz);
    if (!Number.isNaN(aAzNum) && aAzNum >= 0 && aAzNum <= 7200) {
      bAz = String((aAzNum + 3600) % 7200);
    }
  }
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
  const r = await fetch('/simple/gm/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { alert('Create failed: ' + r.status); return; }
  const j = await r.json(); const sid = j.id;
  E('sidRow').textContent = 'Session: ' + sid;
  const a = `/player?sid=${sid}&team=A`; const b = `/player?sid=${sid}&team=B`;
  E('links').innerHTML = `A: <a href="${a}" target="_blank">${a}</a><br/>B: <a href="${b}" target="_blank">${b}</a>`;
  window.history.replaceState(null, '', '/gm?sid=' + sid);
}

async function poll() {
  while (true) {
    await new Promise(r => setTimeout(r, 900));
    const url = new URL(window.location.href);
    const sid = (E('sidRow').textContent.match(/Session:\s+(\w+)/) || [])[1] || url.searchParams.get('sid') || '';
    if (!sid) continue;
    const r = await fetch('/simple/' + sid + '/gm_view'); if (!r.ok) continue;
    const j = await r.json();
    E('sidRow').textContent = 'Session: ' + j.id;
    E('live').innerHTML = `
      <pre>
Node 1: RX <span class="${cls(j.A.rx_level_dBm)}">${j.A.rx_level_dBm.toFixed(1)} dB</span> | mast ${j.A.mast_sections} | az ${j.A.az_ticks} | tilt ${j.A.tilt_deg}° | Antenna Elev: ${j.A.antenna_elevation_m}m
        TX ${j.A.tx} MHz | RX ${j.A.rx} MHz | IP ${j.A.ip} | Call ${j.A.call_id}
        Ideal: az ${j.A.ideal_azimuth_ticks} (${j.A.ideal_azimuth_deg}°) | tilt ${j.A.ideal_tilt_deg}°
Node 2: RX <span class="${cls(j.B.rx_level_dBm)}">${j.B.rx_level_dBm.toFixed(1)} dB</span> | mast ${j.B.mast_sections} | az ${j.B.az_ticks} | tilt ${j.B.tilt_deg}° | Antenna Elev: ${j.B.antenna_elevation_m}m
        TX ${j.B.tx} MHz | RX ${j.B.rx} MHz | IP ${j.B.ip} | Call ${j.B.call_id}
        Ideal: az ${j.B.ideal_azimuth_ticks} (${j.B.ideal_azimuth_deg}°) | tilt ${j.B.ideal_tilt_deg}°
Distance: ${j.distance_km} km
      </pre>`;

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
        // Initialize in GM mode
        viz3d = new Antenna3DVisualization('antenna3d-container', 'gm', 'A');
        console.log('GM 3D visualization initialized successfully');
      } catch (error) {
        console.error('Error initializing GM 3D visualization:', error);
      }
    }

    // Update 3D visualization
    // For GM view, we need to adjust azimuths so antennas face each other when aligned
    // In the 3D scene: A is at x=-10, B is at x=+10
    // For A to face B: visual azimuth should be 1800 ticks (90°, facing +X)
    // For B to face A: visual azimuth should be 5400 ticks (270°, facing -X)
    // Map player's actual azimuth relative to their ideal azimuth to the visual direction
    if (viz3d && j.A && j.B) {
      try {
        // Calculate visual azimuths:
        // When actual_az == ideal_az, antenna should face the other node
        // visual_az = target_direction + (actual_az - ideal_az)
        const idealAzA = j.A.ideal_azimuth_ticks || 0;
        const idealAzB = j.B.ideal_azimuth_ticks || 0;

        // A faces +X (1800 ticks) when aligned, B faces -X (5400 ticks) when aligned
        let visualAzA = 1800 + (j.A.az_ticks - idealAzA);
        let visualAzB = 5400 + (j.B.az_ticks - idealAzB);

        // Normalize to 0-7200 range
        visualAzA = ((visualAzA % 7200) + 7200) % 7200;
        visualAzB = ((visualAzB % 7200) + 7200) % 7200;

        viz3d.updateFromPlayerData({
          myNode: 'A',  // Arbitrary, GM sees both
          myAz: visualAzA,
          myTilt: j.A.tilt_deg,
          myMast: j.A.mast_sections,
          otherAz: visualAzB,
          otherTilt: j.B.tilt_deg,
          otherMast: j.B.mast_sections
        });
      } catch (error) {
        console.error('Error updating GM 3D visualization:', error);
      }
    }
  }
}

E('create').onclick = create;
poll();
