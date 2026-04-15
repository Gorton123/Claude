'use strict';

// ── Scene ──
const canvas = document.getElementById('earth-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);

// ── Lights ──
const sun = new THREE.DirectionalLight(0xfff8e7, 3.5);
sun.position.set(5, 2, 5);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x112244, 0.5));

// ── Stars ──
(function() {
  const n = 7000, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), r = 400 + Math.random() * 200;
    pos[i*3] = r*Math.sin(ph)*Math.cos(th); pos[i*3+1] = r*Math.sin(ph)*Math.sin(th); pos[i*3+2] = r*Math.cos(ph);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true })));
})();

// ── Procedural textures (no network required) ──
function makeEarthTex() {
  const W = 2048, H = 1024, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  // Ocean
  const og = x.createLinearGradient(0,0,0,H);
  og.addColorStop(0,'#1a4a7a'); og.addColorStop(0.5,'#1565c0'); og.addColorStop(1,'#1a4a7a');
  x.fillStyle = og; x.fillRect(0,0,W,H);
  // lat/lon → px
  const p = (lat,lon) => [(lon+180)/360*W, (90-lat)/180*H];
  function land(pts, color) {
    x.fillStyle = color; x.beginPath();
    x.moveTo(...p(pts[0][0],pts[0][1]));
    pts.forEach(q => x.lineTo(...p(q[0],q[1])));
    x.closePath(); x.fill();
  }
  // North America
  land([[70,-140],[72,-95],[60,-65],[47,-53],[40,-67],[35,-76],[25,-80],[20,-87],[15,-83],[8,-77],
        [9,-79],[15,-92],[22,-105],[32,-117],[38,-123],[48,-124],[58,-137],[70,-140]],'#3d7a3d');
  // South America
  land([[12,-72],[10,-62],[5,-52],[0,-50],[-5,-35],[-15,-39],[-25,-48],[-40,-62],[-55,-68],
        [-45,-65],[-35,-57],[-25,-43],[-10,-37],[0,-50],[5,-52],[12,-72]],'#4a8a30');
  // Europe
  land([[71,28],[68,32],[60,30],[55,22],[50,14],[46,7],[43,5],[36,-6],[36,-9],[38,-9],
        [44,-8],[48,-5],[51,2],[53,8],[57,10],[63,8],[65,14],[71,28]],'#5a8a3a');
  // Africa
  land([[37,-5],[37,37],[30,42],[20,44],[11,44],[2,42],[-5,40],[-10,40],[-20,35],
        [-30,30],[-35,27],[-34,18],[-22,14],[-10,13],[0,10],[10,5],[20,15],[30,32],[37,-5]],'#6a8a25');
  // Asia
  land([[70,30],[72,80],[72,130],[68,170],[55,140],[40,130],[35,137],[22,114],[10,104],
        [1,104],[5,100],[13,100],[22,90],[24,88],[20,85],[25,67],[22,60],[38,48],[38,36],
        [42,44],[48,44],[50,55],[55,62],[60,60],[65,58],[68,45],[65,33],[70,30]],'#4a8040');
  // Australia
  land([[-15,130],[-12,136],[-12,142],[-15,145],[-20,148],[-25,153],[-32,152],
        [-38,140],[-32,128],[-26,114],[-17,122],[-15,130]],'#8a7030');
  // Ice caps
  x.fillStyle='#ddeeff'; x.fillRect(0,0,W,H*0.045); x.fillRect(0,H*0.945,W,H*0.055);
  // Greenland
  land([[83,-60],[83,-20],[76,-18],[72,-24],[76,-65],[83,-60]],'#cce8ff');
  return new THREE.CanvasTexture(c);
}

