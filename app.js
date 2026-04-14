/**
 * EarthView — 2025 High-Fidelity Globe
 * Three.js-based interactive 3D Earth renderer
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   1. TEXTURE SOURCES
   Using NASA Blue Marble + NOAA ETOPO data from public CDNs
───────────────────────────────────────────────────────────── */
const TEX = {
  // NASA Blue Marble 2004 (8192×4096) via publicly hosted mirror
  satellite:    'https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74117/world.200408.3x5400x2700.jpg',
  // Fallback lower-res via unpkg-hosted Three.js example textures
  satelliteFB:  'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
  topoBump:     'https://threejs.org/examples/textures/planets/earth_normal_2048.jpg',
  specular:     'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg',
  clouds:       'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
  // NASA city lights (night)
  nightLights:  'https://eoimages.gsfc.nasa.gov/images/imagerecords/55000/55167/earth_lights_lrg.jpg',
  nightFB:      'https://threejs.org/examples/textures/planets/earth_lights_2048.png',
};

/* ─────────────────────────────────────────────────────────────
   2. SCENE SETUP
───────────────────────────────────────────────────────────── */
const canvas  = document.getElementById('earth-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(0, 0, 2.5);

/* ─────────────────────────────────────────────────────────────
   3. STAR FIELD
───────────────────────────────────────────────────────────── */
(function buildStars() {
  const count = 8000;
  const positions = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 400 + Math.random() * 200;
    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);
    sizes[i] = 0.5 + Math.random() * 1.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes,     1));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.8,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  });
  scene.add(new THREE.Points(geo, mat));
})();

/* ─────────────────────────────────────────────────────────────
   4. LIGHTING
───────────────────────────────────────────────────────────── */
const sunLight = new THREE.DirectionalLight(0xfff8e7, 3.5);
sunLight.position.set(5, 2, 5);
sunLight.castShadow = true;
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x112244, 0.4);
scene.add(ambientLight);

/* Subtle rim (back scatter) */
const rimLight = new THREE.DirectionalLight(0x4499ff, 0.3);
rimLight.position.set(-5, -2, -5);
scene.add(rimLight);

/* ─────────────────────────────────────────────────────────────
   5. TEXTURE LOADER + PROGRESS
───────────────────────────────────────────────────────────── */
const loader    = new THREE.TextureLoader();
const loadBar   = document.getElementById('loading-bar');
let   loadCount = 0;
const loadTotal = 5; // satellite, bump, spec, clouds, night

function onTexLoaded() {
  loadCount++;
  loadBar.style.width = `${(loadCount / loadTotal) * 100}%`;
}

function loadTex(primary, fallback) {
  return new Promise(resolve => {
    loader.load(
      primary,
      tex => { onTexLoaded(); resolve(tex); },
      undefined,
      () => {
        loader.load(fallback || primary, tex => { onTexLoaded(); resolve(tex); });
      }
    );
  });
}

/* ─────────────────────────────────────────────────────────────
   6. EARTH GLOBE
───────────────────────────────────────────────────────────── */
const EARTH_RADIUS = 1;
const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 128, 64);

let earthMesh, cloudMesh, atmosphereMesh, gridMesh, nightMesh;

// State
const state = {
  baseLayer:   'satellite',   // satellite | topo | night
  showClouds:  true,
  showAtmo:    true,
  showTerminator: true,
  showGrid:    false,
  showCities:  false,
  autoRotate:  true,
  targetLat:   0,
  targetLon:   0,
  cameraAlt:   2.5,           // camera.z equivalent in world units
};

