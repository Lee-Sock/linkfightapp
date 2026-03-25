// Three.js 3D Antenna Visualization

class Antenna3DVisualization {
  constructor(containerId, mode = 'player', myNode = 'A') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('Container not found:', containerId);
      throw new Error('Container not found: ' + containerId);
    }

    this.mode = mode;
    this.myNode = myNode;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.antennaA = null;
    this.antennaB = null;
    this.myAntenna = null;
    this.otherAntenna = null;
    this.animationId = null;
    this.isVisible = true;
    
    // Shared geometries for performance
    this.sharedGeometries = {};

    // Current state
    this.currentAzimuth = 0;
    this.currentTilt = 0;
    this.currentMast = 1;

    // GM mode: terrain mounds and signal beams
    this.terrainA = null;
    this.terrainB = null;
    this.beamA = null;
    this.beamB = null;
    this.gmLayoutInitialized = false;

    this.init();
  }

  init() {
    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    const aspect = this.container.clientWidth / this.container.clientHeight;

    if (this.mode === 'player') {
      this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
      this.camera.position.set(0, 8, 15);
      this.camera.lookAt(0, 5, 0);

      // Daytime sky background
      this.scene.background = this.createDaytimeSky();
      this.createThirdPersonEnvironment();
    } else {
      this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
      this.camera.position.set(20, 20, 35);
      this.camera.lookAt(0, 5, 0);
      this.scene.background = this.createMilitarySky();
      this.createGMEnvironment();
    }

    // Create renderer with performance optimizations
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: false,  // Disable for performance
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));  // Limit pixel ratio
    this.container.appendChild(this.renderer.domElement);

    // Orbit controls — click and drag to rotate camera
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.target.set(0, 5, 0);
    }

    // Lighting — dimmer for GM military theme
    if (this.mode === 'gm') {
      const ambientLight = new THREE.AmbientLight(0xccddee, 0.4);
      this.scene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(0xaabbcc, 0.6);
      dirLight.position.set(30, 80, 40);
      this.scene.add(dirLight);
    } else {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      this.scene.add(ambientLight);
      const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
      sunLight.position.set(50, 100, 50);
      this.scene.add(sunLight);
    }

    // Handle window resize
    this.resizeHandler = () => this.onWindowResize();
    window.addEventListener('resize', this.resizeHandler);

    // Handle visibility change for performance
    this.visibilityHandler = () => this.handleVisibilityChange();
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // Start animation loop
    this.animate();
  }

  setContainer(containerId) {
    const newContainer = document.getElementById(containerId);
    if (!newContainer) {
      console.error('New container not found:', containerId);
      return;
    }

    if (this.container !== newContainer) {
      this.container = newContainer;
      if (this.renderer && this.renderer.domElement) {
        this.container.appendChild(this.renderer.domElement);
        // Force resize update
        this.onWindowResize();
      }
    }
  }

  createDaytimeSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#4A90E2');      // Bright blue at top
    gradient.addColorStop(0.4, '#87CEEB');    // Sky blue
    gradient.addColorStop(0.6, '#B0E0E6');    // Powder blue at horizon
    gradient.addColorStop(0.65, '#E0F6FF');   // Light horizon
    gradient.addColorStop(0.7, '#90EE90');    // Light green ground
    gradient.addColorStop(1, '#7CFC00');      // Lawn green

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  getSharedGeometry(type, ...params) {
    const key = type + '_' + params.join('_');
    if (!this.sharedGeometries[key]) {
      switch(type) {
        case 'box':
          this.sharedGeometries[key] = new THREE.BoxGeometry(...params);
          break;
        case 'cylinder':
          this.sharedGeometries[key] = new THREE.CylinderGeometry(...params);
          break;
        case 'circle':
          this.sharedGeometries[key] = new THREE.CircleGeometry(...params);
          break;
        case 'ring':
          this.sharedGeometries[key] = new THREE.RingGeometry(...params);
          break;
        case 'cone':
          this.sharedGeometries[key] = new THREE.ConeGeometry(...params);
          break;
      }
    }
    return this.sharedGeometries[key];
  }

  createThirdPersonEnvironment() {
    // Smaller ground plane for better performance (100x100 instead of 500x500)
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({
      color: 0x90EE90,  // Light green
      side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);

    // Lighter grid overlay (20 divisions instead of 100)
    const gridHelper = new THREE.GridHelper(100, 20, 0x888888, 0xaaaaaa);
    gridHelper.position.y = 0.1;
    this.scene.add(gridHelper);

    // Create compass rose
    this.createCompassRose();

    // Create horizon markers (fewer for performance)
    this.createHorizonMarkers();

    // Create antennas
    const myColor = this.myNode === 'A' ? 0x4488ff : 0xff8844;
    const myLabel = this.myNode === 'A' ? 'NODE 1 (YOU)' : 'NODE 2 (YOU)';
    this.myAntenna = this.createAntennaModel(myColor, { x: 0, y: 0, z: 0 }, myLabel);
    this.scene.add(this.myAntenna);

    const otherColor = this.myNode === 'A' ? 0xff8844 : 0x4488ff;
    const otherLabel = this.myNode === 'A' ? 'NODE 2 (TARGET)' : 'NODE 1 (TARGET)';
    this.otherAntenna = this.createAntennaModel(otherColor, { x: 0, y: 0, z: -40 }, otherLabel);
    this.scene.add(this.otherAntenna);
  }

  createCompassRose() {
    const radius = 25;
    const y = 0.2;

    const directions = [
      { label: 'N', angle: 0, color: 0xff6b6b, z: 0 },
      { label: 'E', angle: Math.PI / 2, color: 0x888888, z: 1800 },
      { label: 'S', angle: Math.PI, color: 0x888888, z: 3600 },
      { label: 'W', angle: 3 * Math.PI / 2, color: 0x888888, z: 5400 }
    ];

    directions.forEach(dir => {
      const x = Math.sin(dir.angle) * radius;
      const z = -Math.cos(dir.angle) * radius;

      // Direction line
      const lineGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array([0, y, 0, x, y, z]);
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({
        color: dir.label === 'N' ? 0xff6b6b : 0x666666
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      this.scene.add(line);

      // Simple label (just letter, no ticks)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 128;
      canvas.height = 64;

      ctx.fillStyle = dir.label === 'N' ? '#ff6b6b' : '#666666';
      ctx.font = 'Bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dir.label, 64, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(x * 1.2, y + 2, z * 1.2);
      sprite.scale.set(4, 2, 1);
      this.scene.add(sprite);
    });
  }

  createHorizonMarkers() {
    const horizonDistance = 60;

    // Markers every 1200 ticks (60 degrees) instead of 600 for cleaner look
    for (let ticks = 0; ticks < 7200; ticks += 1200) {
      if (ticks === 0 || ticks === 1800 || ticks === 3600 || ticks === 5400) continue;

      const rad = (ticks / 7200) * Math.PI * 2;
      const x = Math.sin(rad) * horizonDistance;
      const z = -Math.cos(rad) * horizonDistance;

      // Small pole marker
      const poleGeometry = this.getSharedGeometry('cylinder', 0.15, 0.15, 6, 6);
      const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.set(x, 3, z);
      this.scene.add(pole);

      // Simple tick label
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 64;
      canvas.height = 32;
      ctx.fillStyle = '#666666';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(ticks.toString(), 32, 22);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(x, 7, z);
      sprite.scale.set(3, 1.5, 1);
      this.scene.add(sprite);
    }
  }

  updateOtherAntennaPosition(azimuthTicks, tiltDeg, mastSections) {
    if (!this.otherAntenna) return;

    // Position other antenna in the direction you're aiming
    // Convert azimuth to radians (0=North, 1800=East, 3600=South, 5400=West)
    const azimuthRad = (azimuthTicks / 7200) * Math.PI * 2;
    const distance = 40;

    // Calculate position: x=East-West, z=North-South (negative Z is North in Three.js)
    const x = Math.sin(azimuthRad) * distance;      // East (+) / West (-)
    const z = -Math.cos(azimuthRad) * distance;     // North (-) / South (+)

    this.otherAntenna.position.set(x, 0, z);

    // Update orientation (the dish should face the same direction you're aiming)
    this.updateAntenna(this.otherAntenna, azimuthTicks, tiltDeg, mastSections);
  }

  updateCameraForThirdPerson(mastSections) {
    if (this.mode !== 'player') return;

    const mastHeight = 2.0 + (mastSections - 1) * 1.67;
    const cameraDistance = 15 + mastHeight * 0.3;
    const cameraHeight = 6 + mastHeight * 0.5;

    this.camera.position.set(0, cameraHeight, cameraDistance);
    this.camera.lookAt(0, 2 + mastHeight * 0.5, 0);
  }

  updateCameraForFirstPerson(azimuthTicks, tiltDeg, mastSections) {
    if (this.mode !== 'player') return;

    this.currentAzimuth = azimuthTicks;
    this.currentTilt = tiltDeg;
    this.currentMast = mastSections;

    this.updateAntenna(this.myAntenna, azimuthTicks, tiltDeg, mastSections);
    this.updateCameraForThirdPerson(mastSections);
  }

  createMilitarySky() {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#0a0e14');
    gradient.addColorStop(0.3, '#111b21');
    gradient.addColorStop(0.5, '#1a2a1a');
    gradient.addColorStop(0.65, '#1e2e1e');
    gradient.addColorStop(0.7, '#2a3a2a');
    gradient.addColorStop(1, '#1a2618');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
    return new THREE.CanvasTexture(canvas);
  }

  createGMEnvironment() {
    // Dark military ground
    const groundGeometry = new THREE.PlaneGeometry(120, 120);
    const groundMaterial = new THREE.MeshLambertMaterial({
      color: 0x2a3a2a,
      side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // Tactical grid — dark green lines
    const gridHelper = new THREE.GridHelper(120, 24, 0x3a5a3a, 0x2a4a2a);
    gridHelper.position.y = 0.05;
    this.scene.add(gridHelper);

    // Create both antennas — positioned along Z-axis, will be updated dynamically
    this.antennaA = this.createAntennaModel(0x4488ff, { x: 0, y: 0, z: 15 }, 'ALPHA');
    this.antennaB = this.createAntennaModel(0xff8844, { x: 0, y: 0, z: -15 }, 'BRAVO');
    this.scene.add(this.antennaA);
    this.scene.add(this.antennaB);

    // Create terrain mounds (initially flat, updated with elevation data)
    this.terrainA = this.createTerrainMound(0x3d4f3d);
    this.terrainA.position.set(0, 0, 15);
    this.scene.add(this.terrainA);

    this.terrainB = this.createTerrainMound(0x3d4f3d);
    this.terrainB.position.set(0, 0, -15);
    this.scene.add(this.terrainB);

    // Distance label (updated dynamically)
    this.distanceLabel = this.createTextSprite('--', '#6aaa6a');
    this.distanceLabel.position.set(0, 1, 0);
    this.distanceLabel.scale.set(6, 1.5, 1);
    this.scene.add(this.distanceLabel);
  }

  createTerrainMound(color) {
    const group = new THREE.Group();
    // Cone-shaped hill
    const moundGeometry = new THREE.ConeGeometry(4, 1, 12);
    const moundMaterial = new THREE.MeshLambertMaterial({ color: color });
    const mound = new THREE.Mesh(moundGeometry, moundMaterial);
    mound.position.y = 0.5;
    mound.name = 'mound';
    group.add(mound);
    return group;
  }

  createTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    ctx.fillStyle = color;
    ctx.font = 'Bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 40);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.name = 'textSprite';
    return sprite;
  }

  rxToColor(rx) {
    if (rx >= -90) return new THREE.Color(0x00ff44);      // Excellent — bright green
    if (rx >= -94) return new THREE.Color(0x88cc00);      // Good — yellow-green
    if (rx >= -98) return new THREE.Color(0xddaa00);      // Fair — amber
    if (rx >= -105) return new THREE.Color(0xff4400);     // Poor — orange-red
    return new THREE.Color(0x880000);                      // Critical — dark red
  }

  updateGMLayout(data) {
    if (!this.antennaA || !this.antennaB) return;

    const elevA = data.myElevation || 10;
    const elevB = data.otherElevation || 10;
    const distKm = data.distance_km || 5;

    // Scale: 1 unit = ~0.5m elevation, separation scaled by distance
    const elevScale = 0.15;
    const separation = Math.min(40, Math.max(15, distKm * 4));
    const yA = elevA * elevScale;
    const yB = elevB * elevScale;

    // Position antennas along Z-axis
    this.antennaA.position.set(0, yA, separation / 2);
    this.antennaB.position.set(0, yB, -separation / 2);

    // Update terrain mounds
    if (this.terrainA) {
      this.terrainA.position.set(0, 0, separation / 2);
      const moundA = this.terrainA.getObjectByName('mound');
      if (moundA) {
        moundA.scale.y = Math.max(1, yA);
        moundA.position.y = (Math.max(1, yA)) / 2;
      }
    }
    if (this.terrainB) {
      this.terrainB.position.set(0, 0, -separation / 2);
      const moundB = this.terrainB.getObjectByName('mound');
      if (moundB) {
        moundB.scale.y = Math.max(1, yB);
        moundB.position.y = (Math.max(1, yB)) / 2;
      }
    }

    // Update distance label
    if (this.distanceLabel) {
      this.distanceLabel.position.set(0, Math.max(yA, yB) + 3, 0);
      // Recreate label text
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 64;
      ctx.fillStyle = '#6aaa6a';
      ctx.font = 'Bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(distKm.toFixed(1) + ' km', 128, 40);
      this.distanceLabel.material.map = new THREE.CanvasTexture(canvas);
      this.distanceLabel.material.map.needsUpdate = true;
    }

    // Update orbit controls target to center between antennas
    if (this.controls) {
      const cy = (yA + yB) / 2 + 3;
      this.controls.target.set(0, cy, 0);
    }
  }

  updateSignalBeams(data) {
    const rxA = data.myRx || -120;
    const rxB = data.otherRx || -120;
    const distKm = data.distance_km || 5;
    const separation = Math.min(40, Math.max(15, distKm * 4));
    const beamLength = separation * 1.2;

    // Get actual dish facing direction from the scene graph (guaranteed to match visual)
    const dirA = this._getDishForward(this.antennaA);
    const dirB = this._getDishForward(this.antennaB);
    const startA = this._getDishOrigin(this.antennaA);
    const startB = this._getDishOrigin(this.antennaB);

    if (dirA && startA) {
      const endA = startA.clone().add(dirA.clone().multiplyScalar(beamLength));
      this._updateBeamLine('beamA', startA, endA, this.rxToColor(rxA));
    }

    if (dirB && startB) {
      const endB = startB.clone().add(dirB.clone().multiplyScalar(beamLength));
      this._updateBeamLine('beamB', startB, endB, this.rxToColor(rxB));
    }
  }

  _getDishForward(antennaGroup) {
    if (!antennaGroup) return null;
    const element = antennaGroup.getObjectByName('element');
    if (!element) return null;
    element.updateWorldMatrix(true, false);
    const quat = element.getWorldQuaternion(new THREE.Quaternion());
    // Local +Z is the direction the concave dish opening faces (feed horn side)
    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(quat);
    return forward.normalize();
  }

  _getDishOrigin(antennaGroup) {
    if (!antennaGroup) return null;
    const element = antennaGroup.getObjectByName('element');
    if (!element) return null;
    element.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    element.getWorldPosition(pos);
    // Offset to feed horn position (0.8 units forward from element center)
    const forward = this._getDishForward(antennaGroup);
    if (forward) {
      pos.add(forward.multiplyScalar(0.8));
    }
    return pos;
  }

  _updateBeamLine(propName, start, end, color) {
    if (this[propName]) {
      // Update existing beam
      const positions = this[propName].geometry.attributes.position.array;
      positions[0] = start.x; positions[1] = start.y; positions[2] = start.z;
      positions[3] = end.x;   positions[4] = end.y;   positions[5] = end.z;
      this[propName].geometry.attributes.position.needsUpdate = true;
      this[propName].material.color.copy(color);
    } else {
      // Create new beam
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array([
        start.x, start.y, start.z,
        end.x, end.y, end.z
      ]);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: color,
        linewidth: 2
      });
      this[propName] = new THREE.Line(geometry, material);
      this.scene.add(this[propName]);
    }
  }

  createAntennaModel(color, position, label) {
    const group = new THREE.Group();

    // Base (vehicle)
    const baseGeometry = this.getSharedGeometry('box', 2, 2, 2);
    const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 1;
    group.add(base);

    // Mast
    const mastGeometry = this.getSharedGeometry('cylinder', 0.15, 0.15, 1, 6);
    const mastMaterial = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    const mast = new THREE.Mesh(mastGeometry, mastMaterial);
    mast.position.y = 3;
    mast.name = 'mast';
    group.add(mast);

    // Antenna element group — parabolic grid dish
    const antennaElement = new THREE.Group();
    antennaElement.name = 'element';

    // Build parabolic dish wireframe grid
    const dishRadius = 1.2;
    const focalLength = 0.8;
    const radialSegs = 12;
    const ringSegs = 6;
    const gridPositions = [];

    // Generate grid vertices on paraboloid: z = -(r² / (4*f))
    // Dish opens toward +Z (forward), concave side faces +Z
    const ringPoints = []; // [ring][seg] = Vector3
    for (let i = 0; i <= ringSegs; i++) {
      const r = (i / ringSegs) * dishRadius;
      const z = -(r * r) / (4 * focalLength);
      const pts = [];
      for (let j = 0; j <= radialSegs; j++) {
        const angle = (j / radialSegs) * Math.PI * 2;
        pts.push(new THREE.Vector3(
          Math.cos(angle) * r,
          Math.sin(angle) * r,
          z
        ));
      }
      ringPoints.push(pts);
    }

    // Concentric ring lines
    for (let i = 1; i <= ringSegs; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = ringPoints[i][j];
        const b = ringPoints[i][j + 1];
        gridPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }

    // Radial spoke lines
    for (let j = 0; j < radialSegs; j++) {
      for (let i = 0; i < ringSegs; i++) {
        const a = ringPoints[i][j];
        const b = ringPoints[i + 1][j];
        gridPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }

    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
    const gridMaterial = new THREE.LineBasicMaterial({ color: color });
    const gridMesh = new THREE.LineSegments(gridGeometry, gridMaterial);
    antennaElement.add(gridMesh);

    // Dish rim ring (solid for visibility)
    const rimGeometry = new THREE.RingGeometry(dishRadius - 0.05, dishRadius + 0.05, radialSegs);
    const rimMaterial = new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    const rimZ = -(dishRadius * dishRadius) / (4 * focalLength);
    rim.position.z = rimZ;
    antennaElement.add(rim);

    // Feed horn at focal point
    const hornGeometry = new THREE.CylinderGeometry(0.1, 0.15, 0.3, 8);
    const hornMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const horn = new THREE.Mesh(hornGeometry, hornMaterial);
    horn.rotation.x = Math.PI / 2; // Align along Z axis
    horn.position.z = focalLength;
    antennaElement.add(horn);

    // Support struts from dish rim to feed horn
    const strutPositions = [];
    const numStruts = 4;
    for (let i = 0; i < numStruts; i++) {
      const angle = (i / numStruts) * Math.PI * 2;
      const rx = Math.cos(angle) * dishRadius * 0.85;
      const ry = Math.sin(angle) * dishRadius * 0.85;
      const rr = dishRadius * 0.85;
      const rz = -(rr * rr) / (4 * focalLength);
      strutPositions.push(rx, ry, rz, 0, 0, focalLength);
    }
    const strutGeometry = new THREE.BufferGeometry();
    strutGeometry.setAttribute('position', new THREE.Float32BufferAttribute(strutPositions, 3));
    const strutMaterial = new THREE.LineBasicMaterial({ color: 0x999999 });
    const struts = new THREE.LineSegments(strutGeometry, strutMaterial);
    antennaElement.add(struts);

    // Mounting arm (short cylinder from dish back to mast attachment)
    const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6);
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
    const arm = new THREE.Mesh(armGeometry, armMaterial);
    arm.rotation.x = Math.PI / 2;
    arm.position.z = -0.3;
    antennaElement.add(arm);

    antennaElement.position.y = 4;
    group.add(antennaElement);

    // Label
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

  updateAntenna(antennaGroup, azimuthTicks, tiltDeg, mastSections, bearingOffset = 0) {
    if (!antennaGroup) return;

    const adjTicks = azimuthTicks - bearingOffset;
    const azimuthRad = (adjTicks / 7200) * Math.PI * 2;
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
      // YXZ order: apply azimuth (Y) first, then tilt (X) in the rotated frame
      // so tilt always goes up/down regardless of azimuth direction
      element.rotation.order = 'YXZ';
      element.rotation.y = Math.PI - azimuthRad;
      element.rotation.x = tiltRad;
    }

    const labelSprite = antennaGroup.getObjectByName('label');
    if (labelSprite) {
      labelSprite.position.y = 4 + mastHeight;
    }
  }

  updateFromPlayerData(data) {
    if (!data) return;

    if (this.mode === 'player') {
      this.updateAntenna(this.myAntenna, data.myAz, data.myTilt, data.myMast);
      this.updateCameraForThirdPerson(data.myMast);

      if (data.otherAz !== undefined) {
        this.updateOtherAntennaPosition(data.otherAz, data.otherTilt, data.otherMast);
      }
    } else {
      // GM mode: update antenna rotations with bearing offsets so correct azimuths
      // make antennas visually face each other in the scene
      const idealAzA = data.idealAzA || 0;
      const idealAzB = data.idealAzB || 0;
      const offsetA = idealAzA;            // A at +Z, needs to face -Z when correct
      const offsetB = idealAzB - 3600;     // B at -Z, needs to face +Z when correct

      if (data.myNode === "A") {
        this.updateAntenna(this.antennaA, data.myAz, data.myTilt, data.myMast, offsetA);
        this.updateAntenna(this.antennaB, data.otherAz, data.otherTilt, data.otherMast, offsetB);
      } else {
        this.updateAntenna(this.antennaA, data.otherAz, data.otherTilt, data.otherMast, offsetA);
        this.updateAntenna(this.antennaB, data.myAz, data.myTilt, data.myMast, offsetB);
      }

      // Update terrain elevation and positioning
      if (data.myElevation !== undefined) {
        this.updateGMLayout(data);
      }

      // Update signal beams
      if (data.myRx !== undefined) {
        this.updateSignalBeams(data);
      }
    }
  }

  handleVisibilityChange() {
    this.isVisible = document.visibilityState === 'visible';
    if (this.isVisible && !this.animationId) {
      this.animate();
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
    if (!this.isVisible) {
      this.animationId = null;
      return;
    }

    this.animationId = requestAnimationFrame(() => this.animate());

    if (this.controls) this.controls.update();

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    // Cancel animation
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Dispose orbit controls
    if (this.controls) this.controls.dispose();

    // Remove event listeners
    window.removeEventListener('resize', this.resizeHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);

    // Dispose shared geometries
    Object.values(this.sharedGeometries).forEach(geometry => {
      if (geometry) geometry.dispose();
    });

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
      if (this.container && this.renderer.domElement) {
        this.container.removeChild(this.renderer.domElement);
      }
    }

    // Clear references
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }
}