function makeCloudTex() {
  const W=1024,H=512,c=document.createElement('canvas');
  c.width=W; c.height=H;
  const x=c.getContext('2d'); x.clearRect(0,0,W,H);
  for(let i=0;i<120;i++){
    const cx=Math.random()*W, cy=H*0.5+Math.sin(cx/80)*20+(Math.random()-0.5)*H*0.6;
    x.fillStyle=`rgba(255,255,255,${0.08+Math.random()*0.18})`;
    x.beginPath(); x.ellipse(cx,cy,10+Math.random()*40,4+Math.random()*12,0,0,Math.PI*2); x.fill();
  }
  return new THREE.CanvasTexture(c);
}

function makeNightTex() {
  const W=1024,H=512,c=document.createElement('canvas');
  c.width=W; c.height=H;
  const x=c.getContext('2d'); x.fillStyle='#000005'; x.fillRect(0,0,W,H);
  [[0.195,0.35],[0.165,0.36],[0.145,0.40],[0.105,0.36],[0.49,0.27],[0.515,0.23],
   [0.54,0.25],[0.80,0.30],[0.77,0.33],[0.75,0.36],[0.70,0.42],[0.58,0.38],
   [0.78,0.62],[0.27,0.52]].forEach(([cx,cy])=>{
    for(let i=0;i<60;i++){
      const a=Math.random()*Math.PI*2,r=Math.random()*25;
      x.fillStyle=`rgba(255,210,100,${0.3+Math.random()*0.6})`;
      x.fillRect(cx*W+Math.cos(a)*r, cy*H+Math.sin(a)*r*0.5, 1.5, 1.5);
    }
  });
  return new THREE.CanvasTexture(c);
}

// ── Globe setup ──
const R = 1;
let earthMesh, cloudMesh, atmoMesh, nightMesh, gridMesh, cityGroup;
const texStore = {};
const state = { baseLayer:'satellite', clouds:true, atmo:true, terminator:true, grid:false, cities:false, rotate:true };