async function buildEarth() {
  const [satTex, bumpTex, specTex, cloudTex, nightTex] = await Promise.all([
    loadTex(TEX.satellite,   TEX.satelliteFB),
    loadTex(TEX.topoBump,    TEX.topoBump),
    loadTex(TEX.specular,    TEX.specular),
    loadTex(TEX.clouds,      TEX.clouds),
    loadTex(TEX.nightLights, TEX.nightFB),
  ]);

  // Store textures for layer switching
  earthTextures.satellite = satTex;
  earthTextures.night     = nightTex;
  earthTextures.bump      = bumpTex;
  earthTextures.specular  = specTex;

  // ── Earth surface ──
  const earthMat = new THREE.MeshPhongMaterial({
    map:         satTex,
    bumpMap:     bumpTex,
    bumpScale:   0.012,
    specularMap: specTex,
    specular:    new THREE.Color(0x2a4a6a),
    shininess:   18,
  });
  earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthMesh.receiveShadow = true;
  scene.add(earthMesh);

  // ── Night lights (rendered on top with additive blending) ──
  const nightMat = new THREE.MeshBasicMaterial({
    map:         nightTex,
    blending:    THREE.AdditiveBlending,
    transparent: true,
    opacity:     0,           // controlled by terminator shader
    depthWrite:  false,
  });
  nightMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS + 0.001, 128, 64), nightMat);
  scene.add(nightMesh);

  // ── Clouds ──
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  const cloudMat = new THREE.MeshPhongMaterial({
    map:         cloudTex,
    transparent: true,
    opacity:     0.55,
    depthWrite:  false,
    blending:    THREE.NormalBlending,
  });
  cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS + 0.004, 96, 48),
    cloudMat
  );
  scene.add(cloudMesh);

  // ── Atmosphere glow ──
  atmosphereMesh = buildAtmosphere();
  scene.add(atmosphereMesh);

  // ── Lat/Lon grid ──
  gridMesh = buildGrid();
  gridMesh.visible = false;
  scene.add(gridMesh);

  // ── City markers ──
  buildCityMarkers();

  hideLoading();
  startRenderLoop();
}

const earthTextures = {};

