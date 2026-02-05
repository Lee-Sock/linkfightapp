// Three.js 3D Antenna Visualization

class Antenna3DVisualization {
  constructor(containerId, mode = 'player', myNode = 'A') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('Container not found:', containerId);
      return;
    }

    this.mode = mode;  // 'player' or 'gm'
    this.myNode = myNode;  // 'A' or 'B'
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.antennaA = null;
    this.antennaB = null;
    this.myAntenna = null;  // Player's own antenna in player mode
    this.otherAntenna = null;  // Other player's antenna in player mode

    // Current state
    this.currentAzimuth = 0;
    this.currentTilt = 0;
    this.currentMast = 1;

    this.init();
  }

  init() {
    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    const aspect = this.container.clientWidth / this.container.clientHeight;

    if (this.mode === 'player') {
      // Third-person view - camera behind and above antenna
      this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
      // Position camera behind the antenna (positive Z), looking at it
      this.camera.position.set(0, 8, 15);
      this.camera.lookAt(0, 5, 0);

      // Sky gradient background
      this.scene.background = this.createSkyGradient();

      // Create third-person environment with antenna
      this.createThirdPersonEnvironment();
    } else {
      // GM mode - overhead/isometric view to see both antennas
      this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
      this.camera.position.set(0, 20, 40);
      this.camera.lookAt(0, 5, 0);
      this.scene.background = new THREE.Color(0x1a1a1a);

      // Create GM environment with both antennas
      this.createGMEnvironment();
    }

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaf0, 0.8);
    sunLight.position.set(50, 100, 50);
    this.scene.add(sunLight);

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Start animation loop
    this.animate();
  }

  createSkyGradient() {
    // Create a gradient texture for sky
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#1a2a4a');      // Dark blue at top
    gradient.addColorStop(0.3, '#3a5a8a');    // Medium blue
    gradient.addColorStop(0.5, '#6a8aba');    // Light blue at horizon
    gradient.addColorStop(0.6, '#8aaacc');    // Very light near horizon
    gradient.addColorStop(0.65, '#aabbcc');   // Horizon
    gradient.addColorStop(0.7, '#3a4a3a');    // Ground starts
    gradient.addColorStop(1, '#2a3a2a');      // Dark ground

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  createThirdPersonEnvironment() {
    // Large ground plane
    const groundGeometry = new THREE.PlaneGeometry(500, 500);
    const groundMaterial = new THREE.MeshLambertMaterial({
      color: 0x3a5a3a,
      side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);

    // Grid overlay
    const gridHelper = new THREE.GridHelper(500, 100, 0x556655, 0x445544);
    gridHelper.position.y = 0.1;
    this.scene.add(gridHelper);

    // Create compass rose on ground
    this.createCompassRose();

    // Create horizon markers with tick labels
    this.createHorizonMarkers();

    // Create the player's antenna (at origin)
    const myColor = this.myNode === 'A' ? 0x4488ff : 0xff8844;
    const myLabel = this.myNode === 'A' ? 'NODE 1 (YOU)' : 'NODE 2 (YOU)';
    this.myAntenna = this.createAntennaModel(myColor, { x: 0, y: 0, z: 0 }, myLabel);
    this.scene.add(this.myAntenna);

    // Create the other player's antenna at FIXED position (north, -Z direction)
    // This represents the target the player is trying to aim at
    const otherColor = this.myNode === 'A' ? 0xff8844 : 0x4488ff;
    const otherLabel = this.myNode === 'A' ? 'NODE 2 (TARGET)' : 'NODE 1 (TARGET)';
    this.otherAntenna = this.createAntennaModel(otherColor, { x: 0, y: 0, z: -40 }, otherLabel);
    this.scene.add(this.otherAntenna);
  }

  createCompassRose() {
    const radius = 30;
    const y = 0.2;

    // Cardinal directions with colors
    const directions = [
      { label: 'N', angle: 0, color: 0xff4444, ticks: 0 },
      { label: 'E', angle: Math.PI / 2, color: 0xaaaaaa, ticks: 1800 },
      { label: 'S', angle: Math.PI, color: 0xaaaaaa, ticks: 3600 },
      { label: 'W', angle: 3 * Math.PI / 2, color: 0xaaaaaa, ticks: 5400 }
    ];

    directions.forEach(dir => {
      const x = Math.sin(dir.angle) * radius;
      const z = -Math.cos(dir.angle) * radius;

      // Create direction line
      const lineGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array([0, y, 0, x, y, z]);
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({
        color: dir.label === 'N' ? 0xff4444 : 0x666666,
        linewidth: 2
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      this.scene.add(line);

      // Create label sprite
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 128;

      ctx.fillStyle = dir.label === 'N' ? '#ff4444' : '#aaaaaa';
      ctx.font = 'Bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dir.label, 128, 50);

      // Add tick number below
      ctx.fillStyle = '#888888';
      ctx.font = '32px Arial';
      ctx.fillText(dir.ticks.toString(), 128, 100);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(x * 1.15, y + 3, z * 1.15);
      sprite.scale.set(8, 4, 1);
      this.scene.add(sprite);
    });
  }

  createHorizonMarkers() {
    const horizonDistance = 80;

    // Create degree markers every 30 degrees (600 ticks)
    for (let ticks = 0; ticks < 7200; ticks += 600) {
      // Skip cardinal directions (already marked)
      if (ticks === 0 || ticks === 1800 || ticks === 3600 || ticks === 5400) continue;

      const rad = (ticks / 7200) * Math.PI * 2;
      const x = Math.sin(rad) * horizonDistance;
      const z = -Math.cos(rad) * horizonDistance;

      // Vertical pole marker
      const poleGeometry = new THREE.CylinderGeometry(0.2, 0.2, 10, 8);
      const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x555555 });
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.set(x, 5, z);
      this.scene.add(pole);

      // Tick label
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 128;
      canvas.height = 64;
      ctx.fillStyle = '#777777';
      ctx.font = '28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(ticks.toString(), 64, 40);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(x, 12, z);
      sprite.scale.set(6, 3, 1);
      this.scene.add(sprite);
    }
  }

  updateOtherAntennaPosition(azimuthTicks, tiltDeg, mastSections) {
    if (!this.otherAntenna) return;

    // Keep other antenna at FIXED position - don't move it around
    // Only update its orientation (azimuth, tilt, mast)
    this.updateAntenna(this.otherAntenna, azimuthTicks, tiltDeg, mastSections);
  }

  updateCameraForThirdPerson(mastSections) {
    if (this.mode !== 'player') return;

    // Calculate camera height and distance based on mast sections
    // Camera needs to see the full antenna at all heights
    const mastHeight = 2.0 + (mastSections - 1) * 1.67;
    const antennaTopHeight = 2 + mastHeight + 2; // base + mast + dish

    // Camera positioned to always see full antenna
    // Move camera back and up as mast gets taller
    const cameraDistance = 18 + mastHeight * 0.5;
    const cameraHeight = 4 + mastHeight * 0.7;

    // Camera positioned behind (positive Z), looking at antenna center
    this.camera.position.set(0, cameraHeight, cameraDistance);
    this.camera.lookAt(0, 2 + mastHeight * 0.5, 0);
  }

  // This method is called from player.js - renamed for clarity
  updateCameraForFirstPerson(azimuthTicks, tiltDeg, mastSections) {
    if (this.mode !== 'player') return;

    this.currentAzimuth = azimuthTicks;
    this.currentTilt = tiltDeg;
    this.currentMast = mastSections;

    // Update the antenna model rotation and mast height
    this.updateAntenna(this.myAntenna, azimuthTicks, tiltDeg, mastSections);

    // Update camera height (only up/down, no rotation)
    this.updateCameraForThirdPerson(mastSections);
  }

  createGMEnvironment() {
    // Add ground plane with grid
    const gridHelper = new THREE.GridHelper(80, 40, 0x444444, 0x222222);
    this.scene.add(gridHelper);

    // Create both antennas - positioned to face each other
    // A is on left (-X), B is on right (+X)
    // When aligned, A should face +X (toward B), B should face -X (toward A)
    this.antennaA = this.createAntennaModel(0x4488ff, { x: -15, y: 0, z: 0 }, 'Node A');
    this.antennaB = this.createAntennaModel(0xff8844, { x: 15, y: 0, z: 0 }, 'Node B');
    this.scene.add(this.antennaA);
    this.scene.add(this.antennaB);
  }

  updateGMCamera(maxMastSections) {
    if (this.mode !== 'gm') return;

    // Calculate camera distance based on tallest mast
    const mastHeight = 2.0 + (maxMastSections - 1) * 1.67;
    const antennaTop = 2 + mastHeight + 2;

    // Camera needs to see both antennas (at x=-15 and x=+15) plus the beams
    // Adjust height and distance based on mast height
    const cameraHeight = Math.max(15, 10 + mastHeight * 0.8);
    const cameraDistance = Math.max(35, 25 + mastHeight * 1.2);

    this.camera.position.set(0, cameraHeight, cameraDistance);
    this.camera.lookAt(0, mastHeight / 2 + 2, 0);
  }

  createAntennaModel(color, position, label) {
    const group = new THREE.Group();

    // Base (vehicle): 2x2x2 gray box
    const baseGeometry = new THREE.BoxGeometry(2, 2, 2);
    const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 1;
    group.add(base);

    // Mast: thin cylinder
    const mastGeometry = new THREE.CylinderGeometry(0.15, 0.15, 1, 8);
    const mastMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const mast = new THREE.Mesh(mastGeometry, mastMaterial);
    mast.position.y = 3;
    mast.name = 'mast';
    group.add(mast);

    // Antenna element group (dish + direction cone + beam)
    const antennaElement = new THREE.Group();
    antennaElement.name = 'element';

    // Dish (circle facing outward) - BLACK so direction is clear
    const dishGeometry = new THREE.CircleGeometry(1.2, 32);
    const dishMaterial = new THREE.MeshLambertMaterial({ color: 0x111111, side: THREE.DoubleSide });
    const dish = new THREE.Mesh(dishGeometry, dishMaterial);
    antennaElement.add(dish);

    // Colored ring around dish edge for visibility
    const ringGeometry = new THREE.RingGeometry(1.0, 1.2, 32);
    const ringMaterial = new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.z = 0.01;
    antennaElement.add(ring);

    // Direction cone (points where antenna is aimed) - COLORED
    const coneGeometry = new THREE.ConeGeometry(0.4, 1.5, 16);
    const coneMaterial = new THREE.MeshLambertMaterial({ color: color });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = Math.PI / 2;
    cone.position.z = -0.8;
    antennaElement.add(cone);

    // DIRECTION BEAM - long visible ray showing where antenna points
    // This is visible from any angle
    const beamLength = 15;
    const beamGeometry = new THREE.CylinderGeometry(0.08, 0.15, beamLength, 8);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.7
    });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.rotation.x = Math.PI / 2;  // Point along Z axis
    beam.position.z = -beamLength / 2 - 1.5;  // Position in front of dish
    antennaElement.add(beam);

    // Beam tip arrow
    const tipGeometry = new THREE.ConeGeometry(0.3, 0.8, 8);
    const tipMaterial = new THREE.MeshBasicMaterial({ color: color });
    const tip = new THREE.Mesh(tipGeometry, tipMaterial);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -beamLength - 1.5 - 0.4;
    antennaElement.add(tip);

    antennaElement.position.y = 4;
    group.add(antennaElement);

    // Text label (above antenna)
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    context.fillStyle = color === 0x4488ff ? '#4488ff' : '#ff8844';
    context.font = 'Bold 28px Arial';
    context.textAlign = 'center';
    context.fillText(label, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.y = 12;
    sprite.scale.set(5, 1.25, 1);
    sprite.name = 'label';
    group.add(sprite);

    group.position.set(position.x, position.y, position.z);
    return group;
  }

  updateAntenna(antennaGroup, azimuthTicks, tiltDeg, mastSections) {
    if (!antennaGroup) return;

    const azimuthRad = (azimuthTicks / 7200) * Math.PI * 2;
    const tiltRad = (tiltDeg * Math.PI) / 180;

    const mastHeight = 2.0 + (mastSections - 1) * 1.67;
    const mast = antennaGroup.getObjectByName('mast');
    if (mast) {
      mast.scale.y = mastHeight;
      mast.position.y = 2 + mastHeight / 2;
    }

    const element = antennaGroup.getObjectByName('element');
    if (element) {
      element.position.y = 2 + mastHeight;
      element.rotation.y = azimuthRad;
      element.rotation.x = tiltRad;
    }

    // Update label position to follow mast height
    const labelSprite = antennaGroup.getObjectByName('label');
    if (labelSprite) {
      labelSprite.position.y = 4 + mastHeight;
    }
  }

  updateFromPlayerData(data) {
    if (!data) return;

    if (this.mode === 'player') {
      // Update player's own antenna model (rotation and mast height)
      this.updateAntenna(this.myAntenna, data.myAz, data.myTilt, data.myMast);

      // Update camera height only
      this.updateCameraForThirdPerson(data.myMast);

      // Update other player's antenna orientation (position is fixed)
      if (data.otherAz !== undefined) {
        this.updateOtherAntennaPosition(data.otherAz, data.otherTilt, data.otherMast);
      }
    } else {
      // GM mode: update both antennas
      // data.myAz and data.otherAz are already adjusted in gm.js to be visual azimuths
      // that make antennas face each other when players are aligned
      this.updateAntenna(this.antennaA, data.myAz, data.myTilt, data.myMast);
      this.updateAntenna(this.antennaB, data.otherAz, data.otherTilt, data.otherMast);

      // Update camera to accommodate mast heights
      const maxMast = Math.max(data.myMast || 1, data.otherMast || 1);
      this.updateGMCamera(maxMast);
    }
  }

  onWindowResize() {
    if (!this.container || !this.camera || !this.renderer) return;

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