function buildEarth() {
  const sat = makeEarthTex(), cld = makeCloudTex(), ngt = makeNightTex();
  texStore.sat = sat; texStore.ngt = ngt;

  earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(R, 96, 48),
    new THREE.MeshPhongMaterial({ map: sat, specular: new THREE.Color(0x224466), shininess: 15 })
  );
  scene.add(earthMesh);

  nightMesh = new THREE.Mesh(
    new THREE.SphereGeometry(R+0.001, 64, 32),
    new THREE.MeshBasicMaterial({ map: ngt, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.85, depthWrite: false })
  );
  scene.add(nightMesh);

  cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(R+0.004, 64, 32),
    new THREE.MeshPhongMaterial({ map: cld, transparent: true, opacity: 0.5, depthWrite: false })
  );
  scene.add(cloudMesh);

  atmoMesh = new THREE.Mesh(
    new THREE.SphereGeometry(R*1.035, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sun.position.clone().normalize() } },
      vertexShader: `varying vec3 vN,vV; void main(){ vN=normalize(normalMatrix*normal); vec4 w=modelMatrix*vec4(position,1.); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 sunDir; varying vec3 vN,vV; void main(){ float r=pow(1.-max(dot(vN,vV),0.),3.5); float s=max(dot(normalize(sunDir),vN),0.); float i=r*(0.4+0.6*s)*0.7; gl_FragColor=vec4(vec3(0.23,0.6,0.85)*i,i*0.85); }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    })
  );
  scene.add(atmoMesh);

  gridMesh = buildGrid();
  gridMesh.visible = false;
  scene.add(gridMesh);

  cityGroup = buildCities();
  cityGroup.visible = false;
  scene.add(cityGroup);

  hideLoading();
  startRender();
  upgradeTextures();
}

function buildGrid() {
  const g = new THREE.Group(), m = new THREE.LineBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.2 });
  for (let lat=-90; lat<=90; lat+=15) {
    const pts=[], phi=THREE.MathUtils.degToRad(90-lat);
    for (let lon=0; lon<=360; lon+=3) { const th=THREE.MathUtils.degToRad(lon); pts.push(new THREE.Vector3((R+0.005)*Math.sin(phi)*Math.cos(th),(R+0.005)*Math.cos(phi),(R+0.005)*Math.sin(phi)*Math.sin(th))); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m));
  }
  for (let lon=0; lon<360; lon+=15) {
    const pts=[], th=THREE.MathUtils.degToRad(lon);
    for (let lat=-90; lat<=90; lat+=3) { const phi=THREE.MathUtils.degToRad(90-lat); pts.push(new THREE.Vector3((R+0.005)*Math.sin(phi)*Math.cos(th),(R+0.005)*Math.cos(phi),(R+0.005)*Math.sin(phi)*Math.sin(th))); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m));
  }
  return g;
}

// ── Cities ──
const CITIES = [
  {name:'New York',lat:40.71,lon:-74.01},{name:'London',lat:51.51,lon:-0.13},
  {name:'Tokyo',lat:35.68,lon:139.69},{name:'Sydney',lat:-33.87,lon:151.21},
  {name:'Paris',lat:48.85,lon:2.35},{name:'Beijing',lat:39.90,lon:116.41},
  {name:'Mumbai',lat:19.08,lon:72.88},{name:'São Paulo',lat:-23.55,lon:-46.63},
  {name:'Cairo',lat:30.04,lon:31.24},{name:'Lagos',lat:6.52,lon:3.38},
  {name:'Moscow',lat:55.75,lon:37.62},{name:'Los Angeles',lat:34.05,lon:-118.24},
  {name:'Dubai',lat:25.20,lon:55.27},{name:'Singapore',lat:1.35,lon:103.82},
  {name:'Berlin',lat:52.52,lon:13.40},{name:'Seoul',lat:37.57,lon:126.98},
];

function ll2v(lat,lon,r){ const phi=THREE.MathUtils.degToRad(90-lat),th=THREE.MathUtils.degToRad(lon+180); return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(th),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(th)); }
function v2ll(v){ const r=v.length(); return { lat:90-THREE.MathUtils.radToDeg(Math.acos(v.y/r)), lon:THREE.MathUtils.radToDeg(Math.atan2(v.z,-v.x))-180 }; }

function buildCities() {
  const g=new THREE.Group(), dg=new THREE.SphereGeometry(0.008,8,8), dm=new THREE.MeshBasicMaterial({color:0xffeb3b});
  CITIES.forEach(c=>{ const m=new THREE.Mesh(dg,dm); m.position.copy(ll2v(c.lat,c.lon,R+0.01)); m.userData=c; g.add(m); });
  return g;
}

// ── Background texture upgrade ──
function upgradeTextures() {
  const BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/';
  const tl = new THREE.TextureLoader();
  tl.load(BASE+'earth_atmos_2048.jpg', t => { earthMesh.material.map = t; earthMesh.material.needsUpdate = true; texStore.sat = t; });
  tl.load(BASE+'earth_normal_2048.jpg', t => { earthMesh.material.bumpMap = t; earthMesh.material.bumpScale = 0.012; earthMesh.material.needsUpdate = true; });
  tl.load(BASE+'earth_specular_2048.jpg', t => { earthMesh.material.specularMap = t; earthMesh.material.needsUpdate = true; });
  tl.load(BASE+'earth_clouds_1024.png', t => { cloudMesh.material.map = t; cloudMesh.material.needsUpdate = true; });
  tl.load(BASE+'earth_lights_2048.png', t => { nightMesh.material.map = t; nightMesh.material.needsUpdate = true; texStore.ngt = t; });
}

// ── Camera / interaction ──
let rotX=0,rotY=0,tRotX=0,tRotY=0,dist=2.5,tDist=2.5;
const MIN_D=1.15, MAX_D=10;
const mouse={down:false,moved:false,sx:0,sy:0,rx:0,ry:0};

canvas.addEventListener('mousedown',e=>{mouse.down=true;mouse.moved=false;mouse.sx=e.clientX;mouse.sy=e.clientY;mouse.rx=tRotX;mouse.ry=tRotY;});
canvas.addEventListener('mousemove',e=>{
  if(!mouse.down){hover(e.clientX,e.clientY);return;}
  mouse.moved=true;
  const s=0.005*(dist/2.5);
  tRotY=mouse.ry+(e.clientX-mouse.sx)*s;
  tRotX=Math.max(-Math.PI/2,Math.min(Math.PI/2,mouse.rx+(e.clientY-mouse.sy)*s));
});
canvas.addEventListener('mouseup',e=>{if(!mouse.moved)click(e.clientX,e.clientY);mouse.down=false;});
canvas.addEventListener('mouseleave',()=>{mouse.down=false;});
canvas.addEventListener('wheel',e=>{e.preventDefault();tDist=Math.max(MIN_D,Math.min(MAX_D,tDist*(e.deltaY>0?1.1:0.91)));syncSlider();},{passive:false});

// Touch
let ltd=0;
canvas.addEventListener('touchstart',e=>{if(e.touches.length===1){mouse.down=true;mouse.moved=false;mouse.sx=e.touches[0].clientX;mouse.sy=e.touches[0].clientY;mouse.rx=tRotX;mouse.ry=tRotY;}else if(e.touches.length===2){ltd=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}e.preventDefault();},{passive:false});
canvas.addEventListener('touchmove',e=>{if(e.touches.length===1&&mouse.down){mouse.moved=true;const s=0.005*(dist/2.5);tRotY=mouse.ry+(e.touches[0].clientX-mouse.sx)*s;tRotX=Math.max(-Math.PI/2,Math.min(Math.PI/2,mouse.rx+(e.touches[0].clientY-mouse.sy)*s));}else if(e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);tDist=Math.max(MIN_D,Math.min(MAX_D,tDist*(ltd/d)));ltd=d;syncSlider();}e.preventDefault();},{passive:false});
canvas.addEventListener('touchend',()=>{mouse.down=false;});

const ray=new THREE.Raycaster(), mv=new THREE.Vector2();
function toNDC(cx,cy){mv.x=(cx/window.innerWidth)*2-1;mv.y=-(cy/window.innerHeight)*2+1;}

function hover(cx,cy){
  if(!earthMesh)return;
  toNDC(cx,cy);ray.setFromCamera(mv,camera);
  const h=ray.intersectObject(earthMesh);
  if(h.length){const {lat,lon}=v2ll(h[0].point);document.getElementById('lat-display').textContent=`Lat: ${lat.toFixed(4)}°`;document.getElementById('lon-display').textContent=`Lon: ${lon.toFixed(4)}°`;document.getElementById('alt-display').textContent=`Alt: ${((dist-1)*6371).toFixed(0)} km`;}
}

function click(cx,cy){
  if(!earthMesh)return;
  toNDC(cx,cy);ray.setFromCamera(mv,camera);
  if(state.cities&&cityGroup){const h=ray.intersectObjects(cityGroup.children);if(h.length){showPin(h[0].object.userData.name,h[0].object.userData.lat,h[0].object.userData.lon,cx,cy);return;}}
  const h=ray.intersectObject(earthMesh);
  if(h.length){const {lat,lon}=v2ll(h[0].point);showPin(`${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,lat,lon,cx,cy);}
}