/* ─────────────────────────────────────────────────────────────
   7. ATMOSPHERE (custom shader glow)
───────────────────────────────────────────────────────────── */
function buildAtmosphere() {
  const atmoGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.035, 64, 32);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: sunLight.position.clone().normalize() },
      glowColor: { value: new THREE.Color(0x3a9ad9) },
      coeff: { value: 0.7 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main(){
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDir;
      uniform vec3 glowColor;
      uniform float coeff;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main(){
        float rim = 1.0 - max(dot(vNormal, vViewDir), 0.0);
        rim = pow(rim, 3.5);
        float sun = max(dot(normalize(sunDir), vNormal), 0.0);
        float intensity = rim * (0.35 + 0.65 * sun) * coeff;
        gl_FragColor = vec4(glowColor * intensity, intensity * 0.85);
      }
    `,
    side:        THREE.BackSide,
    blending:    THREE.AdditiveBlending,
    transparent: true,
    depthWrite:  false,
  });
  return new THREE.Mesh(atmoGeo, atmoMat);
}

/* ─────────────────────────────────────────────────────────────
   8. LAT/LON GRID
───────────────────────────────────────────────────────────── */
function buildGrid() {
  const group = new THREE.Group();
  const mat   = new THREE.LineBasicMaterial({ color: 0x4fc3f7, opacity: 0.18, transparent: true });

  // Latitude lines every 15°
  for (let lat = -90; lat <= 90; lat += 15) {
    const pts = [];
    const phi = THREE.MathUtils.degToRad(90 - lat);
    for (let lon = 0; lon <= 360; lon += 2) {
      const theta = THREE.MathUtils.degToRad(lon);
      const r = EARTH_RADIUS + 0.005;
      pts.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      ));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }

  // Longitude lines every 15°
  for (let lon = 0; lon < 360; lon += 15) {
    const pts = [];
    const theta = THREE.MathUtils.degToRad(lon);
    for (let lat = -90; lat <= 90; lat += 2) {
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const r = EARTH_RADIUS + 0.005;
      pts.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      ));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }

  return group;
}

/* ─────────────────────────────────────────────────────────────
   9. CITY MARKERS
───────────────────────────────────────────────────────────── */
const CITIES = [
  { name: 'New York',      lat:  40.71, lon:  -74.01 },
  { name: 'London',        lat:  51.51, lon:   -0.13 },
  { name: 'Tokyo',         lat:  35.68, lon:  139.69 },
  { name: 'Sydney',        lat: -33.87, lon:  151.21 },
  { name: 'Paris',         lat:  48.85, lon:    2.35 },
  { name: 'Beijing',       lat:  39.90, lon:  116.41 },
  { name: 'Mumbai',        lat:  19.08, lon:   72.88 },
  { name: 'São Paulo',     lat: -23.55, lon:  -46.63 },
  { name: 'Cairo',         lat:  30.04, lon:   31.24 },
  { name: 'Lagos',         lat:   6.52, lon:    3.38 },
  { name: 'Moscow',        lat:  55.75, lon:   37.62 },
  { name: 'Los Angeles',   lat:  34.05, lon: -118.24 },
  { name: 'Dubai',         lat:  25.20, lon:   55.27 },
  { name: 'Singapore',     lat:   1.35, lon:  103.82 },
  { name: 'Mexico City',   lat:  19.43, lon:  -99.13 },
  { name: 'Johannesburg',  lat: -26.20, lon:   28.04 },
  { name: 'Toronto',       lat:  43.65, lon:  -79.38 },
  { name: 'Berlin',        lat:  52.52, lon:   13.40 },
  { name: 'Istanbul',      lat:  41.01, lon:   28.95 },
  { name: 'Seoul',         lat:  37.57, lon:  126.98 },
];

let cityGroup;

function buildCityMarkers() {
  cityGroup = new THREE.Group();
  const dotGeo = new THREE.SphereGeometry(0.008, 8, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b });

  CITIES.forEach(city => {
    const v = latLonToVec3(city.lat, city.lon, EARTH_RADIUS + 0.008);
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(v);
    dot.userData = city;
    cityGroup.add(dot);
  });

  cityGroup.visible = false;
  scene.add(cityGroup);
}

/* ─────────────────────────────────────────────────────────────
   10. COORDINATE HELPERS
───────────────────────────────────────────────────────────── */
function latLonToVec3(lat, lon, r) {
  const phi   = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

function vec3ToLatLon(v) {
  const r   = v.length();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(v.y / r));
  let   lon = THREE.MathUtils.radToDeg(Math.atan2(v.z, -v.x)) - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

/* ─────────────────────────────────────────────────────────────
   11. INTERACTION — orbit controls (custom, no import needed)
───────────────────────────────────────────────────────────── */
const mouse    = { x: 0, y: 0, down: false, moved: false };
const drag     = { startX: 0, startY: 0, rotX: 0, rotY: 0 };
let   targetRotX = 0, targetRotY = 0;
let   currentRotX = 0, currentRotY = 0;

// Camera distance (zoom)
let targetDist  = 2.5;
let currentDist = 2.5;
const MIN_DIST  = 1.15;
const MAX_DIST  = 10;

canvas.addEventListener('mousedown', e => {
  mouse.down  = true;
  mouse.moved = false;
  drag.startX = e.clientX;
  drag.startY = e.clientY;
  drag.rotX   = targetRotX;
  drag.rotY   = targetRotY;
});

canvas.addEventListener('mousemove', e => {
  if (!mouse.down) {
    // Update coordinate display on hover
    updateHoverCoords(e.clientX, e.clientY);
    return;
  }
  mouse.moved = true;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  const sensitivity = 0.005 * (currentDist / 2.5);
  targetRotY = drag.rotY + dx * sensitivity;
  targetRotX = drag.rotX + dy * sensitivity;
  targetRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotX));
});

canvas.addEventListener('mouseup', e => {
  if (!mouse.moved) handleClick(e.clientX, e.clientY);
  mouse.down = false;
});

canvas.addEventListener('mouseleave', () => { mouse.down = false; });

// Touch
let lastTouchDist = 0;
canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    mouse.down = true;
    mouse.moved = false;
    drag.startX = e.touches[0].clientX;
    drag.startY = e.touches[0].clientY;
    drag.rotX   = targetRotX;
    drag.rotY   = targetRotY;
  } else if (e.touches.length === 2) {
    lastTouchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  if (e.touches.length === 1 && mouse.down) {
    mouse.moved = true;
    const dx = e.touches[0].clientX - drag.startX;
    const dy = e.touches[0].clientY - drag.startY;
    const sensitivity = 0.005 * (currentDist / 2.5);
    targetRotY = drag.rotY + dx * sensitivity;
    targetRotX = drag.rotX + dy * sensitivity;
    targetRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotX));
  } else if (e.touches.length === 2) {
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const scale = lastTouchDist / d;
    targetDist = Math.max(MIN_DIST, Math.min(MAX_DIST, targetDist * scale));
    lastTouchDist = d;
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', () => { mouse.down = false; });

// Scroll zoom
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 1.1 : 0.91;
  targetDist  = Math.max(MIN_DIST, Math.min(MAX_DIST, targetDist * delta));
  updateZoomSlider();
}, { passive: false });

function updateZoomSlider() {
  const slider = document.getElementById('zoom-slider');
  if (slider) slider.value = targetDist;
}

/* Raycasting for click/hover */
const raycaster = new THREE.Raycaster();
const mouseVec  = new THREE.Vector2();

function toNDC(cx, cy) {
  mouseVec.x =  (cx / window.innerWidth)  * 2 - 1;
  mouseVec.y = -(cy / window.innerHeight) * 2 + 1;
}

function updateHoverCoords(cx, cy) {
  toNDC(cx, cy);
  raycaster.setFromCamera(mouseVec, camera);
  const hits = raycaster.intersectObject(earthMesh);
  if (hits.length > 0) {
    const { lat, lon } = vec3ToLatLon(hits[0].point);
    const dist = currentDist - 1;
    document.getElementById('lat-display').textContent = `Lat: ${lat.toFixed(4)}°`;
    document.getElementById('lon-display').textContent = `Lon: ${lon.toFixed(4)}°`;
    document.getElementById('alt-display').textContent = `Alt: ${(dist * 6371).toFixed(0)} km`;
  }
}

function handleClick(cx, cy) {
  toNDC(cx, cy);
  raycaster.setFromCamera(mouseVec, camera);

  // City hit test
  if (state.showCities && cityGroup) {
    const hits = raycaster.intersectObjects(cityGroup.children);
    if (hits.length > 0) {
      showCityTooltip(hits[0].object.userData, cx, cy);
      return;
    }
  }

  // Globe click — show coords
  const hits = raycaster.intersectObject(earthMesh);
  if (hits.length > 0) {
    const { lat, lon } = vec3ToLatLon(hits[0].point);
    showPinTooltip(`${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`, lat, lon, cx, cy);
  }
}

function showCityTooltip(city, cx, cy) {
  showPinTooltip(city.name, city.lat, city.lon, cx, cy);
}

function showPinTooltip(name, lat, lon, cx, cy) {
  const tt = document.getElementById('pin-tooltip');
  document.getElementById('pin-name').textContent   = name;
  document.getElementById('pin-coords').textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  tt.style.left = `${Math.min(cx + 12, window.innerWidth  - 190)}px`;
  tt.style.top  = `${Math.min(cy - 10, window.innerHeight - 80)}px`;
  tt.classList.remove('hidden');
}

document.getElementById('pin-close').addEventListener('click', () => {
  document.getElementById('pin-tooltip').classList.add('hidden');
});

/* ─────────────────────────────────────────────────────────────
   12. FLY TO LOCATION
───────────────────────────────────────────────────────────── */
function flyTo(lat, lon, dist) {
  // Convert desired lat/lon to rotation angles
  const targetPhi   = THREE.MathUtils.degToRad(lon);          // around Y
  const targetTheta = THREE.MathUtils.degToRad(-lat);         // tilt
  targetRotY = -targetPhi;
  targetRotX = targetTheta;
  if (dist !== undefined) targetDist = dist;
  updateZoomSlider();
}

/* ─────────────────────────────────────────────────────────────
   13. SUN POSITION (real time)
───────────────────────────────────────────────────────────── */
function computeSunPosition() {
  const now  = new Date();
  const doy  = getDayOfYear(now);
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  // Declination angle
  const decl  = 23.45 * Math.sin(THREE.MathUtils.degToRad((360 / 365) * (doy - 81)));
  // Hour angle
  const ha    = (hour - 12) * 15;
  // Sun unit vector
  const phi   = THREE.MathUtils.degToRad(90 - decl);
  const theta = THREE.MathUtils.degToRad(-ha);
  sunLight.position.set(
    Math.sin(phi) * Math.cos(theta) * 100,
    Math.cos(phi)                   * 100,
    Math.sin(phi) * Math.sin(theta) * 100
  );
  // Update atmosphere shader
  if (atmosphereMesh) {
    atmosphereMesh.material.uniforms.sunDir.value.copy(
      sunLight.position.clone().normalize()
    );
  }
}

function getDayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

/* Night lights opacity based on sun dot product */
function updateNightLights() {
  if (!nightMesh || !earthMesh) return;
  if (!state.showTerminator) { nightMesh.material.opacity = 0; return; }
  // No per-fragment blending here — handled by global render pass;
  // just keep opacity at 1 and let the additive blending work
  nightMesh.material.opacity = 0.9;
}

/* ─────────────────────────────────────────────────────────────
   14. RENDER LOOP
───────────────────────────────────────────────────────────── */
const clock = new THREE.Clock();
let autoRotSpeed = 0.04; // degrees per second

function startRenderLoop() {
  renderer.setAnimationLoop(render);
}

function render() {
  const delta = clock.getDelta();

  // Auto-rotate
  if (state.autoRotate && !mouse.down) {
    targetRotY += THREE.MathUtils.degToRad(autoRotSpeed * delta * 60);
  }

  // Smooth camera
  currentRotX += (targetRotX - currentRotX) * 0.08;
  currentRotY += (targetRotY - currentRotY) * 0.08;
  currentDist += (targetDist - currentDist) * 0.08;

  camera.position.x = currentDist * Math.sin(currentRotX) * Math.sin(currentRotY);
  camera.position.y = currentDist * Math.sin(currentRotX);
  camera.position.z = currentDist * Math.cos(currentRotX) * Math.cos(currentRotY);

  // Recalculate properly
  camera.position.set(
    currentDist * Math.cos(currentRotX) * Math.sin(currentRotY),
    currentDist * Math.sin(currentRotX),
    currentDist * Math.cos(currentRotX) * Math.cos(currentRotY)
  );
  camera.lookAt(0, 0, 0);

  // Cloud drift
  if (cloudMesh) cloudMesh.rotation.y += 0.00008;

  // Sun update (every 60 frames)
  if (Math.round(clock.elapsedTime * 60) % 60 === 0) {
    computeSunPosition();
    updateNightLights();
  }

  // Compass
  updateCompass();

  renderer.render(scene, camera);
}

function updateCompass() {
  const svg = document.getElementById('compass-svg');
  if (svg) {
    svg.style.transform = `rotate(${-currentRotY * (180 / Math.PI)}deg)`;
  }
}

/* ─────────────────────────────────────────────────────────────
   15. LAYER SWITCHING
───────────────────────────────────────────────────────────── */
function applyLayers() {
  if (!earthMesh) return;
  const mat = earthMesh.material;
  if (state.baseLayer === 'satellite' || state.baseLayer === 'topo') {
    mat.map = earthTextures.satellite;
    mat.bumpMap   = earthTextures.bump;
    mat.bumpScale = state.baseLayer === 'topo' ? 0.035 : 0.012;
    mat.needsUpdate = true;
    if (nightMesh) nightMesh.visible = state.showTerminator;
  } else if (state.baseLayer === 'night') {
    mat.map = earthTextures.night;
    mat.bumpMap = null;
    mat.needsUpdate = true;
    if (nightMesh) nightMesh.visible = false;
  }
  if (cloudMesh)      cloudMesh.visible      = state.showClouds;
  if (atmosphereMesh) atmosphereMesh.visible = state.showAtmo;
  if (gridMesh)       gridMesh.visible       = state.showGrid;
  if (cityGroup)      cityGroup.visible      = state.showCities;
}

/* ─────────────────────────────────────────────────────────────
   16. LOADING SCREEN
───────────────────────────────────────────────────────────── */
function hideLoading() {
  const ls = document.getElementById('loading-screen');
  ls.classList.add('fade-out');
  setTimeout(() => ls.classList.add('hidden'), 700);
}

/* ─────────────────────────────────────────────────────────────
   17. UI WIRING
───────────────────────────────────────────────────────────── */

/* Layer panel toggle */
document.getElementById('btn-layers').addEventListener('click', () => {
  const panel = document.getElementById('layer-panel');
  const btn   = document.getElementById('btn-layers');
  panel.classList.toggle('hidden');
  btn.classList.toggle('active');
});

document.querySelectorAll('input[name="base"]').forEach(r => {
  r.addEventListener('change', () => {
    state.baseLayer = r.value;
    applyLayers();
  });
});

[
  ['tog-clouds',      'showClouds'],
  ['tog-atmosphere',  'showAtmo'],
  ['tog-terminator',  'showTerminator'],
  ['tog-grid',        'showGrid'],
  ['tog-cities',      'showCities'],
  ['tog-rotate',      'autoRotate'],
].forEach(([id, key]) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => { state[key] = el.checked; applyLayers(); });
});

/* Zoom buttons */
document.getElementById('zoom-in').addEventListener('click', () => {
  targetDist = Math.max(MIN_DIST, targetDist * 0.8);
  updateZoomSlider();
});
document.getElementById('zoom-out').addEventListener('click', () => {
  targetDist = Math.min(MAX_DIST, targetDist * 1.25);
  updateZoomSlider();
});
document.getElementById('zoom-slider').addEventListener('input', e => {
  targetDist = parseFloat(e.target.value);
});

/* Compass: reset north */
document.getElementById('compass').addEventListener('click', () => {
  targetRotY = 0;
  targetRotX = 0;
});

/* Reset button */
document.getElementById('btn-home').addEventListener('click', () => {
  targetRotX  = 0;
  targetRotY  = 0;
  targetDist  = 2.5;
  updateZoomSlider();
});

/* ─────────────────────────────────────────────────────────────
   18. SEARCH
───────────────────────────────────────────────────────────── */
const SEARCH_DB = [
  ...CITIES,
  // Landmarks & regions
  { name: 'Amazon Rainforest',  lat:  -3.46, lon:  -62.22 },
  { name: 'Sahara Desert',      lat:  23.42, lon:   25.66 },
  { name: 'Himalayas',          lat:  27.99, lon:   86.93 },
  { name: 'Antarctic Ice',      lat: -75.25, lon:    0.07 },
  { name: 'Arctic Ocean',       lat:  85.00, lon:    0.00 },
  { name: 'Grand Canyon',       lat:  36.10, lon: -112.11 },
  { name: 'Great Barrier Reef', lat: -18.29, lon:  147.70 },
  { name: 'Mariana Trench',     lat:  11.37, lon:  142.59 },
  { name: 'Nile River',         lat:  25.00, lon:   32.00 },
  { name: 'Mississippi River',  lat:  32.00, lon:  -90.00 },
  { name: 'Mount Everest',      lat:  27.99, lon:   86.93 },
  { name: 'Kilimanjaro',        lat:  -3.07, lon:   37.35 },
  { name: 'Andes Mountains',    lat: -16.00, lon:  -71.00 },
  { name: 'Greenland',          lat:  72.00, lon:  -40.00 },
  { name: 'Iceland',            lat:  64.96, lon:  -19.02 },
  { name: 'Madagascar',         lat: -18.77, lon:   46.87 },
  { name: 'Borneo',             lat:   1.00, lon:  114.00 },
  { name: 'New Zealand',        lat: -40.90, lon:  174.89 },
  { name: 'Hawaii',             lat:  21.31, lon: -157.80 },
  { name: 'Galapagos Islands',  lat:  -0.83, lon:  -91.03 },
];

const searchInput   = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (q.length < 2) { searchResults.classList.remove('visible'); return; }

  // Check if it looks like coordinates: "lat, lon"
  const coordMatch = q.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    showSearchResult([{ name: `${lat}°, ${lon}°`, sub: 'Coordinate', lat, lon }]);
    return;
  }

  const results = SEARCH_DB.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  showSearchResult(results);
});

function showSearchResult(results) {
  if (!results.length) { searchResults.classList.remove('visible'); return; }
  searchResults.innerHTML = results.map(r => `
    <div class="search-item" data-lat="${r.lat}" data-lon="${r.lon}">
      <div class="search-item-name">${r.name}</div>
      <div class="search-item-sub">${r.sub || `${r.lat.toFixed(2)}°, ${r.lon.toFixed(2)}°`}</div>
    </div>
  `).join('');
  searchResults.classList.add('visible');
  searchResults.querySelectorAll('.search-item').forEach(el => {
    el.addEventListener('click', () => {
      flyTo(parseFloat(el.dataset.lat), parseFloat(el.dataset.lon), 1.6);
      searchInput.value = el.querySelector('.search-item-name').textContent;
      searchResults.classList.remove('visible');
    });
  });
}

document.getElementById('search-btn').addEventListener('click', () => {
  searchInput.dispatchEvent(new Event('input'));
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchInput.dispatchEvent(new Event('input'));
  if (e.key === 'Escape') searchResults.classList.remove('visible');
});

document.addEventListener('click', e => {
  if (!e.target.closest('#search-wrapper')) searchResults.classList.remove('visible');
});

/* ─────────────────────────────────────────────────────────────
   19. TIME DISPLAY
───────────────────────────────────────────────────────────── */
function updateTimeDisplay() {
  const now = new Date();
  const utc = now.toUTCString().replace('GMT', 'UTC');
  document.getElementById('time-display').textContent = utc;
}
setInterval(updateTimeDisplay, 1000);
updateTimeDisplay();

/* ─────────────────────────────────────────────────────────────
   20. RESIZE
───────────────────────────────────────────────────────────── */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ─────────────────────────────────────────────────────────────
   21. KEYBOARD SHORTCUTS
───────────────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.target === searchInput) return;
  switch (e.key) {
    case '+': case '=':
      targetDist = Math.max(MIN_DIST, targetDist * 0.8); updateZoomSlider(); break;
    case '-':
      targetDist = Math.min(MAX_DIST, targetDist * 1.25); updateZoomSlider(); break;
    case 'r': case 'R':
      targetRotX = 0; targetRotY = 0; targetDist = 2.5; updateZoomSlider(); break;
    case 'ArrowLeft':
      targetRotY -= 0.1; break;
    case 'ArrowRight':
      targetRotY += 0.1; break;
    case 'ArrowUp':
      targetRotX = Math.max(-Math.PI/2, targetRotX - 0.1); break;
    case 'ArrowDown':
      targetRotX = Math.min( Math.PI/2, targetRotX + 0.1); break;
    case '/':
      searchInput.focus(); e.preventDefault(); break;
  }
});

/* ─────────────────────────────────────────────────────────────
   22. BOOT
───────────────────────────────────────────────────────────── */
computeSunPosition();
buildEarth();
