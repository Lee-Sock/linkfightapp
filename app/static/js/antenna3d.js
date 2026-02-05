// Three.js 3D Antenna Visualization - Optimized & Daytime Theme

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
      this.camera.position.set(0, 15, 30);
      this.camera.lookAt(0, 5, 0);
      this.scene.background = new THREE.Color(0x87CEEB);
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

    // Bright daytime lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(50, 100, 50);
    this.scene.add(sunLight);

    // Handle window resize
    this.resizeHandler = () => this.onWindowResize();
    window.addEventListener('resize', this.resizeHandler);

    // Handle visibility change for performance
    this.visibilityHandler = () => this.handleVisibilityChange();
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // Start animation loop
    this.animate();
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

  createGMEnvironment() {
    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshLambertMaterial({
      color: 0x90EE90,
      side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // Grid
    const gridHelper = new THREE.GridHelper(50, 10, 0x666666, 0x888888);
    this.scene.add(gridHelper);

    // Create both antennas
    this.antennaA = this.createAntennaModel(0x4488ff, { x: -10, y: 0, z: 0 }, 'Node A');
    this.antennaB = this.createAntennaModel(0xff8844, { x: 10, y: 0, z: 0 }, 'Node B');
    this.scene.add(this.antennaA);
    this.scene.add(this.antennaB);
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

    // Antenna element group
    const antennaElement = new THREE.Group();
    antennaElement.name = 'element';

    // Dish
    const dishGeometry = this.getSharedGeometry('circle', 1.2, 24);
    const dishMaterial = new THREE.MeshLambertMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const dish = new THREE.Mesh(dishGeometry, dishMaterial);
    antennaElement.add(dish);

    // Ring
    const ringGeometry = this.getSharedGeometry('ring', 1.0, 1.2, 24);
    const ringMaterial = new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.z = 0.01;
    antennaElement.add(ring);

    // Direction cone - points forward (positive Z) to show aiming direction
    const coneGeometry = this.getSharedGeometry('cone', 0.4, 1.5, 12);
    const coneMaterial = new THREE.MeshLambertMaterial({ color: color });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    // Point forward (positive Z) so it aims toward the other antenna
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = 0.8;
    antennaElement.add(cone);

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
      // Fix: Invert rotation so 0 ticks (North) points to -Z (North in Three.js)
      // Three.js rotation is CCW from +Z, but compass is CW from North (-Z)
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
      // GM mode: Just use the absolute azimuth values directly
      // The updateAntenna function will handle the rotation correctly
      console.log('[3D Debug] GM Update - A:', data.myAz, 'B:', data.otherAz);
      
      if (data.myNode === "A") {
        this.updateAntenna(this.antennaA, data.myAz, data.myTilt, data.myMast);
        this.updateAntenna(this.antennaB, data.otherAz, data.otherTilt, data.otherMast);
      } else {
        this.updateAntenna(this.antennaA, data.otherAz, data.otherTilt, data.otherMast);
        this.updateAntenna(this.antennaB, data.myAz, data.myTilt, data.myMast);
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