function showPin(name,lat,lon,cx,cy){
  const tt=document.getElementById('pin-tooltip');
  document.getElementById('pin-name').textContent=name;
  document.getElementById('pin-coords').textContent=`${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  tt.style.left=`${Math.min(cx+12,window.innerWidth-190)}px`;
  tt.style.top=`${Math.min(cy-10,window.innerHeight-80)}px`;
  tt.classList.remove('hidden');
}
document.getElementById('pin-close').addEventListener('click',()=>document.getElementById('pin-tooltip').classList.add('hidden'));

function flyTo(lat,lon,d){tRotY=-THREE.MathUtils.degToRad(lon);tRotX=THREE.MathUtils.degToRad(-lat);if(d)tDist=d;syncSlider();}
function syncSlider(){const s=document.getElementById('zoom-slider');if(s)s.value=tDist;}

// ── Render loop ──
const clock = new THREE.Clock();
function startRender(){ renderer.setAnimationLoop(render); }
function render(){
  const dt=clock.getDelta();
  if(state.rotate&&!mouse.down) tRotY+=THREE.MathUtils.degToRad(0.04*dt*60);
  rotX+=(tRotX-rotX)*0.08; rotY+=(tRotY-rotY)*0.08; dist+=(tDist-dist)*0.08;
  camera.position.set(dist*Math.cos(rotX)*Math.sin(rotY),dist*Math.sin(rotX),dist*Math.cos(rotX)*Math.cos(rotY));
  camera.lookAt(0,0,0);
  if(cloudMesh) cloudMesh.rotation.y+=0.00008;
  const svg=document.getElementById('compass-svg');
  if(svg) svg.style.transform=`rotate(${-rotY*(180/Math.PI)}deg)`;
  renderer.render(scene,camera);
}

// ── Sun position ──
function setSunPos(){
  const now=new Date(),doy=Math.floor((now-(new Date(now.getFullYear(),0,0)))/86400000);
  const decl=23.45*Math.sin(THREE.MathUtils.degToRad((360/365)*(doy-81)));
  const ha=(now.getUTCHours()+now.getUTCMinutes()/60-12)*15;
  const phi=THREE.MathUtils.degToRad(90-decl),th=THREE.MathUtils.degToRad(-ha);
  sun.position.set(Math.sin(phi)*Math.cos(th)*100,Math.cos(phi)*100,Math.sin(phi)*Math.sin(th)*100);
  if(atmoMesh) atmoMesh.material.uniforms.sunDir.value.copy(sun.position.clone().normalize());
}
setSunPos();
setInterval(setSunPos,60000);

// ── Hide loading ──
function hideLoading(){
  document.getElementById('loading-bar').style.width='100%';
  setTimeout(()=>{const ls=document.getElementById('loading-screen');ls.style.opacity='0';setTimeout(()=>ls.style.display='none',600);},200);
}

// ── Time display ──
function updateTime(){document.getElementById('time-display').textContent=new Date().toUTCString().replace('GMT','UTC');}
updateTime(); setInterval(updateTime,1000);

// ── UI bindings ──
document.getElementById('btn-layers').addEventListener('click',()=>{
  const p=document.getElementById('layer-panel'),b=document.getElementById('btn-layers');
  p.classList.toggle('hidden');b.classList.toggle('active');
});
document.getElementById('btn-home').addEventListener('click',()=>{tRotX=0;tRotY=0;tDist=2.5;syncSlider();});
document.getElementById('compass').addEventListener('click',()=>{tRotX=0;tRotY=0;});
document.getElementById('zoom-in').addEventListener('click',()=>{tDist=Math.max(MIN_D,tDist*0.8);syncSlider();});
document.getElementById('zoom-out').addEventListener('click',()=>{tDist=Math.min(MAX_D,tDist*1.25);syncSlider();});
document.getElementById('zoom-slider').addEventListener('input',e=>{tDist=parseFloat(e.target.value);});

document.querySelectorAll('input[name="base"]').forEach(r=>r.addEventListener('change',()=>{
  state.baseLayer=r.value;
  if(!earthMesh)return;
  if(r.value==='night'){earthMesh.material.map=texStore.ngt||makeNightTex();earthMesh.material.needsUpdate=true;if(nightMesh)nightMesh.visible=false;}
  else{earthMesh.material.map=texStore.sat||makeEarthTex();earthMesh.material.needsUpdate=true;if(nightMesh)nightMesh.visible=state.terminator;}
}));

[['tog-clouds','clouds',()=>cloudMesh&&(cloudMesh.visible=state.clouds)],
 ['tog-atmosphere','atmo',()=>atmoMesh&&(atmoMesh.visible=state.atmo)],
 ['tog-terminator','terminator',()=>nightMesh&&(nightMesh.visible=state.terminator)],
 ['tog-grid','grid',()=>gridMesh&&(gridMesh.visible=state.grid)],
 ['tog-cities','cities',()=>cityGroup&&(cityGroup.visible=state.cities)],
 ['tog-rotate','rotate',()=>{}],
].forEach(([id,key,cb])=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('change',()=>{state[key]=el.checked;cb();});
});

// ── Search ──
const PLACES=[...CITIES,
  {name:'Amazon Rainforest',lat:-3.46,lon:-62.22},{name:'Sahara Desert',lat:23.42,lon:25.66},
  {name:'Himalayas',lat:27.99,lon:86.93},{name:'Antarctica',lat:-75,lon:0},
  {name:'Grand Canyon',lat:36.10,lon:-112.11},{name:'Great Barrier Reef',lat:-18.29,lon:147.70},
  {name:'Mount Everest',lat:27.99,lon:86.93},{name:'Kilimanjaro',lat:-3.07,lon:37.35},
  {name:'Greenland',lat:72,lon:-40},{name:'Hawaii',lat:21.31,lon:-157.80},
  {name:'Iceland',lat:64.96,lon:-19.02},{name:'New Zealand',lat:-40.90,lon:174.89},
];
const si=document.getElementById('search-input'), sr=document.getElementById('search-results');
si.addEventListener('input',()=>{
  const q=si.value.trim().toLowerCase();
  if(q.length<2){sr.classList.remove('visible');return;}
  const cm=q.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if(cm){showResults([{name:`${cm[1]}°, ${cm[2]}°`,lat:+cm[1],lon:+cm[2]}]);return;}
  showResults(PLACES.filter(p=>p.name.toLowerCase().includes(q)).slice(0,8));
});
function showResults(res){
  if(!res.length){sr.classList.remove('visible');return;}
  sr.innerHTML=res.map(r=>`<div class="search-item" data-lat="${r.lat}" data-lon="${r.lon}"><div class="search-item-name">${r.name}</div><div class="search-item-sub">${r.lat.toFixed(2)}°, ${r.lon.toFixed(2)}°</div></div>`).join('');
  sr.classList.add('visible');
  sr.querySelectorAll('.search-item').forEach(el=>el.addEventListener('click',()=>{flyTo(+el.dataset.lat,+el.dataset.lon,1.6);si.value=el.querySelector('.search-item-name').textContent;sr.classList.remove('visible');}));
}
document.getElementById('search-btn').addEventListener('click',()=>si.dispatchEvent(new Event('input')));
si.addEventListener('keydown',e=>{if(e.key==='Enter')si.dispatchEvent(new Event('input'));if(e.key==='Escape')sr.classList.remove('visible');});
document.addEventListener('click',e=>{if(!e.target.closest('#search-wrapper'))sr.classList.remove('visible');});

document.addEventListener('keydown',e=>{
  if(e.target===si)return;
  if(e.key==='+'||e.key==='='){tDist=Math.max(MIN_D,tDist*0.8);syncSlider();}
  if(e.key==='-'){tDist=Math.min(MAX_D,tDist*1.25);syncSlider();}
  if(e.key==='r'||e.key==='R'){tRotX=0;tRotY=0;tDist=2.5;syncSlider();}
  if(e.key==='ArrowLeft')tRotY-=0.1;
  if(e.key==='ArrowRight')tRotY+=0.1;
  if(e.key==='ArrowUp')tRotX=Math.max(-Math.PI/2,tRotX-0.1);
  if(e.key==='ArrowDown')tRotX=Math.min(Math.PI/2,tRotX+0.1);
  if(e.key==='/')si.focus();
});

window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});

// ── BOOT ──
buildEarth();
