import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ------------------------------------------------------------------ */
/*  WILDLINE: BLOODRIFT                                                */
/*  An original open-world creature-combat field test.                 */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const damp = (a, b, lambda, dt) => THREE.MathUtils.damp(a, b, lambda, dt);
const fmt = (n) => String(Math.max(0, Math.round(n))).padStart(4, '0');
const isTouch = matchMedia('(pointer: coarse)').matches;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const worldRand = mulberry32(0xb100d);
const wr = (a, b) => a + worldRand() * (b - a);
const gauss = (x, z, cx, cz, radius) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / radius);

/* ---------------- renderer, scene, camera ---------------- */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.3 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9ab7a6, 42, 205);
const camera = new THREE.PerspectiveCamera(69, window.innerWidth / window.innerHeight, 0.06, 520);
camera.rotation.order = 'YXZ';
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.58, 0.82);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// First-person weapon is drawn in its own overlay scene so it never clips the
// world near-plane and keeps a stable, readable silhouette at any FOV.
const viewScene = new THREE.Scene();
const viewCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 12);
viewScene.add(new THREE.HemisphereLight(0xdff0e6, 0x1b261c, 0.9));
const viewKey = new THREE.DirectionalLight(0xffd8a8, 1.05);
viewKey.position.set(-1.4, 2.4, -0.8);
viewScene.add(viewKey);
const viewRim = new THREE.DirectionalLight(0x9fd8d0, 0.5);
viewRim.position.set(1.6, 0.8, -1.5);
viewScene.add(viewRim);

/* ---------------- lighting ---------------- */
const sunDirection = new THREE.Vector3(-0.53, 0.23, -0.81).normalize();
const hemi = new THREE.HemisphereLight(0x9fd6cf, 0x24331d, 1.45);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc18c, 3.35);
sun.position.copy(sunDirection).multiplyScalar(120);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 220;
sun.shadow.camera.left = -75;
sun.shadow.camera.right = 75;
sun.shadow.camera.top = 75;
sun.shadow.camera.bottom = -75;
sun.shadow.bias = -0.00035;
sun.target.position.set(0, 0, -10);
scene.add(sun, sun.target);
const skyFill = new THREE.DirectionalLight(0x72a6c8, 0.8);
skyFill.position.set(70, 45, 80);
scene.add(skyFill);
const warmFill = new THREE.PointLight(0xffbe72, 30, 80, 2);
warmFill.position.set(-34, 16, -50);
scene.add(warmFill);

/* ---------------- sky ---------------- */
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    uTop: { value: new THREE.Color(0x183447) },
    uMid: { value: new THREE.Color(0x79a59b) },
    uHorizon: { value: new THREE.Color(0xffc58b) },
    uSunDir: { value: sunDirection },
    uTime: { value: 0 }
  },
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uTop, uMid, uHorizon, uSunDir;
    uniform float uTime;
    varying vec3 vWorld;
    void main() {
      vec3 dir = normalize(vWorld - cameraPosition);
      float h = clamp(dir.y, -0.15, 1.0);
      vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.24, h));
      col = mix(col, uTop, smoothstep(0.18, 0.78, h));
      float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
      float disc = smoothstep(0.9991, 0.99972, sunDot);
      float glow = pow(sunDot, 90.0) * 0.55 + pow(sunDot, 12.0) * 0.12;
      col += vec3(1.0, 0.72, 0.38) * glow;
      col = mix(col, vec3(1.0, 0.93, 0.73), disc);
      float band = sin((dir.y + uTime * 0.002) * 95.0) * 0.003;
      col += band * smoothstep(0.02, 0.5, h);
      gl_FragColor = vec4(col, 1.0);
    }
  `
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(430, 40, 24), skyMat);
sky.renderOrder = -10;
scene.add(sky);

// soft golden clouds, deliberately low-poly and distant
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffe4c2, transparent: true, opacity: 0.13, depthWrite: false });
const cloudMat2 = new THREE.MeshBasicMaterial({ color: 0xbfe0dc, transparent: true, opacity: 0.09, depthWrite: false });
const clouds = new THREE.Group();
for (let i = 0; i < 18; i++) {
  const c = new THREE.Mesh(new THREE.IcosahedronGeometry(wr(5, 16), 0), i % 3 ? cloudMat : cloudMat2);
  c.position.set(wr(-230, 230), wr(35, 80), wr(-240, 120));
  c.scale.set(wr(1, 2.7), wr(0.2, 0.52), wr(0.7, 1.4));
  c.renderOrder = -5;
  clouds.add(c);
}
scene.add(clouds);

/* ---------------- island height field ---------------- */
const PATHS = [
  [[0, 9], [-7, -8], [-25, -20], [-44, -28]],
  [[0, 9], [14, 5], [31, 16], [52, 33]],
  [[0, -12], [17, -25], [36, -34], [54, -38]],
  [[0, 9], [-14, 20], [-34, 31], [-52, 42]],
  [[0, -12], [0, -39], [0, -65], [0, -76]]
];

function distToSegment(x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((x - x1) * dx + (z - z1) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}
function pathDistance(x, z) {
  let best = Infinity;
  for (const route of PATHS) {
    for (let i = 0; i < route.length - 1; i++) {
      const d = distToSegment(x, z, route[i][0], route[i][1], route[i + 1][0], route[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}
function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = 2.15
    + 1.8 * Math.sin(x * 0.043 + 0.4)
    + 1.45 * Math.cos(z * 0.056 + 1.1)
    + 0.8 * Math.sin((x + z) * 0.109)
    + 0.45 * Math.cos((x - z) * 0.16);
  h += 7.4 * gauss(x, z, 58, -40, 500);
  h += 4.2 * gauss(x, z, -44, -30, 700);
  h += 2.7 * gauss(x, z, -52, 42, 560);
  h -= 4.6 * gauss(x, z, 52, 33, 280);
  h += 2.4 * gauss(x, z, 22, 58, 420);
  const flat = 1 - smoothstep(9, 25, r);
  h = lerp(h, 4.15, flat * 0.74);
  const coast = smoothstep(89, 118, r);
  h -= coast * coast * 23;
  return h;
}
function groundAt(x, z) { return heightAt(x, z); }

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(245, 245, 132, 132);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const cGrass1 = new THREE.Color(0x41663f);
  const cGrass2 = new THREE.Color(0x274a37);
  const cDry = new THREE.Color(0x7f8550);
  const cRock = new THREE.Color(0x657064);
  const cSand = new THREE.Color(0xb7a170);
  const cPath = new THREE.Color(0x9d8b61);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const dx = heightAt(x + 1.3, z) - heightAt(x - 1.3, z);
    const dz = heightAt(x, z + 1.3) - heightAt(x, z - 1.3);
    const slope = Math.hypot(dx, dz) / 2.6;
    const noise = 0.5 + 0.5 * Math.sin(x * 0.28 + z * 0.19) * Math.cos(x * 0.12 - z * 0.31);
    tmp.copy(cGrass1).lerp(cGrass2, noise * 0.7 + 0.1);
    tmp.lerp(cDry, smoothstep(5.5, 11.5, h) * 0.46);
    tmp.lerp(cRock, smoothstep(0.34, 0.9, slope) * 0.72);
    tmp.lerp(cSand, smoothstep(0.3, -1.8, h) * 0.8);
    const pd = pathDistance(x, z);
    tmp.lerp(cPath, smoothstep(3.7, 0.35, pd) * 0.46);
    const moss = 0.94 + 0.06 * Math.sin(x * 0.9) * Math.cos(z * 0.7);
    colors.push(tmp.r * moss, tmp.g * moss, tmp.b * moss);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0.01 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

const terrain = buildTerrain();
scene.add(terrain);

/* ---------------- water, mountains, horizon ---------------- */
const waterUniforms = {
  uTime: { value: 0 },
  uDeep: { value: new THREE.Color(0x0b3438) },
  uShallow: { value: new THREE.Color(0x3c8f86) },
  uFog: { value: new THREE.Color(0x9ab7a6) },
  uSun: { value: sunDirection }
};
const waterMat = new THREE.ShaderMaterial({
  uniforms: waterUniforms,
  transparent: true,
  depthWrite: false,
  vertexShader: `
    uniform float uTime;
    varying vec3 vWorld;
    varying float vWave;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float w1 = sin(wp.x * 0.13 + uTime * 0.75) * 0.22;
      float w2 = cos(wp.z * 0.11 + uTime * 0.54) * 0.18;
      wp.y += w1 + w2;
      vWave = w1 + w2;
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uDeep, uShallow, uFog, uSun;
    varying vec3 vWorld;
    varying float vWave;
    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 2.5);
      vec3 normal = normalize(vec3(0.11 * sin(vWorld.x * 0.2 + uTime * 0.8), 1.0, 0.11 * cos(vWorld.z * 0.18 + uTime * 0.65)));
      float spec = pow(max(dot(reflect(-normalize(uSun), normal), viewDir), 0.0), 75.0);
      float bands = 0.5 + 0.5 * sin(vWorld.x * 0.42 + uTime * 0.9 + sin(vWorld.z * 0.25) * 1.7);
      vec3 col = mix(uDeep, uShallow, fres * 0.9 + bands * 0.09);
      col += vec3(1.0, 0.73, 0.42) * spec * 2.2;
      float radial = length(vWorld.xz);
      float foam = smoothstep(0.48, 0.72, sin(radial * 0.21 - uTime * 0.55 + vWave * 2.0) * 0.5 + 0.5);
      foam *= smoothstep(78.0, 98.0, radial) * (1.0 - smoothstep(112.0, 131.0, radial));
      col += vec3(0.68, 0.9, 0.79) * foam * 0.16;
      float dist = distance(cameraPosition, vWorld);
      col = mix(col, uFog, smoothstep(70.0, 235.0, dist) * 0.66);
      gl_FragColor = vec4(col, 0.9);
    }
  `
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(620, 620, 1, 1), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -2.75;
water.renderOrder = -1;
scene.add(water);

const mountains = new THREE.Group();
const mountainColors = [0x3d5a52, 0x35514b, 0x2c4845];
for (let i = 0; i < 26; i++) {
  const a = (i / 26) * TAU + wr(-0.05, 0.05);
  const r = wr(152, 228);
  const h = wr(13, 38);
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(wr(13, 31), h, wr(4, 6) | 0),
    new THREE.MeshStandardMaterial({ color: mountainColors[i % 3], roughness: 1, flatShading: true })
  );
  m.position.set(Math.cos(a) * r, -8 + h * 0.5, Math.sin(a) * r);
  m.rotation.y = wr(0, TAU);
  m.scale.x = wr(0.8, 1.7);
  mountains.add(m);
}
scene.add(mountains);
/* ---------------- shared materials and textures ---------------- */
function std(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.04, flatShading: true, ...options });
}
function glowMat(color, intensity = 1.6, options = {}) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.35, metalness: 0.1, flatShading: true, ...options });
}
function addMesh(parent, geo, material, x = 0, y = 0, z = 0, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const GLOW_TEX = glowTexture();

/* ---------------- world data ---------------- */
const POIS = [
  { id: 'beacon', name: 'BEACON ALPHA', x: 0, z: 0, type: 'beacon' },
  { id: 'grove', name: 'WHISPER GROVE', x: -44, z: -28, type: 'grove' },
  { id: 'ridge', name: 'EMBER RIDGE', x: 54, z: -38, type: 'ridge' },
  { id: 'shrine', name: 'SUNKEN SHRINE', x: 52, z: 33, type: 'shrine' },
  { id: 'ruins', name: 'NIGHTFALL RUINS', x: -52, z: 42, type: 'ruins' },
  { id: 'camp', name: 'HOLLOW CAMP', x: 25, z: -15, type: 'camp' },
  { id: 'gate', name: 'RIFT GATE', x: 0, z: -78, type: 'gate' }
];
const worldAnim = {
  rings: [], crystals: [], floating: [], beaconCrystal: null, gateRing: null, gateShield: null,
  gatePortal: null, gateLight: null, campFire: null, fireflies: null, ruinsStones: [], grassShader: null,
  shrineCrystal: null, gateBraziers: []
};
const crates = [];
let terrainReady = false;

function buildVegetation() {
  // trees
  const treeData = [];
  let attempts = 0;
  while (treeData.length < 78 && attempts++ < 900) {
    const a = wr(0, TAU), r = Math.sqrt(worldRand()) * 88;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = groundAt(x, z);
    if (h < 1.1 || h > 12.8) continue;
    if (Math.hypot(x, z) < 13) continue;
    if (pathDistance(x, z) < 3.9) continue;
    if (POIS.some(p => Math.hypot(x - p.x, z - p.z) < 8 + (p.id === 'beacon' ? 6 : 0))) continue;
    if (treeData.some(t => Math.hypot(t.x - x, t.z - z) < 5.5)) continue;
    treeData.push({ x, z, y: h, s: wr(0.78, 1.55), h: wr(2.7, 6.8), rot: wr(0, TAU), tint: worldRand() });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.38, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = std(0x4a3e2f, { roughness: 0.97 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeData.length);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 0);
  const canopyMat = std(0xffffff, { roughness: 0.9, flatShading: true });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeData.length * 2);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  treeData.forEach((t, i) => {
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.set(t.s, t.h, t.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let j = 0; j < 2; j++) {
      dummy.position.set(t.x + wr(-0.65, 0.65) * t.s, t.y + t.h * (0.82 + j * 0.2), t.z + wr(-0.65, 0.65) * t.s);
      dummy.rotation.set(wr(-0.15, 0.15), t.rot + j * 1.7, wr(-0.15, 0.15));
      dummy.scale.set((2.1 - j * 0.25) * t.s, (1.45 - j * 0.16) * t.s, (1.9 - j * 0.1) * t.s);
      dummy.updateMatrix();
      canopies.setMatrixAt(i * 2 + j, dummy.matrix);
      if (t.tint > 0.91) col.setHex(j ? 0x9a6f8d : 0x7d5779);
      else if (t.tint > 0.74) col.setHex(j ? 0x9a9a4f : 0x657f42);
      else col.setHex(j ? 0x5b7d4b : 0x315c44);
      canopies.setColorAt(i * 2 + j, col);
    }
  });
  trunks.castShadow = true; trunks.receiveShadow = true;
  canopies.castShadow = true; canopies.receiveShadow = true;
  scene.add(trunks, canopies);

  // grass blades, two crossed ribbons for volume
  const positions = [], indices = [], normals = [];
  const addQuad = (axis) => {
    const base = positions.length / 3;
    const w = 0.055;
    if (axis === 0) {
      positions.push(-w, 0, 0, w, 0, 0, w * 0.28, 1, 0, -w * 0.28, 1, 0);
    } else {
      positions.push(0, 0, -w, 0, 0, w, 0, 1, w * 0.28, 0, 1, -w * 0.28);
    }
    for (let k = 0; k < 4; k++) normals.push(axis === 0 ? 0 : 1, 0, axis === 0 ? 1 : 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  addQuad(0); addQuad(1);
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bladeGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  bladeGeo.setIndex(indices);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      #ifdef USE_INSTANCING
        float gSway = sin(uTime * 1.7 + instanceMatrix[3].x * 0.71 + instanceMatrix[3].z * 0.43);
        float gSway2 = cos(uTime * 1.1 + instanceMatrix[3].x * 0.33);
        transformed.x += (gSway * 0.11 + gSway2 * 0.06) * position.y;
        transformed.z += gSway2 * 0.045 * position.y;
      #endif
    `);
    worldAnim.grassShader = shader;
  };
  grassMat.customProgramCacheKey = () => 'wildline-grass';
  const GRASS_COUNT = 2300;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS_COUNT);
  const gcol = new THREE.Color();
  for (let i = 0; i < GRASS_COUNT; i++) {
    const a = wr(0, TAU), r = Math.sqrt(worldRand()) * 91;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = groundAt(x, z);
    if (y < 0.75 || pathDistance(x, z) < 2.1) { i--; continue; }
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, wr(0, TAU), 0);
    dummy.scale.set(wr(0.65, 1.2), wr(0.55, 1.55), wr(0.65, 1.2));
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    gcol.setHSL(wr(0.19, 0.28), wr(0.25, 0.5), wr(0.27, 0.46));
    grass.setColorAt(i, gcol);
  }
  grass.receiveShadow = true;
  scene.add(grass);

  // scattered stones
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = std(0x59645b, { roughness: 0.98 });
  const ROCK_COUNT = 62;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
  for (let i = 0; i < ROCK_COUNT; i++) {
    const a = wr(0, TAU), r = Math.sqrt(worldRand()) * 87;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = groundAt(x, z);
    if (y < 0.3 || POIS.some(p => Math.hypot(x - p.x, z - p.z) < 7)) { i--; continue; }
    dummy.position.set(x, y + wr(0.05, 0.7), z);
    dummy.rotation.set(wr(0, TAU), wr(0, TAU), wr(0, TAU));
    dummy.scale.set(wr(0.35, 1.8), wr(0.25, 1.1), wr(0.35, 1.6));
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    gcol.setHSL(wr(0.2, 0.3), 0.08, wr(0.29, 0.45));
    rocks.setColorAt(i, gcol);
  }
  rocks.castShadow = true; rocks.receiveShadow = true;
  scene.add(rocks);

  // luminous flowers
  const flowerPositions = [];
  for (let i = 0; i < 220; i++) {
    const a = wr(0, TAU), r = Math.sqrt(worldRand()) * 88;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = groundAt(x, z);
    if (y < 1) continue;
    flowerPositions.push(x, y + 0.16, z);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(flowerPositions, 3));
  const flowers = new THREE.Points(fg, new THREE.PointsMaterial({
    map: GLOW_TEX, color: 0xd7ff8e, size: 0.19, transparent: true, opacity: 0.82,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  scene.add(flowers);

  // drifting motes
  const motePositions = [];
  for (let i = 0; i < 180; i++) motePositions.push(wr(-95, 95), wr(0.5, 15), wr(-95, 95));
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(motePositions, 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({
    map: GLOW_TEX, color: 0xb7e9c4, size: 0.12, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  motes.userData.phase = wr(0, TAU);
  worldAnim.motes = motes;
  scene.add(motes);
}

/* ---------------- landmarks ---------------- */
function buildBeacon() {
  const g = new THREE.Group();
  const baseY = groundAt(0, 0);
  g.position.set(0, baseY, 0);
  const stone = std(0x3f4a42, { roughness: 0.96 });
  const stone2 = std(0x56645a, { roughness: 0.9 });
  addMesh(g, new THREE.CylinderGeometry(6.6, 7.4, 0.55, 8), stone, 0, 0, 0);
  addMesh(g, new THREE.CylinderGeometry(4.9, 5.6, 0.5, 8), stone2, 0, 0.48, 0);
  addMesh(g, new THREE.CylinderGeometry(3.3, 3.8, 0.45, 8), stone, 0, 0.94, 0);
  const runeMat = glowMat(0xc8f36a, 2.6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    addMesh(g, new THREE.BoxGeometry(0.13, 0.025, 1.3), runeMat, Math.cos(a) * 4.4, 0.76, Math.sin(a) * 4.4, false, false).rotation.y = -a;
  }
  addMesh(g, new THREE.CylinderGeometry(1.05, 1.38, 2.6, 6), stone2, 0, 2.25, 0);
  addMesh(g, new THREE.CylinderGeometry(0.58, 0.74, 0.48, 6), runeMat, 0, 3.7, 0, false, false);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), glowMat(0xc8f36a, 3.8, { metalness: 0.2 }));
  crystal.position.y = 4.9;
  crystal.scale.set(0.72, 1.65, 0.72);
  g.add(crystal);
  worldAnim.beaconCrystal = crystal;
  const ringMat = glowMat(0xc8f36a, 2.2, { transparent: true, opacity: 0.7 });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.045, 4, 40), ringMat);
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = 4.9;
  g.add(ring1); worldAnim.rings.push({ mesh: ring1, speed: 0.7, axis: 'z', y: 4.9 });
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.03, 4, 40), ringMat);
  ring2.rotation.x = Math.PI / 2.8;
  ring2.position.y = 4.9;
  g.add(ring2); worldAnim.rings.push({ mesh: ring2, speed: -0.45, axis: 'x', y: 4.9 });
  const light = new THREE.PointLight(0xc8f36a, 38, 26, 2);
  light.position.y = 4.8;
  g.add(light);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xc8f36a, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }));
  sprite.scale.set(7, 7, 1);
  sprite.position.y = 4.9;
  g.add(sprite);
  scene.add(g);
}

function buildGrove() {
  const g = new THREE.Group();
  const y = groundAt(-44, -28);
  g.position.set(-44, y, -28);
  const bark = std(0x3c322a, { roughness: 1 });
  const trunk = addMesh(g, new THREE.CylinderGeometry(1.0, 2.1, 9, 8), bark, 0, 4.4, 0);
  trunk.rotation.z = 0.05;
  const canopyMats = [std(0x2a5341), std(0x3d6847), std(0x536e47), std(0x795d77)];
  const clusters = [
    [0, 10.2, 0, 5.4], [-3.7, 8.8, 1.2, 3.8], [3.8, 9.1, -0.7, 3.5],
    [1.5, 11.6, 2.1, 3.4], [-2.1, 11.2, -2.2, 3.2], [0.4, 8.0, 3.3, 2.8]
  ];
  clusters.forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(c[3], 1), canopyMats[i % 4]);
    m.position.set(c[0], c[1], c[2]);
    m.rotation.set(wr(0, 1), wr(0, 1), wr(0, 1));
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  });
  // hanging luminous pods
  const glow = glowMat(0xc8f36a, 3.2);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), glow);
    pod.position.set(Math.cos(a) * wr(2.4, 4.2), wr(5.2, 8.5), Math.sin(a) * wr(2.4, 4.2));
    g.add(pod);
    worldAnim.crystals.push({ mesh: pod, base: pod.position.y, phase: wr(0, 6), amp: 0.25 });
  }
  // mushrooms
  const capMat = glowMat(0x9ee85d, 1.9);
  const stemMat = std(0xbfc7a0);
  for (let i = 0; i < 12; i++) {
    const a = wr(0, TAU), r = wr(4, 9);
    const mx = Math.cos(a) * r, mz = Math.sin(a) * r;
    const s = wr(0.5, 1.2);
    const stem = addMesh(g, new THREE.CylinderGeometry(0.1 * s, 0.17 * s, 0.8 * s, 5), stemMat, mx, 0.4 * s, mz);
    const cap = addMesh(g, new THREE.SphereGeometry(0.4 * s, 7, 4, 0, TAU, 0, Math.PI * 0.55), capMat, mx, 0.82 * s, mz, false, false);
    cap.scale.y = 0.5;
    stem.castShadow = false;
  }
  // fireflies
  const pos = [];
  for (let i = 0; i < 55; i++) pos.push(wr(-11, 11), wr(1, 9), wr(-11, 11));
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const flies = new THREE.Points(fg, new THREE.PointsMaterial({
    map: GLOW_TEX, color: 0xd9ff9c, size: 0.24, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  g.add(flies);
  worldAnim.fireflies = flies;
  scene.add(g);
}

function buildShrine() {
  const g = new THREE.Group();
  const y = groundAt(52, 33);
  g.position.set(52, y, 33);
  const stone = std(0x4a554e, { roughness: 0.92 });
  const stoneDark = std(0x333f3a, { roughness: 1 });
  addMesh(g, new THREE.CylinderGeometry(6.8, 7.4, 0.45, 7), stoneDark, 0, 0.05, 0);
  addMesh(g, new THREE.CylinderGeometry(5.2, 5.7, 0.35, 7), stone, 0, 0.38, 0);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0x64dfd7, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
  const pool = addMesh(g, new THREE.CircleGeometry(4.2, 32), poolMat, 0, 0.6, 0, false, false);
  pool.rotation.x = -Math.PI / 2;
  const runeMat = glowMat(0x79d9e3, 2.5);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.045, 4, 48), runeMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.64; g.add(ring);
  worldAnim.rings.push({ mesh: ring, speed: 0.28, axis: 'y', y: 0.64 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const col = new THREE.Group();
    col.position.set(Math.cos(a) * 5.7, 0.3, Math.sin(a) * 5.7);
    col.rotation.y = -a;
    col.rotation.z = i === 1 || i === 4 ? 0.22 : 0;
    addMesh(col, new THREE.BoxGeometry(0.62, 3.9, 0.62), stone, 0, 1.95, 0);
    addMesh(col, new THREE.BoxGeometry(0.9, 0.25, 0.9), stoneDark, 0, 3.95, 0);
    addMesh(col, new THREE.BoxGeometry(0.64, 0.1, 0.64), runeMat, 0, 3.05, 0, false, false);
    g.add(col);
  }
  const crystalMat = glowMat(0x79d9e3, 3);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), crystalMat);
  crystal.position.y = 2.3;
  crystal.scale.set(0.75, 1.5, 0.75);
  g.add(crystal);
  worldAnim.shrineCrystal = crystal;
  const light = new THREE.PointLight(0x79d9e3, 22, 22, 2);
  light.position.y = 2.8;
  g.add(light);
  scene.add(g);
}

function buildRidge() {
  const g = new THREE.Group();
  const y = groundAt(54, -38);
  g.position.set(54, y, -38);
  const rock = std(0x4b443b, { roughness: 1 });
  const crystalMat = glowMat(0xff8b57, 2.4, { metalness: 0.15 });
  for (let i = 0; i < 9; i++) {
    const a = wr(0, TAU), r = wr(2.2, 8.5);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const s = wr(0.5, 1.4);
    const cr = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, wr(2, 5.2) * s, 5), crystalMat);
    cr.position.set(cx, 1.6 * s, cz);
    cr.rotation.z = wr(-0.22, 0.22);
    cr.rotation.x = wr(-0.18, 0.18);
    cr.castShadow = true;
    g.add(cr);
    worldAnim.crystals.push({ mesh: cr, base: cr.position.y, phase: wr(0, 6), amp: 0.28 });
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(wr(0.7, 1.7) * s, 0), rock);
    boulder.position.set(cx, 0.35 * s, cz);
    boulder.rotation.set(wr(0, 1), wr(0, 1), wr(0, 1));
    boulder.castShadow = true; boulder.receiveShadow = true;
    g.add(boulder);
  }
  const crackMat = glowMat(0xff6f3d, 2.1);
  for (let i = 0; i < 12; i++) {
    const c = addMesh(g, new THREE.BoxGeometry(wr(0.6, 2.2), 0.025, 0.09), crackMat, wr(-7, 7), 0.22, wr(-7, 7), false, false);
    c.rotation.y = wr(0, TAU);
  }
  const light = new THREE.PointLight(0xff804f, 20, 18, 2);
  light.position.y = 2.4;
  g.add(light);
  scene.add(g);
}

function buildRuins() {
  const g = new THREE.Group();
  const y = groundAt(-52, 42);
  g.position.set(-52, y, 42);
  const stone = std(0x4c4c43, { roughness: 1 });
  const stone2 = std(0x666454, { roughness: 0.95 });
  const rune = glowMat(0xb991ff, 2.6);
  addMesh(g, new THREE.BoxGeometry(3.8, 0.4, 3.8), stone2, 0, 0.2, 0);
  const colA = new THREE.Group(); colA.position.set(-3.2, 0.4, 0); colA.rotation.z = -0.07; g.add(colA);
  addMesh(colA, new THREE.BoxGeometry(0.9, 6.5, 0.9), stone, 0, 3.25, 0);
  const colB = new THREE.Group(); colB.position.set(3.2, 0.4, 0); colB.rotation.z = 0.04; g.add(colB);
  addMesh(colB, new THREE.BoxGeometry(0.9, 7.2, 0.9), stone, 0, 3.6, 0);
  addMesh(g, new THREE.BoxGeometry(8.1, 0.9, 1.1), stone2, 0, 7.35, 0);
  addMesh(g, new THREE.BoxGeometry(5.4, 0.2, 0.16), rune, 0, 7.25, 0, false, false);
  addMesh(g, new THREE.BoxGeometry(1.5, 4.4, 1.1), stone, 0, 2.4, 1.1);
  addMesh(g, new THREE.BoxGeometry(0.16, 2.8, 0.16), rune, 0, 2.55, 1.67, false, false);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(wr(0.35, 1.1), wr(0.4, 2.3), wr(0.4, 0.9)), stone);
    b.position.set(wr(-6, 6), wr(0.2, 2.4), wr(-4, 3));
    b.rotation.set(wr(-0.25, 0.25), wr(0, 1), wr(-0.25, 0.25));
    b.castShadow = true;
    g.add(b);
  }
  const shardMat = glowMat(0xb991ff, 3);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(wr(0.18, 0.4), 0), shardMat);
    s.position.set(wr(-2.6, 2.6), wr(2.2, 5.7), wr(-2, 2));
    g.add(s);
    worldAnim.ruinsStones.push({ mesh: s, base: s.position.y, phase: wr(0, 6), amp: 0.3, rot: wr(-0.5, 0.5) });
  }
  const light = new THREE.PointLight(0xb991ff, 16, 17, 2);
  light.position.y = 2.8;
  g.add(light);
  scene.add(g);
}

function buildGate() {
  const g = new THREE.Group();
  const y = groundAt(0, -78);
  g.position.set(0, y, -78);
  const stone = std(0x353a39, { roughness: 1 });
  const stone2 = std(0x4d4c46, { roughness: 0.94 });
  const runeMat = glowMat(0xff855b, 2.4);
  // stairs
  for (let i = 0; i < 4; i++) addMesh(g, new THREE.BoxGeometry(13 - i * 0.9, 0.38, 1.1), stone2, 0, 0.18 + i * 0.32, 6.3 - i * 0.62);
  // pillars
  for (const side of [-1, 1]) {
    const py = new THREE.Group();
    py.position.x = side * 5.5;
    addMesh(py, new THREE.BoxGeometry(1.8, 10.6, 2.2), stone, 0, 5.3, 0);
    addMesh(py, new THREE.BoxGeometry(2.3, 0.5, 2.7), stone2, 0, 0.25, 0);
    addMesh(py, new THREE.BoxGeometry(2.2, 0.35, 2.6), stone2, 0, 10.5, 0);
    for (let i = 0; i < 3; i++) addMesh(py, new THREE.BoxGeometry(0.11, 1.15, 0.08), runeMat, side * -0.92, 3.2 + i * 1.3, 0.9, false, false);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.3, 4), runeMat);
    spike.position.set(side * 1.4, 11.7, 0);
    py.add(spike);
    g.add(py);
  }
  addMesh(g, new THREE.BoxGeometry(12.8, 0.9, 2.3), stone, 0, 10.65, 0);
  addMesh(g, new THREE.BoxGeometry(7.8, 0.22, 0.1), runeMat, 0, 10.65, 1.16, false, false);
  // portal ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.18, 6, 56), glowMat(0xff825c, 2.7));
  ring.position.y = 5.2;
  ring.castShadow = true;
  g.add(ring);
  worldAnim.gateRing = ring;
  // swirl shader
  const portalMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColorA: { value: new THREE.Color(0x5a1d18) }, uColorB: { value: new THREE.Color(0xff8c5f) }, uOpen: { value: 0.25 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime, uOpen; uniform vec3 uColorA, uColorB;
      void main(){
        vec2 p = vUv - 0.5; float r = length(p)*2.0; float a = atan(p.y,p.x);
        float swirl = sin(a*5.0 + r*11.0 - uTime*1.8)*0.5+0.5;
        float ring = smoothstep(1.0,0.78,r);
        vec3 col = mix(uColorA,uColorB,swirl*0.8+0.2);
        float alpha = ring * (0.14 + swirl*0.28*uOpen);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });
  const portal = new THREE.Mesh(new THREE.CircleGeometry(4.05, 48), portalMat);
  portal.position.y = 5.2;
  g.add(portal);
  worldAnim.gatePortal = portalMat;
  const shield = new THREE.Mesh(new THREE.SphereGeometry(5.1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff805a, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  shield.position.y = 5.2;
  g.add(shield);
  worldAnim.gateShield = shield;
  const light = new THREE.PointLight(0xff855b, 30, 35, 2);
  light.position.set(0, 5, 1.5);
  g.add(light);
  worldAnim.gateLight = light;
  // braziers
  for (const side of [-1, 1]) {
    const bowl = addMesh(g, new THREE.CylinderGeometry(0.55, 0.28, 0.75, 6), stone2, side * 4.6, 1.2, 3.2);
    const flameMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xff8f5a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const flame = new THREE.Sprite(flameMat);
    flame.scale.set(2.1, 3.1, 1);
    flame.position.set(side * 4.6, 2.2, 3.2);
    g.add(flame);
    worldAnim.gateBraziers.push(flame);
  }
  scene.add(g);
}

function buildCamp() {
  const g = new THREE.Group();
  const y = groundAt(25, -15);
  g.position.set(25, y, -15);
  const cloth = std(0x56433a, { roughness: 1 });
  const metal = std(0x353b39, { roughness: 0.8, metalness: 0.4 });
  const ember = glowMat(0xff804f, 1.8);
  // tents
  for (const t of [[-4.5, -1.5, 0.7], [4.8, 1.8, -0.4]]) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.9, 4), cloth);
    tent.position.set(t[0], 1.45, t[1]);
    tent.rotation.y = t[2];
    tent.castShadow = true; tent.receiveShadow = true;
    g.add(tent);
  }
  // fire
  const logs = new THREE.Group(); logs.position.set(0, 0.2, 0);
  for (let i = 0; i < 4; i++) {
    const l = addMesh(logs, new THREE.CylinderGeometry(0.08, 0.1, 1.2, 4), metal, 0, 0.1, 0);
    l.rotation.z = Math.PI / 2; l.rotation.y = (i / 4) * TAU;
  }
  const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xff9457, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  fire.scale.set(1.8, 3.0, 1); fire.position.y = 1.1; logs.add(fire);
  const fireLight = new THREE.PointLight(0xff8a4f, 18, 14, 2); fireLight.position.y = 1.6; logs.add(fireLight);
  worldAnim.campFire = fire;
  g.add(logs);
  // crates
  const crateMat = std(0x6a4d33, { roughness: 0.95 });
  const cratePositions = [[-2.3, 2.7], [2.2, 2.2], [4.1, -2.2]];
  for (const [cx, cz] of cratePositions) {
    const crate = addMesh(g, new THREE.BoxGeometry(1.1, 1.1, 1.1), crateMat, cx, 0.58, cz);
    addMesh(crate, new THREE.BoxGeometry(1.15, 0.1, 1.15), metal, 0, 0.3, 0);
    addMesh(crate, new THREE.BoxGeometry(0.13, 1.12, 0.08), ember, 0, 0, 0.57, false, false);
    crates.push({ group: g, localX: cx, localZ: cz, x: 25 + cx, z: -15 + cz, opened: false });
  }
  // barricades
  for (let i = 0; i < 3; i++) {
    const b = addMesh(g, new THREE.BoxGeometry(2.8, 1.1, 0.28), metal, -3 + i * 3.1, 0.55, -4.2);
    b.rotation.y = wr(-0.15, 0.15);
  }
  scene.add(g);
}

function buildFloatingIslands() {
  const rockMat = std(0x3a4944, { roughness: 1 });
  const mossMat = std(0x53734d, { roughness: 0.95 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.7;
    const r = wr(60, 105);
    const baseY = wr(24, 39);
    const grp = new THREE.Group();
    grp.position.set(Math.cos(a) * r, baseY, Math.sin(a) * r);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(wr(2.4, 4.8), 0), rockMat);
    rock.scale.set(1.3, 0.7, 1.1); rock.castShadow = true; grp.add(rock);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(wr(1.8, 3.0), wr(1.2, 2.4), 0.35, 7), mossMat);
    top.position.y = 0.9; top.castShadow = true; grp.add(top);
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(wr(0.35, 0.7), 0), glowMat(i % 2 ? 0x79d9e3 : 0xc8f36a, 2.8));
    cr.position.y = 1.8; grp.add(cr);
    grp.userData.baseY = baseY; grp.userData.phase = wr(0, 6);
    worldAnim.floating.push(grp);
    scene.add(grp);
  }
}

function buildWorld() {
  buildBeacon();
  buildGrove();
  buildShrine();
  buildRidge();
  buildRuins();
  buildGate();
  buildCamp();
  buildVegetation();
  buildFloatingIslands();
  terrainReady = true;
}
/* ---------------- player + weapon models ---------------- */
function makePlayerModel() {
  const root = new THREE.Group();
  const cloth = std(0x2a3d32, { roughness: 0.95 });
  const vest = std(0x38483a, { roughness: 0.9 });
  const dark = std(0x182720, { roughness: 0.9 });
  const skin = std(0xb88f6d, { roughness: 0.8 });
  const lime = glowMat(0xc8f36a, 1.5);
  const boot = std(0x1c2821, { roughness: 1 });
  const torso = new THREE.Group();
  torso.position.y = 1.18;
  addMesh(torso, new THREE.BoxGeometry(0.66, 0.72, 0.38), cloth, 0, 0, 0);
  addMesh(torso, new THREE.BoxGeometry(0.72, 0.42, 0.43), vest, 0, 0.06, 0);
  addMesh(torso, new THREE.BoxGeometry(0.5, 0.05, 0.06), lime, 0, 0.21, -0.22, false, false);
  addMesh(torso, new THREE.BoxGeometry(0.28, 0.18, 0.24), lime, 0.21, 0.12, -0.23, false, false).scale.set(1, 1, 0.3);
  addMesh(torso, new THREE.BoxGeometry(0.56, 0.5, 0.2), dark, 0, 0.02, 0.27);
  addMesh(torso, new THREE.BoxGeometry(0.33, 0.24, 0.13), dark, 0, -0.02, 0.39);
  root.add(torso);
  const neck = addMesh(root, new THREE.CylinderGeometry(0.1, 0.12, 0.15, 6), skin, 0, 1.61, 0);
  const head = new THREE.Group();
  head.position.y = 1.83;
  addMesh(head, new THREE.SphereGeometry(0.235, 9, 7), skin, 0, 0, 0);
  const helmet = addMesh(head, new THREE.SphereGeometry(0.27, 8, 6, 0, TAU, 0, Math.PI * 0.63), vest, 0, 0.06, 0);
  helmet.rotation.x = -0.1;
  addMesh(head, new THREE.BoxGeometry(0.36, 0.13, 0.08), dark, 0, -0.01, -0.21);
  addMesh(head, new THREE.BoxGeometry(0.28, 0.045, 0.035), glowMat(0xc8f36a, 2.2), 0, -0.005, -0.255, false, false);
  addMesh(head, new THREE.CylinderGeometry(0.035, 0.05, 0.28, 5), dark, 0.25, 0.1, 0);
  head.userData.part = 'head';
  root.add(head);
  const scarf = addMesh(root, new THREE.TorusGeometry(0.22, 0.075, 5, 12), std(0x91b35b), 0, 1.59, 0);
  scarf.rotation.x = Math.PI / 2;
  const tailScarf = addMesh(root, new THREE.BoxGeometry(0.24, 0.65, 0.05), std(0x91b35b), -0.25, 1.36, 0.26);
  tailScarf.rotation.z = 0.47;
  const armL = new THREE.Group(); armL.position.set(-0.43, 1.48, 0);
  addMesh(armL, new THREE.BoxGeometry(0.17, 0.58, 0.18), cloth, 0, -0.28, 0);
  addMesh(armL, new THREE.BoxGeometry(0.15, 0.26, 0.17), dark, 0, -0.62, -0.02);
  armL.rotation.z = -0.18; root.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.43, 1.48, 0);
  addMesh(armR, new THREE.BoxGeometry(0.17, 0.58, 0.18), cloth, 0, -0.28, 0);
  addMesh(armR, new THREE.BoxGeometry(0.15, 0.26, 0.17), dark, 0, -0.62, -0.05);
  armR.rotation.z = 0.23; armR.rotation.x = -0.6; root.add(armR);
  const legL = new THREE.Group(); legL.position.set(-0.19, 0.88, 0);
  addMesh(legL, new THREE.BoxGeometry(0.21, 0.62, 0.24), dark, 0, -0.3, 0);
  addMesh(legL, new THREE.BoxGeometry(0.24, 0.2, 0.43), boot, 0, -0.65, -0.09);
  root.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.19, 0.88, 0);
  addMesh(legR, new THREE.BoxGeometry(0.21, 0.62, 0.24), dark, 0, -0.3, 0);
  addMesh(legR, new THREE.BoxGeometry(0.24, 0.2, 0.43), boot, 0, -0.65, -0.09);
  root.add(legR);
  root.userData.parts = { torso, head, armL, armR, legL, legR, scarf, tailScarf };
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // world weapon lives in right hand
  const hand = new THREE.Group();
  hand.position.set(0.38, 1.1, -0.43);
  hand.rotation.x = 0.05;
  root.add(hand);
  root.userData.hand = hand;
  return root;
}

function weaponMaterialSet(accent, viewmodel = false) {
  return {
    dark: new THREE.MeshStandardMaterial({ color: 0x1c2420, roughness: viewmodel ? 0.62 : 0.52, metalness: viewmodel ? 0.35 : 0.7, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ color: 0x4f5d57, roughness: viewmodel ? 0.5 : 0.35, metalness: viewmodel ? 0.35 : 0.82, flatShading: true }),
    grip: new THREE.MeshStandardMaterial({ color: 0x2b2c24, roughness: 0.95, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: viewmodel ? 0.5 : 1.6, roughness: 0.4, metalness: 0.1, flatShading: true })
  };
}
function makeWeaponModel(type, viewmodel = false) {
  const root = new THREE.Group();
  const accent = type === 'manticore' ? 0xffb56b : type === 'sidewinder' ? 0x79d9e3 : type === 'cleaver' ? 0xff875f : 0xc8f36a;
  const m = weaponMaterialSet(accent, viewmodel);
  const box = (w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) => {
    const mesh = addMesh(root, new THREE.BoxGeometry(w, h, d), mat, x, y, z, false, false);
    mesh.rotation.set(rx, ry, rz);
    return mesh;
  };
  let length = 0.8, muzzleY = 0.02;
  if (type === 'rifle') {
    length = 0.95;
    box(0.16, 0.18, 0.62, 0, 0, -0.08, m.dark);
    box(0.13, 0.12, 0.5, 0, 0.02, -0.52, m.metal);
    box(0.055, 0.055, 0.38, 0, 0.035, -0.88, m.dark);
    box(0.09, 0.08, 0.12, 0, 0.015, -1.06, m.metal);
    box(0.11, 0.25, 0.21, 0, -0.16, -0.1, m.grip, 0.08);
    box(0.07, 0.24, 0.2, 0, -0.13, 0.1, m.grip, -0.28);
    box(0.17, 0.15, 0.32, 0, 0.02, 0.32, m.dark);
    box(0.2, 0.07, 0.2, 0, 0.16, -0.06, m.dark);
    box(0.08, 0.025, 0.09, 0, 0.205, -0.06, m.accent);
    box(0.026, 0.13, 0.32, -0.083, 0.01, -0.13, m.accent, 0, 0, 0);
    box(0.026, 0.13, 0.32, 0.083, 0.01, -0.13, m.accent, 0, 0, 0);
    muzzleY = 0.02;
  } else if (type === 'manticore') {
    length = 1.05;
    box(0.22, 0.22, 0.64, 0, 0, -0.1, m.dark);
    box(0.17, 0.16, 0.48, 0, 0.02, -0.52, m.metal);
    box(0.12, 0.12, 0.5, 0, 0.03, -0.86, m.dark);
    box(0.16, 0.16, 0.14, 0, 0.03, -1.12, m.metal);
    box(0.14, 0.3, 0.26, 0, -0.18, -0.12, m.grip, 0.06);
    box(0.18, 0.16, 0.34, 0, 0.02, 0.28, m.dark);
    box(0.025, 0.08, 0.45, -0.115, 0.03, -0.25, m.accent);
    box(0.025, 0.08, 0.45, 0.115, 0.03, -0.25, m.accent);
    for (let i = 0; i < 4; i++) box(0.055, 0.055, 0.13, 0, 0.16, -0.45 - i * 0.12, m.accent);
    muzzleY = 0.03;
  } else if (type === 'sidewinder') {
    length = 0.52;
    box(0.14, 0.15, 0.38, 0, 0.04, -0.14, m.metal);
    box(0.12, 0.1, 0.22, 0, 0.02, -0.39, m.dark);
    box(0.11, 0.24, 0.14, 0, -0.13, -0.01, m.grip, 0.2);
    box(0.11, 0.08, 0.16, 0, 0.13, -0.09, m.dark);
    box(0.025, 0.06, 0.1, 0, 0.18, -0.09, m.accent);
    box(0.09, 0.1, 0.16, 0, 0.025, 0.08, m.metal);
    muzzleY = 0.03;
  } else if (type === 'cleaver') {
    length = 0.9;
    box(0.1, 0.11, 0.36, 0, 0, 0.1, m.grip);
    box(0.32, 0.06, 0.5, 0, 0.08, -0.34, m.metal);
    box(0.24, 0.035, 0.44, 0, 0.118, -0.38, m.dark);
    box(0.03, 0.05, 0.42, -0.17, 0.08, -0.38, m.accent);
    box(0.12, 0.08, 0.13, 0, 0.02, 0.3, m.accent);
    muzzleY = 0.08;
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, muzzleY, -length);
  root.add(muzzle);
  root.userData.muzzle = muzzle;
  const flashMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.55, 0.55, 1);
  flash.position.copy(muzzle.position);
  root.add(flash);
  root.userData.flash = flash;
  if (viewmodel) {
    // low-poly gloved hands, sized for the camera-space view model
    const glove = std(0x1b2822, { roughness: 0.9 });
    const sleeve = std(0x3d5041, { roughness: 0.95 });
    const r = new THREE.Group();
    r.position.set(0.16, -0.09, 0.16);
    addMesh(r, new THREE.BoxGeometry(0.16, 0.18, 0.22), glove, 0, 0, 0);
    addMesh(r, new THREE.BoxGeometry(0.19, 0.5, 0.21), sleeve, 0.01, -0.29, 0.11).rotation.x = -0.28;
    root.add(r);
    const l = new THREE.Group();
    l.position.set(-0.24, -0.06, -0.32);
    addMesh(l, new THREE.BoxGeometry(0.18, 0.16, 0.2), glove, 0, 0, 0);
    addMesh(l, new THREE.BoxGeometry(0.2, 0.48, 0.21), sleeve, -0.02, -0.26, 0.08).rotation.x = -0.45;
    l.rotation.z = -0.12;
    root.add(l);
  }
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return root;
}

/* ---------------- anima species ---------------- */
const SPECIES = {
  mossling: {
    name: 'MOSS BYTE', kind: 'MOSS LING', level: 4, element: 'NATURE', color: 0x9bd35d, accent: 0xc8f36a,
    hp: 130, speed: 2.2, aggro: 10, range: 2.7, damage: 9, melee: true, hover: 0, scale: 1.0,
    bio: 'A patient grove guardian with a hide of living moss.'
  },
  emberfox: {
    name: 'CINDER', kind: 'EMBER FOX', level: 5, element: 'EMBER', color: 0xf28a4d, accent: 0xffc46b,
    hp: 92, speed: 4.4, aggro: 18, range: 13, damage: 8, melee: false, hover: 0, scale: 0.92,
    bio: 'A spark-tailed hunter that never stops moving.'
  },
  voltfin: {
    name: 'ARC FIN', kind: 'VOLT FIN', level: 5, element: 'VOLT', color: 0x65cfd8, accent: 0xa5f5ff,
    hp: 108, speed: 3.5, aggro: 17, range: 14, damage: 10, melee: false, hover: 1.25, scale: 1.0,
    bio: 'A living current that drifts above the shallows.'
  },
  gloamwing: {
    name: 'DUSK WING', kind: 'GLOAM WING', level: 6, element: 'VOID', color: 0xa587d4, accent: 0xd7b9ff,
    hp: 84, speed: 4.1, aggro: 20, range: 12, damage: 11, melee: false, hover: 1.55, scale: 1.0,
    bio: 'A silent night hunter with wings full of old starlight.'
  },
  titanox: {
    name: 'TITANOX', kind: 'TITAN OX', level: 9, element: 'EARTH', color: 0xb8a06a, accent: 0xffd176,
    hp: 340, speed: 2.6, aggro: 13, range: 3.4, damage: 22, melee: true, hover: 0, scale: 1.55,
    bio: 'A living rampart. The island itself seems to move with it.'
  }
};
const WILD_SPAWNS = [
  { key: 'mossling', x: -42, z: -24 },
  { key: 'emberfox', x: 48, z: -34 },
  { key: 'voltfin', x: 47, z: 27 },
  { key: 'gloamwing', x: -47, z: 38 },
  { key: 'titanox', x: 63, z: 1 }
];

function makeEye(parent, x, y, z, color, size = 0.055) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 4), glowMat(color, 4.5, { metalness: 0 }));
  eye.position.set(x, y, z);
  parent.add(eye);
  return eye;
}

function makeAnimaModel(key) {
  const def = SPECIES[key];
  const root = new THREE.Group();
  const parts = {};
  const bodyMat = std(def.color, { roughness: 0.86 });
  const accentMat = glowMat(def.accent, 2.2);
  const darkMat = std(0x25332b, { roughness: 0.95 });
  const creamMat = std(key === 'emberfox' ? 0xffd9a6 : key === 'gloamwing' ? 0xded1ee : 0xc8d6ac, { roughness: 0.95 });
  if (key === 'mossling') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.76, 9, 7), bodyMat);
    body.position.y = 0.8; body.scale.set(1.2, 0.92, 1.07); body.castShadow = true; body.receiveShadow = true; root.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.54, 9, 7), bodyMat);
    head.position.set(0, 1.05, 0.48); head.scale.set(1.03, 0.9, 0.92); head.castShadow = true; root.add(head);
    parts.head = head;
    addMesh(root, new THREE.SphereGeometry(0.34, 8, 6), std(0x7e9d55), 0, 1.18, 0.08).scale.set(1.05, 0.45, 1);
    for (const side of [-1, 1]) {
      makeEye(root, side * 0.22, 1.13, 0.92, 0xd9ff87, 0.055);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 4), std(0x86a856));
      ear.position.set(side * 0.35, 1.55, 0.46); ear.rotation.z = side * -0.35; ear.rotation.x = 0.08; root.add(ear);
      parts['ear' + side] = ear;
      const leg = new THREE.Group(); leg.position.set(side * 0.43, 0.43, side * 0.28);
      addMesh(leg, new THREE.CylinderGeometry(0.13, 0.16, 0.48, 5), darkMat, 0, -0.18, 0);
      root.add(leg); parts['leg' + side] = leg;
    }
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.72, 4), std(i % 2 ? 0x8fb64e : 0x6f9345));
      leaf.position.set(wr(-0.55, 0.55), 1.35 + wr(-0.05, 0.12), wr(-0.5, 0.25));
      leaf.rotation.set(wr(-0.4, 0.4), wr(0, TAU), wr(-0.5, 0.5));
      root.add(leaf);
    }
    parts.tail = new THREE.Mesh(new THREE.SphereGeometry(0.23, 6, 4), accentMat);
    parts.tail.position.set(0, 0.65, -0.85); parts.tail.scale.set(0.6, 0.45, 0.8); root.add(parts.tail);
    parts.anim = (t, speed) => {
      root.position.y = Math.sin(t * 2.1) * 0.025;
      head.rotation.y = Math.sin(t * 0.8) * 0.13;
      parts['ear-1'].rotation.z = -0.35 + Math.sin(t * 2.7) * 0.08;
      parts['ear1'].rotation.z = 0.35 - Math.sin(t * 2.7) * 0.08;
      if (parts['leg-1']) parts['leg-1'].rotation.x = Math.sin(t * 6 + speed) * 0.4;
      if (parts['leg1']) parts['leg1'].rotation.x = -Math.sin(t * 6 + speed) * 0.4;
      parts.tail.scale.x = 0.6 + Math.sin(t * 3) * 0.08;
    };
  } else if (key === 'emberfox') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.52, 9, 7), bodyMat);
    body.position.y = 0.67; body.scale.set(0.86, 0.78, 1.45); body.castShadow = true; root.add(body);
    addMesh(body, new THREE.SphereGeometry(0.38, 8, 6), creamMat, 0, -0.06, 0.24).scale.set(0.8, 0.9, 0.7);
    const head = new THREE.Group(); head.position.set(0, 0.98, 0.58); root.add(head); parts.head = head;
    addMesh(head, new THREE.SphereGeometry(0.36, 8, 6), bodyMat, 0, 0, 0).scale.set(1, 0.9, 0.92);
    addMesh(head, new THREE.SphereGeometry(0.2, 7, 5), creamMat, 0, -0.1, 0.3).scale.set(0.8, 0.65, 1);
    addMesh(head, new THREE.SphereGeometry(0.06, 5, 4), darkMat, 0, -0.12, 0.49);
    for (const side of [-1, 1]) {
      makeEye(head, side * 0.15, 0.02, 0.31, 0xffe38b, 0.045);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 4), bodyMat);
      ear.position.set(side * 0.23, 0.32, -0.03); ear.rotation.z = side * -0.2; head.add(ear);
      parts['ear' + side] = ear;
      const leg = new THREE.Group(); leg.position.set(side * 0.28, 0.46, side * 0.2);
      addMesh(leg, new THREE.CylinderGeometry(0.08, 0.1, 0.52, 5), darkMat, 0, -0.2, 0);
      root.add(leg); parts['leg' + side] = leg;
    }
    const tail = new THREE.Group(); tail.position.set(0, 0.72, -0.7); root.add(tail); parts.tail = tail;
    addMesh(tail, new THREE.ConeGeometry(0.24, 0.75, 5), bodyMat, 0, 0.14, -0.32).rotation.x = -1.1;
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18 - i * 0.04, 0.55 - i * 0.08, 5), glowMat(i === 0 ? 0xffb05b : 0xff6a3e, 2.6));
      flame.position.set(wr(-0.08, 0.08), 0.45 + i * 0.2, -0.45); flame.rotation.z = wr(-0.3, 0.3); tail.add(flame);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xff8d4d, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0.7, -0.55); glow.scale.set(2.6, 2.6, 1); tail.add(glow);
    parts.anim = (t, speed) => {
      root.position.y = Math.sin(t * 3.3) * 0.03;
      tail.rotation.y = Math.sin(t * 3.2) * 0.28;
      tail.rotation.x = 0.08 + Math.sin(t * 2.1) * 0.08;
      head.rotation.y = Math.sin(t * 1.1) * 0.16;
      if (parts['leg-1']) parts['leg-1'].rotation.x = Math.sin(t * 8 + speed) * 0.45;
      if (parts['leg1']) parts['leg1'].rotation.x = -Math.sin(t * 8 + speed) * 0.45;
    };
  } else if (key === 'voltfin') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 9, 6), bodyMat);
    body.position.y = 0.92; body.scale.set(0.75, 0.7, 1.8); body.castShadow = true; root.add(body);
    addMesh(body, new THREE.SphereGeometry(0.3, 7, 5), creamMat, 0, -0.04, 0.25).scale.set(0.7, 0.45, 0.6);
    const head = new THREE.Group(); head.position.set(0, 1.02, 0.82); root.add(head); parts.head = head;
    addMesh(head, new THREE.SphereGeometry(0.28, 8, 6), bodyMat, 0, 0, 0).scale.set(0.9, 0.8, 1);
    for (const side of [-1, 1]) makeEye(head, side * 0.15, 0.05, 0.22, 0xbcffff, 0.048);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.55, 4), accentMat);
    horn.position.set(0, 0.32, 0.15); horn.rotation.x = -0.35; head.add(horn);
    const tail = new THREE.Group(); tail.position.set(0, 0.92, -0.86); root.add(tail); parts.tail = tail;
    addMesh(tail, new THREE.ConeGeometry(0.38, 0.75, 3), bodyMat, 0, 0, -0.32).rotation.x = Math.PI / 2;
    const dorsal = addMesh(root, new THREE.ConeGeometry(0.3, 0.52, 4), accentMat, 0, 1.3, -0.1);
    dorsal.rotation.x = -0.2;
    const fins = [];
    for (const side of [-1, 1]) {
      const fin = addMesh(root, new THREE.ConeGeometry(0.28, 0.65, 3), std(0x4eb8c4), side * 0.42, 0.98, 0.02);
      fin.rotation.z = side * -1.1; fin.rotation.y = side * 0.4;
      fins.push(fin);
    }
    const arcMat = glowMat(0xa5f5ff, 3.2, { transparent: true, opacity: 0.55 });
    const arcs = new THREE.Group(); root.add(arcs);
    for (let i = 0; i < 5; i++) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.24 + i * 0.06, 0.012, 3, 12, Math.PI * 0.75), arcMat);
      arc.position.set(wr(-0.25, 0.25), 0.92 + wr(-0.1, 0.25), wr(-0.15, 0.35));
      arc.rotation.set(wr(0, TAU), wr(0, TAU), wr(0, TAU)); arcs.add(arc);
    }
    parts.anim = (t, speed) => {
      root.position.y = Math.sin(t * 2.2) * 0.12;
      root.rotation.z = Math.sin(t * 1.4) * 0.04;
      tail.rotation.y = Math.sin(t * 4.2) * 0.4;
      head.rotation.y = Math.sin(t * 0.9) * 0.12;
      arcs.rotation.y = t * 1.2;
      fins[0].rotation.z = -1.1 + Math.sin(t * 3.4) * 0.15;
      fins[1].rotation.z = 1.1 - Math.sin(t * 3.4) * 0.15;
    };
  } else if (key === 'gloamwing') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 9, 7), bodyMat);
    body.position.y = 1.2; body.scale.set(0.85, 1.1, 0.9); body.castShadow = true; root.add(body);
    const head = new THREE.Group(); head.position.set(0, 1.67, 0.1); root.add(head); parts.head = head;
    addMesh(head, new THREE.SphereGeometry(0.34, 8, 7), bodyMat, 0, 0, 0).scale.set(1.05, 0.95, 0.95);
    for (const side of [-1, 1]) {
      makeEye(head, side * 0.14, 0.02, 0.29, 0xefd8ff, 0.07);
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 4), accentMat);
      tuft.position.set(side * 0.2, 0.26, 0); tuft.rotation.z = side * 0.3; head.add(tuft);
      const wing = new THREE.Group(); wing.position.set(side * 0.3, 1.35, 0);
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, side * 1.55, 0.18, -0.16, side * 1.18, -0.5, 0.35, 0, -0.08, 0.1], 3));
      wingGeo.setIndex([0, 1, 2, 0, 2, 3]); wingGeo.computeVertexNormals();
      const wingMesh = new THREE.Mesh(wingGeo, std(0x5a4876, { side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
      wingMesh.castShadow = true; wing.add(wingMesh);
      const edge = addMesh(wing, new THREE.CylinderGeometry(0.015, 0.015, 1.65, 3), accentMat, side * 0.8, -0.12, 0);
      edge.rotation.z = Math.PI / 2; edge.castShadow = false;
      root.add(wing); parts['wing' + side] = wing;
    }
    addMesh(root, new THREE.ConeGeometry(0.28, 0.72, 4), accentMat, 0, 0.92, -0.1).rotation.x = Math.PI;
    for (let i = 0; i < 3; i++) {
      const tail = addMesh(root, new THREE.BoxGeometry(0.07, 0.04, 0.7), std(0x604d78), (i - 1) * 0.15, 0.7, -0.5);
      tail.rotation.x = 0.32; tail.rotation.y = (i - 1) * 0.12;
    }
    parts.anim = (t, speed) => {
      root.position.y = Math.sin(t * 1.8) * 0.14;
      parts['wing-1'].rotation.z = -0.2 + Math.sin(t * 4.1) * 0.45;
      parts['wing1'].rotation.z = 0.2 - Math.sin(t * 4.1) * 0.45;
      head.rotation.y = Math.sin(t * 0.7) * 0.28;
      body.rotation.z = Math.sin(t * 1.3) * 0.06;
    };
  } else if (key === 'titanox') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 8, 6), bodyMat);
    body.position.y = 1.22; body.scale.set(1.15, 0.9, 1.55); body.castShadow = true; body.receiveShadow = true; root.add(body);
    const head = new THREE.Group(); head.position.set(0, 1.35, 1.35); root.add(head); parts.head = head;
    addMesh(head, new THREE.DodecahedronGeometry(0.56, 0), bodyMat, 0, 0, 0).scale.set(1.05, 0.9, 1.15);
    addMesh(head, new THREE.BoxGeometry(0.55, 0.32, 0.68), std(0x8e7c58), 0, -0.26, 0.22);
    for (const side of [-1, 1]) {
      makeEye(head, side * 0.23, 0.1, 0.47, 0xffce76, 0.055);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.95, 4), accentMat);
      horn.position.set(side * 0.35, 0.48, 0); horn.rotation.z = side * -0.5; horn.rotation.x = -0.3; head.add(horn);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const leg = new THREE.Group(); leg.position.set(side * (0.56 + i * 0.02), 0.75, i ? -0.55 : 0.54);
        addMesh(leg, new THREE.CylinderGeometry(0.2, 0.25, 0.8, 5), darkMat, 0, -0.3, 0);
        addMesh(leg, new THREE.BoxGeometry(0.4, 0.2, 0.55), std(0x6d6249), 0, -0.66, 0.03);
        root.add(leg); parts['leg' + side + i] = leg;
      }
    }
    const plates = new THREE.Group(); root.add(plates);
    for (let i = 0; i < 6; i++) {
      const plate = new THREE.Mesh(new THREE.DodecahedronGeometry(wr(0.18, 0.34), 0), std(i % 2 ? 0x82785c : 0x9f976e));
      plate.position.set(wr(-0.65, 0.65), 1.7 + wr(-0.1, 0.15), wr(-0.9, 0.45));
      plate.rotation.set(wr(0, TAU), wr(0, TAU), wr(0, TAU)); plate.castShadow = true; plates.add(plate);
    }
    for (let i = 0; i < 4; i++) {
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 4), glowMat(0xd8b165, 2.2));
      crystal.position.set(wr(-0.5, 0.5), 2.1, wr(-0.9, 0.15)); crystal.rotation.x = wr(-0.4, 0.4); root.add(crystal);
    }
    parts.anim = (t, speed) => {
      root.position.y = Math.abs(Math.sin(t * 1.7)) * 0.03;
      head.rotation.y = Math.sin(t * 0.7) * 0.1;
      if (parts['leg-10']) parts['leg-10'].rotation.x = Math.sin(t * 3.1 + speed) * 0.3;
      if (parts['leg10']) parts['leg10'].rotation.x = -Math.sin(t * 3.1 + speed) * 0.3;
      if (parts['leg-11']) parts['leg-11'].rotation.x = -Math.sin(t * 3.1 + speed) * 0.3;
      if (parts['leg11']) parts['leg11'].rotation.x = Math.sin(t * 3.1 + speed) * 0.3;
    };
  }
  root.scale.setScalar(def.scale);
  parts.root = root; parts.def = def;
  return { group: root, parts, anim: parts.anim };
}

/* ---------------- hollow / warden models ---------------- */
function makeHollowModel(isBoss = false) {
  const root = new THREE.Group();
  const armor = std(isBoss ? 0x3f2c2b : 0x323b38, { roughness: 0.8, metalness: 0.22 });
  const dark = std(0x171d1b, { roughness: 0.92 });
  const red = glowMat(isBoss ? 0xff6a46 : 0xff4f45, isBoss ? 3.1 : 2.3);
  const bone = std(0x9c8d75, { roughness: 0.95 });
  const torso = new THREE.Group(); torso.position.y = 1.1; root.add(torso);
  addMesh(torso, new THREE.BoxGeometry(0.66, 0.8, 0.38), armor, 0, 0, 0);
  addMesh(torso, new THREE.BoxGeometry(0.8, 0.18, 0.44), dark, 0, 0.22, 0);
  addMesh(torso, new THREE.BoxGeometry(0.22, 0.1, 0.06), red, 0, 0.08, -0.22, false, false);
  const head = new THREE.Group(); head.position.y = 1.73; root.add(head);
  addMesh(head, new THREE.BoxGeometry(0.34, 0.38, 0.32), dark, 0, 0, 0);
  addMesh(head, new THREE.BoxGeometry(0.27, 0.09, 0.04), red, 0, 0.02, -0.19, false, false);
  const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xff5e46, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  eye.scale.set(0.9, 0.9, 1); eye.position.set(0, 0.02, -0.28); head.add(eye);
  head.userData.part = 'head';
  if (isBoss) {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.85, 4), bone);
      horn.position.set(side * 0.3, 0.45, 0); horn.rotation.z = side * -0.55; head.add(horn);
      const shoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), bone);
      shoulder.position.set(side * 0.55, 1.55, 0); shoulder.castShadow = true; root.add(shoulder);
      for (let i = 0; i < 2; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 4), red);
        spike.position.set(side * 0.72, 1.72 + i * 0.2, -0.05); spike.rotation.z = side * -0.8; root.add(spike);
      }
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.27, 0), red);
    core.position.set(0, 1.18, -0.23); root.add(core);
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.2), new THREE.MeshStandardMaterial({ color: 0x2a1f20, side: THREE.DoubleSide, roughness: 1, transparent: true, opacity: 0.86 }));
    cape.position.set(0, 1.2, 0.38); cape.rotation.x = -0.06; root.add(cape);
  }
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.46, 1.45, 0);
    addMesh(arm, new THREE.BoxGeometry(0.18, 0.66, 0.2), armor, 0, -0.27, 0);
    addMesh(arm, new THREE.BoxGeometry(0.17, 0.2, 0.2), dark, 0, -0.6, -0.02);
    arm.rotation.z = side * 0.12; root.add(arm);
    if (side > 0) {
      const gun = makeWeaponModel(isBoss ? 'manticore' : 'rifle');
      gun.scale.setScalar(isBoss ? 1.25 : 0.82);
      gun.position.set(0.26, 1.1, -0.3);
      gun.rotation.y = 0.02;
      root.add(gun);
      root.userData.gun = gun;
    }
    const leg = new THREE.Group(); leg.position.set(side * 0.2, 0.8, 0);
    addMesh(leg, new THREE.BoxGeometry(0.22, 0.68, 0.25), dark, 0, -0.32, 0);
    addMesh(leg, new THREE.BoxGeometry(0.25, 0.18, 0.4), armor, 0, -0.7, -0.05);
    root.add(leg);
    root.userData['leg' + side] = leg;
  }
  root.userData.head = head;
  root.scale.setScalar(isBoss ? 1.8 : 1.0);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}
/* ---------------- player, weapons, state ---------------- */
const playerGroup = makePlayerModel();
scene.add(playerGroup);
const hand = playerGroup.userData.hand;
const weaponTypes = ['rifle', 'manticore', 'sidewinder', 'cleaver'];
const worldWeaponModels = weaponTypes.map(type => {
  const m = makeWeaponModel(type);
  m.scale.setScalar(0.8);
  hand.add(m);
  return m;
});
const viewWeaponRoot = new THREE.Group();
viewWeaponRoot.position.set(0.23, -0.33, -0.58);
viewWeaponRoot.scale.setScalar(0.52);
viewScene.add(viewWeaponRoot);
const viewWeaponModels = weaponTypes.map(type => {
  const m = makeWeaponModel(type, true);
  m.visible = false;
  viewWeaponRoot.add(m);
  return m;
});

const WEAPONS = [
  { id: 'vx9', name: 'VX-9 HAVOC', klass: 'ASSAULT RIFLE', mode: 'AUTO', auto: true, magSize: 30, reserveMax: 210, damage: 14, head: 1.8, rpm: 690, reload: 1.8, spreadHip: 0.018, spreadAds: 0.0035, pellets: 1, range: 175, recoil: 0.008, color: 0xc8f36a, muzzle: 0.9 },
  { id: 'manticore', name: 'MANTICORE-12', klass: 'BREACH SHOTGUN', mode: 'PUMP', auto: false, magSize: 6, reserveMax: 48, damage: 9, head: 1.35, rpm: 82, reload: 2.25, spreadHip: 0.065, spreadAds: 0.043, pellets: 9, range: 62, recoil: 0.032, color: 0xffb56b, muzzle: 0.6 },
  { id: 'sidewinder', name: 'SIDEWINDER .45', klass: 'SIDEARM', mode: 'SEMI', auto: false, magSize: 14, reserveMax: 112, damage: 28, head: 2.3, rpm: 340, reload: 1.5, spreadHip: 0.009, spreadAds: 0.0018, pellets: 1, range: 145, recoil: 0.014, color: 0x79d9e3, muzzle: 0.42 },
  { id: 'cleaver', name: 'RIFT CLEAVER', klass: 'MELEE', mode: 'MELEE', auto: false, magSize: 1, reserveMax: 1, damage: 62, head: 1.2, rpm: 115, reload: 0, spreadHip: 0, spreadAds: 0, pellets: 1, range: 3.2, recoil: 0.02, color: 0xff875f, muzzle: 0.3 }
];
const weaponState = WEAPONS.map(w => ({ mag: w.magSize, reserve: w.reserveMax }));

const player = {
  pos: new THREE.Vector3(0, 4.15, 12),
  vel: new THREE.Vector3(),
  vy: 0,
  grounded: true,
  yaw: 0,
  pitch: -0.02,
  health: 100,
  maxHealth: 100,
  shield: 50,
  maxShield: 50,
  shieldDelay: 0,
  stamina: 1,
  orbs: 6,
  stims: 3,
  walkPhase: 0,
  speed: 6.5,
  sprint: 10.6,
  invuln: 0,
  lastDamage: 0,
  dead: false,
  moving: false
};

let state = 'menu';
let previousState = 'menu';
let gameTime = 0;
let worldTime = 0;
let last = performance.now();
let currentWeapon = 0;
let cameraMode = 0;
let reloadTimer = 0;
let reloading = false;
let fireCooldown = 0;
let triggerHeld = false;
let aimTarget = null;
let bindTarget = null;
let scanTimer = 0;
let hudTimer = 0;
let mapTimer = 0;
let captureSlow = 0;
let shake = 0;
let recoilPitch = 0;
let recoilYaw = 0;
let deathTimer = 0;
let pointerLocked = false;
let pointerNDC = new THREE.Vector2(0, 0);
let cameraBaseFov = 69;
let audioOn = false;
let audioCtx = null;
let ambientNodes = null;
let objectivePos = new THREE.Vector3();
let objectiveLabel = 'ANIMA SIGNAL';
let lastPrompt = null;
let lastNotice = 0;
let discoverCooldown = {};

const quest = {
  binds: 0,
  wardenDead: false,
  sealed: false,
  hollowKills: 0,
  shards: 0,
  shots: 0,
  hits: 0,
  startedAt: 0,
  completed: false
};
let creatures = [];
let hollows = [];
let boss = null;
let team = [];
let activeCompanionIndex = 0;
let captureOrbs = [];
let enemyShots = [];
let friendlyShots = [];
let pickups = [];
let fx = [];
let respawns = [];
let hollowRespawns = [];
let interactables = [];

const keys = new Set();
const input = { fire: false, ads: false, jump: false, forward: 0, right: 0 };
const clock2 = new THREE.Clock();

/* ---------------- audio ---------------- */
function initAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!ambientNodes) {
    const master = audioCtx.createGain();
    master.gain.value = 0.018;
    master.connect(audioCtx.destination);
    const o1 = audioCtx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = audioCtx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.5;
    const g2 = audioCtx.createGain(); g2.gain.value = 0.35;
    o1.connect(master); o2.connect(g2); g2.connect(master); o1.start(); o2.start();
    ambientNodes = { master, o1, o2 };
  }
}
function setAudio(on) {
  audioOn = on;
  if (on) initAudio();
  if (audioCtx && ambientNodes) ambientNodes.master.gain.value = on ? 0.018 : 0.0001;
  $('audioLabel').textContent = on ? 'AUDIO ON' : 'AUDIO OFF';
  $('audioBtn').classList.toggle('on', on);
}
function tone(freq, dur, vol = 0.04, type = 'sine', slide = 1) {
  if (!audioOn || !audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, vol = 0.04, freq = 1200, type = 'lowpass') {
  if (!audioOn || !audioCtx) return;
  const t = audioCtx.currentTime;
  const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const filter = audioCtx.createBiquadFilter(); filter.type = type; filter.frequency.value = freq;
  const g = audioCtx.createGain(); g.gain.value = vol;
  src.connect(filter); filter.connect(g); g.connect(audioCtx.destination); src.start(t);
}
function sfx(name) {
  if (!audioOn) return;
  if (name === 'rifle') { noiseBurst(0.095, 0.065, 1600); tone(138, 0.08, 0.05, 'square', 0.55); }
  if (name === 'shotgun') { noiseBurst(0.2, 0.1, 900); tone(84, 0.2, 0.08, 'sawtooth', 0.45); }
  if (name === 'pistol') { noiseBurst(0.07, 0.05, 2300); tone(220, 0.06, 0.035, 'square', 0.6); }
  if (name === 'melee') { noiseBurst(0.14, 0.03, 400); tone(320, 0.12, 0.025, 'sawtooth', 0.4); }
  if (name === 'hit') { tone(940, 0.04, 0.025, 'triangle', 1.4); }
  if (name === 'kill') { tone(360, 0.08, 0.035, 'triangle', 1.8); tone(680, 0.12, 0.025, 'sine', 1.2); }
  if (name === 'reload') { noiseBurst(0.05, 0.025, 700); tone(190, 0.05, 0.025, 'square', 0.7); }
  if (name === 'empty') { tone(150, 0.04, 0.025, 'square', 0.7); }
  if (name === 'bind') { tone(320, 0.2, 0.05, 'sine', 1.8); setTimeout(() => tone(520, 0.25, 0.05, 'sine', 1.5), 90); setTimeout(() => tone(760, 0.35, 0.04, 'sine', 1.2), 180); }
  if (name === 'capture') { tone(520, 0.2, 0.05, 'triangle', 1.6); setTimeout(() => tone(780, 0.3, 0.05, 'triangle', 1.4), 120); setTimeout(() => tone(1040, 0.5, 0.04, 'sine', 1.1), 250); }
  if (name === 'hurt') { noiseBurst(0.12, 0.05, 380); tone(110, 0.15, 0.05, 'sawtooth', 0.55); }
  if (name === 'orb') { tone(620, 0.12, 0.03, 'sine', 1.5); }
  if (name === 'discover') { tone(420, 0.12, 0.03, 'sine', 1.4); setTimeout(() => tone(620, 0.18, 0.025, 'sine', 1.2), 80); }
  if (name === 'roar') { tone(70, 0.7, 0.12, 'sawtooth', 0.7); noiseBurst(0.5, 0.05, 240); }
}

/* ---------------- UI helpers ---------------- */
function toast(text, kind = '') {
  const stack = $('toastStack');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  stack.appendChild(el);
  while (stack.children.length > 4) stack.removeChild(stack.firstChild);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 2800);
}
function addFeed(text, accent = '') {
  const feed = $('killfeed');
  const el = document.createElement('div');
  el.className = 'kill-item';
  el.innerHTML = text;
  feed.prepend(el);
  while (feed.children.length > 4) feed.lastChild.remove();
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; setTimeout(() => el.remove(), 420); }, 6000);
}
function hitmarker(critical = false) {
  const el = $('hitmarker');
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  el.style.color = critical ? '#ffb56b' : '#fff';
}
function flashDamage() {
  const el = $('damageFlash');
  el.style.opacity = '0.9';
  setTimeout(() => el.style.opacity = '0', 110);
}
function captureFlash() {
  const c = $('captureFlash');
  const s = $('slowmoEdge');
  c.style.opacity = '1'; s.style.opacity = '1';
  setTimeout(() => { c.style.opacity = '0'; s.style.opacity = '0'; }, 720);
}
function notice(kicker, title, copy) {
  const n = $('notice');
  $('noticeKicker').textContent = kicker;
  $('noticeTitle').textContent = title;
  $('noticeCopy').textContent = copy;
  n.hidden = false;
  clearTimeout(lastNotice);
  lastNotice = setTimeout(() => { n.hidden = true; }, 2800);
}
function showDamageNumber(worldPos, amount, critical = false) {
  if (!worldPos) return;
  const v = worldPos.clone().project(camera);
  if (v.z > 1 || v.z < -1) return;
  const el = document.createElement('div');
  el.className = 'dmg-number' + (critical ? ' crit' : '');
  el.textContent = Math.round(amount) + (critical ? '!' : '');
  el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
  $('hud').appendChild(el);
  setTimeout(() => el.remove(), 760);
}
function currentWeaponSpec() { return WEAPONS[currentWeapon]; }
function activeCompanion() { return team[activeCompanionIndex] || null; }
function forwardVector() { return new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)); }
function rightVector() { return new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw)); }
function playerEye() { return new THREE.Vector3(player.pos.x, player.pos.y + 1.62, player.pos.z); }

/* ---------------- world actors ---------------- */
let actorId = 1;
function makeShadow(radius, y = 0.02) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), new THREE.MeshBasicMaterial({ color: 0x07110c, transparent: true, opacity: 0.38, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.userData.ignoreRay = true;
  return m;
}
function spawnCreature(key, x, z) {
  const def = SPECIES[key];
  const model = makeAnimaModel(key);
  const group = model.group;
  group.position.set(x, groundAt(x, z) + def.hover, z);
  const shadow = makeShadow(0.8 * def.scale, -def.hover + 0.02);
  shadow.scale.set(1.2, 1, 1);
  group.add(shadow);
  const actor = {
    id: actorId++, kind: 'creature', key, def, group, model,
    hp: def.hp, maxHp: def.hp, dead: false, aggro: false, weakened: false,
    attackTimer: rnd(1.2, 2.6), wanderAngle: rnd(0, TAU), wanderTimer: rnd(1, 4),
    speed: def.speed, spin: 0, spawnX: x, spawnZ: z, flash: 0, phase: rnd(0, 10)
  };
  group.userData.actor = actor;
  group.traverse(o => { o.userData.actor = actor; });
  scene.add(group);
  creatures.push(actor);
  return actor;
}
function spawnHollow(x, z, opts = {}) {
  const group = makeHollowModel(false);
  const y = groundAt(x, z);
  group.position.set(x, y, z);
  group.add(makeShadow(0.55));
  const actor = {
    id: actorId++, kind: 'hollow', group, hp: 72, maxHp: 72, dead: false, aggro: false,
    homeX: x, homeZ: z, attackTimer: rnd(1, 2.4), strafe: Math.random() > 0.5 ? 1 : -1,
    speed: 2.6, flash: 0, phase: rnd(0, 6), burst: 0
  };
  group.userData.actor = actor;
  group.traverse(o => { o.userData.actor = actor; });
  scene.add(group);
  hollows.push(actor);
  return actor;
}
function spawnBoss() {
  if (boss) return boss;
  const group = makeHollowModel(true);
  const x = 0, z = -70;
  group.position.set(x, groundAt(x, z), z);
  group.add(makeShadow(1.4));
  const actor = {
    id: actorId++, kind: 'boss', group, hp: 760, maxHp: 760, dead: false, active: false,
    attackTimer: 2.4, stormTimer: 8, speed: 3.2, flash: 0, phase: 0, name: 'OSSuary'
  };
  group.userData.actor = actor;
  group.traverse(o => { o.userData.actor = actor; });
  // dormant shield
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0xff7c55, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const shield = new THREE.Mesh(new THREE.SphereGeometry(3.2, 22, 14), shieldMat);
  shield.position.y = 2.4;
  group.add(shield);
  actor.shield = shield;
  scene.add(group);
  boss = actor;
  return actor;
}
function clearActors() {
  for (const c of creatures) scene.remove(c.group);
  for (const h of hollows) scene.remove(h.group);
  if (boss) scene.remove(boss.group);
  for (const c of team) scene.remove(c.group);
  for (const o of captureOrbs) scene.remove(o.mesh);
  for (const s of enemyShots) scene.remove(s.mesh);
  for (const s of friendlyShots) scene.remove(s.mesh);
  for (const p of pickups) scene.remove(p.mesh);
  for (const e of fx) if (e.mesh) scene.remove(e.mesh);
  creatures = []; hollows = []; boss = null; team = []; activeCompanionIndex = 0;
  captureOrbs = []; enemyShots = []; friendlyShots = []; pickups = []; fx = [];
  respawns = []; hollowRespawns = []; interactables = []; crates.forEach(c => { c.opened = false; });
}

/* ---------------- spawn and reset ---------------- */
function spawnWorldActors() {
  WILD_SPAWNS.forEach(s => spawnCreature(s.key, s.x, s.z));
  spawnHollow(24, -12);
  spawnHollow(29, -18);
  spawnHollow(-18, -35);
  spawnHollow(46, 20);
  spawnHollow(-39, 35);
  spawnHollow(14, 47);
  spawnBoss();
}
function resetGame() {
  clearActors();
  quest.binds = 0; quest.wardenDead = false; quest.sealed = false; quest.hollowKills = 0;
  quest.shards = 0; quest.shots = 0; quest.hits = 0; quest.startedAt = performance.now(); quest.completed = false;
  player.health = 100; player.shield = 50; player.shieldDelay = 0; player.stims = 3; player.orbs = 6;
  player.pos.set(0, groundAt(0, 12), 12); player.vy = 0; player.grounded = true;
  player.yaw = 0; player.pitch = -0.03; player.dead = false; player.invuln = 1.5;
  currentWeapon = 0; reloading = false; reloadTimer = 0; fireCooldown = 0;
  WEAPONS.forEach((w, i) => { weaponState[i].mag = w.magSize; weaponState[i].reserve = w.reserveMax; });
  cameraMode = 0;
  deathTimer = 0; captureSlow = 0; shake = 0; aimTarget = null; beaconCooldown = 0;
  lastMissionKey = ''; lastPackKey = '__reset__'; lastZone = ''; lastBossActive = false;
  spawnWorldActors();
  updateWeaponVisuals();
  updateHUD(true);
}
/* ---------------- FX / combat ---------------- */
const raycaster = new THREE.Raycaster();
raycaster.far = 220;
function addTracer(from, to, color = 0xffe7a0, width = 1) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 4;
  scene.add(line);
  fx.push({ type: 'tracer', mesh: line, life: 0.12, max: 0.12 });
}
function burst(pos, color, count = 10, power = 3, size = 0.11) {
  const positions = new Float32Array(count * 3);
  const vel = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
    const a = rnd(0, TAU), b = rnd(-0.5, 1);
    const p = rnd(power * 0.25, power);
    vel.push(new THREE.Vector3(Math.cos(a) * p, b * p, Math.sin(a) * p));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ map: GLOW_TEX, color, size, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  fx.push({ type: 'points', mesh: points, vel, life: 0.72, max: 0.72 });
}
function ringPulse(pos, color = 0xc8f36a, radius = 5, life = 0.55) {
  const geo = new THREE.RingGeometry(0.9, 1.0, 40);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos);
  mesh.position.y += 0.1;
  scene.add(mesh);
  fx.push({ type: 'ring', mesh, life, max: life, radius });
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const e = fx[i];
    e.life -= dt;
    if (e.life <= 0) {
      scene.remove(e.mesh);
      if (e.mesh.geometry) e.mesh.geometry.dispose();
      if (e.mesh.material) e.mesh.material.dispose();
      fx.splice(i, 1);
      continue;
    }
    const t = e.life / e.max;
    if (e.type === 'tracer') {
      e.mesh.material.opacity = t * 0.9;
    } else if (e.type === 'points') {
      const pos = e.mesh.geometry.attributes.position;
      for (let j = 0; j < e.vel.length; j++) {
        const v = e.vel[j];
        pos.array[j * 3] += v.x * dt;
        pos.array[j * 3 + 1] += v.y * dt;
        pos.array[j * 3 + 2] += v.z * dt;
        v.y -= 5 * dt;
        v.multiplyScalar(0.965);
      }
      pos.needsUpdate = true;
      e.mesh.material.opacity = t;
    } else if (e.type === 'ring') {
      const grow = 1 + (1 - t) * e.radius;
      e.mesh.scale.set(grow, grow, grow);
      e.mesh.material.opacity = t * 0.75;
    }
  }
}

function getCenterRay() {
  if (!pointerLocked && !isTouch && state !== 'menu') {
    raycaster.setFromCamera(pointerNDC, camera);
  } else {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  }
  return raycaster;
}
function collectShootables() {
  const arr = [terrain];
  for (const c of creatures) if (!c.dead) c.group.traverse(o => { if (o.isMesh && !o.userData.ignoreRay) arr.push(o); });
  for (const h of hollows) if (!h.dead) h.group.traverse(o => { if (o.isMesh && !o.userData.ignoreRay) arr.push(o); });
  if (boss && !boss.dead) boss.group.traverse(o => { if (o.isMesh && !o.userData.ignoreRay) arr.push(o); });
  return arr;
}
function findActor(object) {
  let o = object;
  while (o) { if (o.userData && o.userData.actor) return o.userData.actor; o = o.parent; }
  return null;
}
function scanAimTarget() {
  if (state !== 'playing') { aimTarget = null; return; }
  const ray = getCenterRay();
  const hits = ray.intersectObjects(collectShootables(), false);
  for (const hit of hits) {
    if (hit.object === terrain) { aimTarget = null; return; }
    const actor = findActor(hit.object);
    if (actor) { aimTarget = actor; return; }
  }
  aimTarget = null;
}

function showFlash(weaponIndex) {
  const flash = viewWeaponModels[weaponIndex].userData.flash;
  if (!flash) return;
  flash.material.opacity = 1;
  flash.material.rotation = rnd(0, TAU);
  flash.scale.setScalar(rnd(0.45, 0.9));
  setTimeout(() => { flash.material.opacity = 0; }, 55);
}
function currentMuzzleWorld() {
  if (cameraMode === 0) {
    const m = viewWeaponModels[currentWeapon].userData.muzzle;
    if (m) {
      const v = new THREE.Vector3();
      m.getWorldPosition(v);
      // viewmodel lives in camera-local space; lift it into the world
      camera.updateMatrixWorld();
      v.applyMatrix4(camera.matrixWorld);
      return v;
    }
  }
  const m = worldWeaponModels[currentWeapon].userData.muzzle;
  if (m) { const v = new THREE.Vector3(); m.getWorldPosition(v); return v; }
  return playerEye();
}
function startReload() {
  const spec = currentWeaponSpec();
  if (spec.id === 'cleaver' || reloading) return;
  const st = weaponState[currentWeapon];
  if (st.mag >= spec.magSize || st.reserve <= 0) return;
  reloading = true;
  reloadTimer = spec.reload;
  sfx('reload');
}
function finishReload() {
  const spec = currentWeaponSpec();
  const st = weaponState[currentWeapon];
  const take = Math.min(spec.magSize - st.mag, st.reserve);
  st.mag += take; st.reserve -= take;
  reloading = false; reloadTimer = 0;
  updateHUD(true);
}
function shootWeapon() {
  if (state !== 'playing' || player.dead) return;
  if (reloading) return;
  if (fireCooldown > 0) return;
  const spec = currentWeaponSpec();
  const st = weaponState[currentWeapon];
  if (spec.id === 'cleaver') {
    fireCooldown = 60 / spec.rpm;
    sfx('melee');
    showFlash(currentWeapon);
    recoilPitch += spec.recoil;
    quest.shots++;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    let hitAny = false;
    const targets = [];
    creatures.forEach(c => { if (!c.dead) targets.push(c); });
    hollows.forEach(h => { if (!h.dead) targets.push(h); });
    if (boss && !boss.dead) targets.push(boss);
    for (const a of targets) {
      const to = a.group.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(playerEye());
      if (to.length() < 3.4 && to.normalize().dot(fwd) > 0.25) {
        damageActor(a, spec.damage, a.group.position.clone().add(new THREE.Vector3(0, 1, 0)), false);
        hitAny = true;
      }
    }
    if (!hitAny) burst(playerEye().add(fwd.multiplyScalar(2)), 0xffe2a3, 5, 1.8, 0.08);
    return;
  }
  if (st.mag <= 0) {
    sfx('empty');
    toast('MAG EMPTY — PRESS R TO RELOAD', 'warn');
    startReload();
    fireCooldown = 0.32;
    return;
  }
  st.mag--;
  fireCooldown = 60 / spec.rpm;
  quest.shots++;
  const ray = getCenterRay();
  const camOrigin = ray.ray.origin.clone();
  const aimPoint = camOrigin.clone().add(ray.ray.direction.clone().multiplyScalar(95));
  let origin = playerEye();
  if (cameraMode === 0) origin.copy(camera.position);
  else origin.copy(playerEye());
  let baseDir = aimPoint.sub(origin).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const moveMul = player.moving ? 1.55 : 1;
  const spread = (input.ads ? spec.spreadAds : spec.spreadHip) * moveMul;
  const muzzle = currentMuzzleWorld();
  let didHit = false;
  for (let p = 0; p < spec.pellets; p++) {
    const dir = baseDir.clone();
    dir.applyAxisAngle(right, rnd(-spread, spread)).applyAxisAngle(up, rnd(-spread, spread));
    raycaster.set(origin, dir);
    raycaster.far = spec.range;
    const hits = raycaster.intersectObjects(collectShootables(), false);
    let endpoint = origin.clone().add(dir.clone().multiplyScalar(spec.range));
    for (const hit of hits) {
      endpoint.copy(hit.point);
      if (hit.object === terrain) {
        burst(hit.point, 0xa6b07f, 4, 2.1, 0.07);
        break;
      }
      const actor = findActor(hit.object);
      if (actor) {
        const critical = hit.object.userData.part === 'head';
        let dmg = spec.damage * (critical ? spec.head : 1);
        if (hit.object.userData.part === 'head') damageActor(actor, dmg, hit.point, true);
        else damageActor(actor, dmg, hit.point, false);
        didHit = true;
        break;
      }
    }
    addTracer(muzzle, endpoint, p % 2 ? 0xffd28a : 0xfff2bd, 1);
    if (spec.pellets > 1 && p < 6) burst(endpoint, 0xffb56b, 2, 1.2, 0.06);
  }
  if (didHit) { hitmarker(); }
  recoilPitch += spec.recoil * (input.ads ? 0.55 : 1);
  recoilYaw += rnd(-spec.recoil * 0.45, spec.recoil * 0.45);
  shake = Math.max(shake, spec.pellets > 1 ? 5 : 2.2);
  sfx(spec.id === 'vx9' ? 'rifle' : spec.id === 'manticore' ? 'shotgun' : 'pistol');
  showFlash(currentWeapon);
  burst(muzzle, 0xffd884, 3, 1.8, 0.06);
  if (st.mag === 0) setTimeout(() => { if (state === 'playing') startReload(); }, 240);
  updateHUD(true);
}
function damageActor(actor, amount, point, critical = false) {
  if (!actor || actor.dead) return;
  if (actor.kind === 'boss' && !actor.active) {
    if (actor.shield) { actor.shield.material.opacity = 0.32; setTimeout(() => { if (actor.shield) actor.shield.material.opacity = 0.13; }, 80); }
    burst(point || actor.group.position, 0xff875f, 6, 2, 0.08);
    tone(130, 0.12, 0.03, 'square', 0.5);
    return;
  }
  quest.hits++;
  actor.hp -= amount;
  actor.flash = 0.11;
  showDamageNumber(point || actor.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), amount, critical);
  burst(point || actor.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), critical ? 0xffd06a : 0xeef5c4, critical ? 9 : 5, critical ? 3.4 : 2.2, 0.075);
  hitmarker(critical);
  sfx('hit');
  if (actor.kind === 'creature') {
    actor.aggro = true;
    if (!actor.weakened && actor.hp <= actor.maxHp * 0.36) {
      actor.weakened = true;
      toast(`${actor.def.name} WEAKENED — PRESS F TO BIND`, 'good');
    }
  }
  if (actor.hp <= 0) killActor(actor);
  updateHUD(true);
}
function killActor(actor) {
  actor.dead = true; actor.hp = 0;
  const pos = actor.group.position.clone().add(new THREE.Vector3(0, 0.9, 0));
  if (actor.kind === 'creature') {
    burst(pos, actor.def.accent, 26, 4.2, 0.14);
    ringPulse(pos, actor.def.accent, 3, 0.5);
    scene.remove(actor.group);
    creatures = creatures.filter(c => c !== actor);
    quest.shards += 90;
    spawnPickup('shards', pos.x, pos.z, 90);
    if (Math.random() < 0.35) spawnPickup('orb', pos.x + 0.5, pos.z + 0.3, 1);
    if (Math.random() < 0.22) spawnPickup('ammo', pos.x - 0.4, pos.z + 0.4, 1);
    addFeed(`<b>ROOK</b> ↓ ${actor.def.name} <i>SHATTERED</i>`);
    respawns.push({ key: actor.key, x: actor.spawnX, z: actor.spawnZ, time: 50 });
    if (activeCompanion()) activeCompanion().bond = Math.min(100, activeCompanion().bond + 3);
    sfx('kill');
  } else if (actor.kind === 'hollow') {
    burst(pos, 0xff7b5f, 20, 3.6, 0.12);
    scene.remove(actor.group);
    hollows = hollows.filter(h => h !== actor);
    quest.hollowKills++;
    quest.shards += 140;
    spawnPickup('shards', pos.x, pos.z, 140);
    if (Math.random() < 0.5) spawnPickup('ammo', pos.x + 0.5, pos.z + 0.2, 1);
    if (Math.random() < 0.25) spawnPickup('stim', pos.x - 0.5, pos.z - 0.2, 1);
    addFeed(`<b>ROOK</b> ↓ <i>HOLLOW STALKER</i>`);
    hollowRespawns.push({ x: actor.homeX, z: actor.homeZ, time: 55 });
    if (activeCompanion()) activeCompanion().bond = Math.min(100, activeCompanion().bond + 5);
    sfx('kill');
  } else if (actor.kind === 'boss') {
    burst(pos, 0xffb56b, 70, 7, 0.2);
    ringPulse(pos, 0xff8d5d, 18, 1.1);
    shake = 12;
    actor.group.visible = false;
    actor.dead = true;
    quest.wardenDead = true;
    quest.shards += 1200;
    spawnPickup('shards', pos.x, pos.z, 500);
    spawnPickup('orb', pos.x + 1.2, pos.z, 2);
    addFeed(`<b>ROOK</b> ↓ <i>RIFT WARDEN</i> — GATE UNSEALED`);
    notice('WARDEN BROKEN', 'THE GATE IS OPEN', 'REACH THE RIFT GATE · PRESS E TO SEAL');
    toast('WARDEN DOWN — SEAL THE RIFT GATE (E)', 'good');
    sfx('roar');
    worldAnim.gateRing.material.color.setHex(0xc8f36a);
    worldAnim.gateRing.material.emissive.setHex(0xc8f36a);
    worldAnim.gatePortal.uniforms.uColorA.value.setHex(0x1b4d2c);
    worldAnim.gatePortal.uniforms.uColorB.value.setHex(0xc8f36a);
    worldAnim.gatePortal.uniforms.uOpen.value = 1.0;
    worldAnim.gateLight.color.setHex(0xc8f36a);
    worldAnim.gateShield.visible = false;
    updateHUD(true);
  }
  if (aimTarget === actor) aimTarget = null;
}
function damagePlayer(amount, source = 'impact') {
  if (state !== 'playing' || player.dead || player.invuln > 0) return;
  player.invuln = 0.16;
  let remaining = amount;
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, remaining * 0.72);
    player.shield -= absorbed; remaining -= absorbed;
  }
  player.health -= remaining;
  player.shieldDelay = 4;
  flashDamage();
  shake = Math.max(shake, 4.5);
  sfx('hurt');
  burst(playerEye().add(new THREE.Vector3(0, -0.2, 0)), 0xff6f5d, 5, 1.8, 0.08);
  if (player.health <= 0) { player.health = 0; diePlayer(); }
  updateHUD(true);
}
function diePlayer() {
  player.dead = true;
  state = 'dead';
  deathTimer = 5;
  triggerHeld = false;
  input.fire = false; input.ads = false;
  if (document.pointerLockElement) document.exitPointerLock();
  playerGroup.visible = false;
  $('deathScreen').hidden = false;
  $('touchControls').hidden = true;
  $('hud').hidden = true;
  spawnPickup('shards', player.pos.x, player.pos.z, 0);
  sfx('hurt');
}
function respawnPlayer() {
  player.dead = false;
  player.health = 75; player.shield = 30; player.invuln = 2;
  player.pos.set(0, groundAt(0, 9), 9); player.vy = 0; player.grounded = true;
  player.yaw = 0; player.pitch = -0.03;
  state = 'playing'; deathTimer = 0;
  $('deathScreen').hidden = true; $('hud').hidden = false; $('touchControls').hidden = isTouch ? false : true;
  playerGroup.visible = true;
  burst(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xc8f36a, 28, 3.6, 0.12);
  toast('RECONSTITUTED AT BEACON ALPHA', 'good');
  updateHUD(true);
}
function spawnPickup(type, x, z, value) {
  const g = new THREE.Group();
  let color = 0xc8f36a;
  if (type === 'shards') {
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glowMat(0xc8f36a, 3));
    core.rotation.z = Math.PI / 4; g.add(core);
  } else if (type === 'orb') {
    color = 0x79d9e3;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), glowMat(0x79d9e3, 3));
    g.add(core);
  } else if (type === 'stim') {
    color = 0xff875f;
    const core = addMesh(g, new THREE.BoxGeometry(0.22, 0.3, 0.15), glowMat(0xff875f, 1.8), 0, 0, 0);
    const cross = addMesh(g, new THREE.BoxGeometry(0.08, 0.18, 0.16), glowMat(0xffd4bd, 2), 0, 0, 0.01);
  } else {
    color = 0xffb56b;
    addMesh(g, new THREE.BoxGeometry(0.22, 0.15, 0.3), std(0x79654a), 0, 0, 0);
    addMesh(g, new THREE.BoxGeometry(0.24, 0.04, 0.32), glowMat(0xffb56b, 2), 0, 0.01, 0);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  sprite.scale.set(1.1, 1.1, 1); g.add(sprite);
  const y = groundAt(x, z) + 0.6;
  g.position.set(x, y, z);
  scene.add(g);
  pickups.push({ type, mesh: g, x, z, value, life: 35, phase: rnd(0, 6), baseY: y });
}
function collectPickup(p) {
  scene.remove(p.mesh);
  pickups = pickups.filter(x => x !== p);
  if (p.type === 'shards') {
    quest.shards += p.value;
    tone(760 + Math.random() * 80, 0.05, 0.02, 'sine', 1.3);
  } else if (p.type === 'orb') {
    player.orbs = Math.min(12, player.orbs + 1);
    toast('+1 PRISM ORB', 'good');
  } else if (p.type === 'stim') {
    player.stims = Math.min(5, player.stims + 1);
    toast('+1 FIELD STIM', 'good');
  } else if (p.type === 'ammo') {
    weaponState.forEach((s, i) => { s.reserve = Math.min(WEAPONS[i].reserveMax, s.reserve + 18); });
    toast('+ AMMUNITION', '');
  }
  updateHUD(true);
}

/* ---------------- capture + companions ---------------- */
function validBindTarget() {
  if (aimTarget && aimTarget.kind === 'creature' && !aimTarget.dead && aimTarget.weakened) return aimTarget;
  const fwd = forwardVector();
  let best = null, score = Infinity;
  for (const c of creatures) {
    if (c.dead || !c.weakened) continue;
    const to = c.group.position.clone().sub(player.pos);
    const d = to.length();
    if (d > 30) continue;
    to.y = 0;
    if (to.normalize().dot(fwd) < 0.2) continue;
    if (d < score) { score = d; best = c; }
  }
  return best;
}
function tryBind() {
  if (state !== 'playing' || player.dead) return;
  if (team.length >= 3) { toast('PACK FULL — PRESS V TO SWAP ACTIVE ANIMA', 'warn'); return; }
  if (player.orbs <= 0) { toast('NO PRISM ORBS — RESUPPLY AT BEACON ALPHA', 'warn'); sfx('empty'); return; }
  const target = validBindTarget();
  if (!target) { toast('AIM AT A WEAKENED ANIMA — WEAKEN BELOW 35% VITALITY', 'warn'); return; }
  player.orbs--;
  const start = playerEye().add(forwardVector().multiplyScalar(0.6));
  start.y -= 0.1;
  const end = target.group.position.clone().add(new THREE.Vector3(0, target.def.hover + 0.8, 0));
  const orb = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), glowMat(0xc8f36a, 4));
  orb.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 4, 18), glowMat(0xc8f36a, 2));
  ring.rotation.x = Math.PI / 2; orb.add(ring);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xc8f36a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  sprite.scale.set(1.8, 1.8, 1); orb.add(sprite);
  orb.position.copy(start);
  scene.add(orb);
  captureOrbs.push({ mesh: orb, target, t: 0, dur: 0.66, start, end, chance: target.hp / target.maxHp <= 0.2 ? 1 : 0.72 });
  sfx('orb');
  toast(`PRISM ORB AWAY — BINDING ${target.def.name}`, 'good');
  updateHUD(true);
}
function captureCreature(actor) {
  if (!actor || actor.dead) return;
  const def = actor.def;
  scene.remove(actor.group);
  creatures = creatures.filter(c => c !== actor);
  const model = makeAnimaModel(actor.key);
  const group = model.group;
  group.scale.multiplyScalar(0.82);
  group.position.copy(actor.group.position);
  shadowlessAddCompanion(group);
  const companion = {
    key: actor.key, def, model, group, bond: 24, level: def.level,
    attackTimer: rnd(1.2, 2.2), rallyTimer: 0, rallyTarget: null, petCooldown: 0,
    phase: rnd(0, 6), spawnX: actor.spawnX, spawnZ: actor.spawnZ
  };
  group.userData.companion = companion;
  team.push(companion);
  if (team.length === 1) activeCompanionIndex = 0;
  activeCompanionIndex = team.length - 1;
  updateTeamVisibility();
  quest.binds = team.length;
  captureSlow = 0.75;
  captureFlash();
  notice('BOND ESTABLISHED', def.name, `+ ${def.element} RESONANCE · PACK ${team.length}/3`);
  toast(`${def.name} JOINED YOUR PACK — T RALLY · H TAME · V SWAP`, 'good');
  sfx('capture');
  burst(group.position.clone().add(new THREE.Vector3(0, 1, 0)), def.accent, 42, 5, 0.16);
  ringPulse(group.position, def.accent, 5, 0.9);
  respawns.push({ key: actor.key, x: actor.spawnX, z: actor.spawnZ, time: 65 });
  if (team.length >= 3 && boss && !boss.active && !boss.dead) {
    boss.active = true;
    if (boss.shield) boss.shield.visible = false;
    worldAnim.gatePortal.uniforms.uOpen.value = 0.7;
    worldAnim.gatePortal.uniforms.uColorB.value.setHex(0xc8f36a);
    worldAnim.gateRing.material.color.setHex(0xc8f36a);
    worldAnim.gateRing.material.emissive.setHex(0xc8f36a);
    worldAnim.gateShield.visible = false;
    notice('SEAL SHATTERED', 'THE WARDEN WAKES', 'GO TO THE RIFT GATE · BREAK THE WARDEN');
    toast('GATE SEAL SHATTERED — THE WARDEN IS AWAKE', 'warn');
    sfx('roar');
  }
  updateHUD(true);
}
function shadowlessAddCompanion(group) {
  const shadow = makeShadow(0.7);
  group.add(shadow);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xc8f36a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.scale.set(2.8, 2.8, 1); aura.position.y = 1.1; group.add(aura);
  group.userData.aura = aura;
  group.visible = false;
  scene.add(group);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}
function updateTeamVisibility() {
  team.forEach((c, i) => { c.group.visible = i === activeCompanionIndex; });
}
function swapCompanion() {
  if (team.length < 2) { toast('NO SECOND ANIMA TO SWAP TO', 'warn'); return; }
  activeCompanionIndex = (activeCompanionIndex + 1) % team.length;
  updateTeamVisibility();
  const c = activeCompanion();
  const p = player.pos.clone().add(forwardVector().multiplyScalar(-2.2)).add(rightVector().multiplyScalar(1.2));
  c.group.position.set(p.x, groundAt(p.x, p.z) + c.def.hover, p.z);
  toast(`ACTIVE ANIMA // ${c.def.name} · BOND ${Math.round(c.bond)}%`, 'good');
  tone(520, 0.14, 0.03, 'sine', 1.4);
  updateHUD(true);
}
function petCompanion() {
  const c = activeCompanion();
  if (!c) { toast('BIND AN ANIMA FIRST', 'warn'); return; }
  const d = Math.hypot(c.group.position.x - player.pos.x, c.group.position.z - player.pos.z);
  if (d > 7) { toast('GET CLOSER TO YOUR ANIMA TO TAME IT', 'warn'); return; }
  if (c.petCooldown > 0) return;
  c.petCooldown = 0.65;
  c.bond = Math.min(100, c.bond + 11);
  c.group.userData.aura.material.opacity = 0.25 + (c.bond / 100) * 0.35;
  const pos = c.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  burst(pos, 0xffb5c8, 8, 2.2, 0.09);
  tone(600 + c.bond * 3, 0.16, 0.03, 'sine', 1.4);
  toast(`${c.def.name} BOND ${Math.round(c.bond)}%${c.bond >= 100 ? ' · FULLY TAMED' : ''}`, 'good');
  updateHUD(true);
}
function rallyCompanion() {
  const c = activeCompanion();
  if (!c) { toast('NO BONDED ANIMA — FIND ONE IN THE WILD', 'warn'); return; }
  let best = null, score = Infinity;
  const targets = [];
  creatures.forEach(x => { if (!x.dead && x.aggro) targets.push(x); });
  hollows.forEach(x => { if (!x.dead) targets.push(x); });
  if (boss && !boss.dead && boss.active) targets.push(boss);
  for (const t of targets) {
    const d = t.group.position.distanceTo(player.pos);
    if (d < 38 && d < score) { score = d; best = t; }
  }
  if (!best) { toast(`${c.def.name} IS ALERT — NO HOSTILE SIGNAL IN RANGE`, 'warn'); return; }
  c.rallyTarget = best; c.rallyTimer = 7;
  notice('RALLY ORDER', c.def.name, 'PACK ASSAULT · 7 SECONDS');
  sfx('bind');
  updateHUD(true);
}

/* ---------------- pickups and interactions ---------------- */
function useStim() {
  if (state !== 'playing' || player.dead) return;
  if (player.stims <= 0) { toast('NO FIELD STIMS LEFT', 'warn'); return; }
  if (player.health >= player.maxHealth) { toast('VITALS ALREADY FULL', 'warn'); return; }
  player.stims--;
  player.health = Math.min(player.maxHealth, player.health + 42);
  burst(playerEye().add(new THREE.Vector3(0, -0.3, 0)), 0xc8f36a, 18, 2.8, 0.11);
  flashDamage();
  tone(420, 0.25, 0.04, 'sine', 1.6);
  toast('FIELD STIM APPLIED +42 VITALS', 'good');
  updateHUD(true);
}
let beaconCooldown = 0;
function beaconResupply() {
  if (beaconCooldown > 0) { toast(`BEACON RECHARGING · ${Math.ceil(beaconCooldown)}s`, 'warn'); return; }
  beaconCooldown = 8;
  player.health = player.maxHealth; player.shield = player.maxShield; player.stims = Math.min(5, player.stims + 2);
  player.orbs = Math.min(12, player.orbs + 3);
  weaponState.forEach((s, i) => { s.mag = WEAPONS[i].magSize; s.reserve = WEAPONS[i].reserveMax; });
  burst(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xc8f36a, 35, 4, 0.13);
  ringPulse(player.pos, 0xc8f36a, 6, 0.8);
  tone(340, 0.25, 0.05, 'sine', 1.8); setTimeout(() => tone(680, 0.3, 0.04, 'sine', 1.4), 100);
  toast('BEACON ALPHA // FULL RESUPPLY', 'good');
  notice('RESUPPLY COMPLETE', 'BEACON ALPHA', 'ORBS +3 · STIMS +2 · AMMO RESTORED');
  updateHUD(true);
}
function openCrate(crate) {
  if (crate.opened) return;
  crate.opened = true;
  player.orbs = Math.min(12, player.orbs + 2);
  player.stims = Math.min(5, player.stims + 1);
  quest.shards += 120;
  weaponState.forEach((s, i) => { s.reserve = Math.min(WEAPONS[i].reserveMax, s.reserve + 24); });
  burst(new THREE.Vector3(crate.x, groundAt(crate.x, crate.z) + 1, crate.z), 0xffb56b, 16, 2.8, 0.1);
  toast('HOLLOW CACHE OPENED +2 ORBS · +1 STIM · +120 SHARDS', 'good');
  updateHUD(true);
}
function nearestInteractable() {
  const px = player.pos.x, pz = player.pos.z;
  const dBeacon = Math.hypot(px, pz);
  const dGate = Math.hypot(px - 0, pz - (-78));
  let best = null;
  if (dBeacon < 6.4) best = { kind: 'beacon', dist: dBeacon, label: 'RESUPPLY AT BEACON ALPHA' };
  for (const c of crates) {
    if (c.opened) continue;
    const d = Math.hypot(px - c.x, pz - c.z);
    if (d < 3.2 && (!best || d < best.dist)) best = { kind: 'crate', crate: c, dist: d, label: 'OPEN HOLLOW CACHE' };
  }
  if (dGate < 9.5) {
    if (quest.wardenDead) best = { kind: 'gate', dist: dGate, label: 'SEAL THE RIFT GATE' };
    else if (quest.binds < 3) best = { kind: 'gateLocked', dist: dGate, label: 'GATE SEALED · BIND 3 ANIMA' };
    else best = { kind: 'gateBoss', dist: dGate, label: 'DEFEAT THE RIFT WARDEN' };
  }
  return best;
}
function doInteract() {
  if (state !== 'playing' || player.dead) return;
  const near = nearestInteractable();
  if (!near) { toast('NOTHING TO INTERACT WITH', 'warn'); return; }
  if (near.kind === 'beacon') beaconResupply();
  else if (near.kind === 'crate') openCrate(near.crate);
  else if (near.kind === 'gateLocked') toast('THE SEAL NEEDS THREE BONDS — TAME THE WILD', 'warn');
  else if (near.kind === 'gateBoss') toast('THE WARDEN STILL GUARDS THE GATE', 'warn');
  else if (near.kind === 'gate') sealRift();
}
function sealRift() {
  if (quest.sealed) return;
  quest.sealed = true; quest.completed = true;
  state = 'result';
  triggerHeld = false; input.fire = false; input.ads = false;
  if (document.pointerLockElement) document.exitPointerLock();
  captureFlash(); sfx('capture');
  const portal = worldAnim.gatePortal;
  portal.uniforms.uOpen.value = 1.0;
  portal.uniforms.uColorA.value.setHex(0x194c2b);
  portal.uniforms.uColorB.value.setHex(0xd6ff86);
  showResult(true);
}
/* ---------------- AI ---------------- */
function ensureAura(a) {
  if (a.aura) return;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffb55e, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.02, 28), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12 - a.def.hover;
  a.group.add(ring);
  a.aura = ring;
}
function updateCreature(a, dt) {
  if (a.dead) return;
  const pos = a.group.position;
  const toPlayer = new THREE.Vector3(player.pos.x - pos.x, 0, player.pos.z - pos.z);
  const dist = toPlayer.length() || 0.001;
  const dirToPlayer = toPlayer.clone().divideScalar(dist);
  if (!a.aggro && dist < a.def.aggro) a.aggro = true;
  if (a.aggro && dist > 48) a.aggro = false;
  a.attackTimer -= dt;
  const wasWeak = a.weakened;
  a.weakened = a.hp > 0 && a.hp <= a.maxHp * 0.36;
  if (a.weakened) { ensureAura(a); a.aura.visible = true; a.aura.material.opacity = 0.4 + Math.sin(worldTime * 4) * 0.15; }
  else if (a.aura) a.aura.visible = false;
  if (a.weakened && !wasWeak) {
    a.aggro = true;
    ringPulse(pos, a.def.accent, 4, 0.8);
    if (aimTarget !== a) toast(`${a.def.name} IS WEAKENED — AIM AND PRESS F`, 'good');
  }
  let move = new THREE.Vector3();
  let face = dirToPlayer;
  const speedMul = a.weakened ? 0.52 : 1;
  if (a.aggro) {
    if (a.def.melee) {
      if (dist > a.def.range * 0.8) move.copy(dirToPlayer);
      else if (dist < a.def.range * 0.55) move.copy(dirToPlayer).multiplyScalar(-0.4);
      else move.set(-dirToPlayer.z, 0, dirToPlayer.x).multiplyScalar(0.35);
      if (dist < a.def.range && a.attackTimer <= 0) {
        a.attackTimer = a.weakened ? 2.8 : 1.45;
        damagePlayer(a.def.damage * (a.weakened ? 0.7 : 1), a.key);
        if (a.key === 'titanox') {
          ringPulse(pos, 0xffb56b, 7, 0.8);
          shake = Math.max(shake, 7);
        }
      }
    } else {
      if (dist > a.def.range * 0.7) move.copy(dirToPlayer);
      else if (dist < a.def.range * 0.35) move.copy(dirToPlayer).multiplyScalar(-0.7);
      else move.set(-dirToPlayer.z, 0, dirToPlayer.x).multiplyScalar(0.32);
      if (dist < a.def.range && a.attackTimer <= 0) {
        a.attackTimer = a.weakened ? 3.3 : rnd(1.7, 2.6);
        spawnEnemyProjectile(pos.clone().add(new THREE.Vector3(0, a.def.hover + 1.1, 0)), a.def.damage, a.def.accent, 17);
        burst(pos.clone().add(new THREE.Vector3(0, a.def.hover + 1.1, 0)), a.def.accent, 5, 1.5, 0.07);
      }
    }
  } else {
    a.wanderTimer -= dt;
    if (a.wanderTimer <= 0) { a.wanderTimer = rnd(2.4, 5.2); a.wanderAngle += rnd(-1.4, 1.4); }
    move.set(Math.cos(a.wanderAngle), 0, Math.sin(a.wanderAngle)).multiplyScalar(0.2);
    const homeD = Math.hypot(pos.x - a.spawnX, pos.z - a.spawnZ);
    if (homeD > 18) move.set(a.spawnX - pos.x, 0, a.spawnZ - pos.z).normalize();
    face = move;
  }
  if (move.lengthSq() > 0.001) {
    move.normalize();
    pos.x += move.x * a.speed * speedMul * dt;
    pos.z += move.z * a.speed * speedMul * dt;
    face = move;
  }
  pos.x = clamp(pos.x, -97, 97); pos.z = clamp(pos.z, -97, 97);
  a.group.position.y = groundAt(pos.x, pos.z) + a.def.hover;
  a.group.rotation.y = Math.atan2(face.x, face.z);
  a.model.anim(worldTime, a.phase);
  a.group.position.y = groundAt(pos.x, pos.z) + a.def.hover + Math.sin(worldTime * 2 + a.phase) * 0.025;
  if (a.flash > 0) { a.flash -= dt; a.group.scale.setScalar(a.def.scale * (1 + Math.sin(a.flash * 55) * 0.035)); }
  else a.group.scale.setScalar(a.def.scale);
}
function spawnEnemyProjectile(origin, damage, color = 0xff795c, speed = 17, size = 0.14) {
  const mesh = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(size, 7, 5), glowMat(color, 4));
  mesh.add(core);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  sprite.scale.set(1.3, 1.3, 1); mesh.add(sprite);
  mesh.position.copy(origin);
  const dir = playerEye().sub(origin).normalize();
  scene.add(mesh);
  enemyShots.push({ mesh, vel: dir.multiplyScalar(speed), life: 4, damage, radius: size + 0.28 });
}
function updateEnemyShots(dt) {
  for (let i = enemyShots.length - 1; i >= 0; i--) {
    const s = enemyShots[i];
    s.life -= dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    const d = s.mesh.position.distanceTo(playerEye());
    if (d < s.radius + 0.42 && !player.dead) {
      damagePlayer(s.damage, 'projectile');
      scene.remove(s.mesh);
      enemyShots.splice(i, 1);
      continue;
    }
    if (s.life <= 0 || s.mesh.position.length() > 180 || s.mesh.position.y < -5) {
      scene.remove(s.mesh); enemyShots.splice(i, 1);
    }
  }
}
function updateHollow(h, dt) {
  if (h.dead) return;
  const pos = h.group.position;
  const toPlayer = new THREE.Vector3(player.pos.x - pos.x, 0, player.pos.z - pos.z);
  const dist = toPlayer.length() || 0.001;
  const dir = toPlayer.clone().divideScalar(dist);
  const dHome = Math.hypot(pos.x - h.homeX, pos.z - h.homeZ);
  // keep each stalker tied to its camp so the beacon stays a safe staging area
  if (dist < 34 && dHome < 21) h.aggro = true;
  if (dist > 54 || dHome > 29) h.aggro = false;
  h.attackTimer -= dt;
  let move = new THREE.Vector3();
  if (h.aggro && !player.dead) {
    if (dist > 15) move.copy(dir);
    else if (dist < 8) move.copy(dir).multiplyScalar(-0.8);
    else move.set(-dir.z, 0, dir.x).multiplyScalar(h.strafe * 0.32);
    if (dist < 28 && h.attackTimer <= 0) {
      h.attackTimer = rnd(1.2, 2.1);
      spawnEnemyProjectile(pos.clone().add(new THREE.Vector3(0, 1.35, 0)), 8, 0xff5a45, 24, 0.1);
      tone(160, 0.06, 0.018, 'square', 0.5);
    }
    if (dist < 4 && h.attackTimer <= 0.0) {
      h.attackTimer = 2.4;
      damagePlayer(12, 'melee');
    }
  } else {
    if (dHome > 3) move.set(h.homeX - pos.x, 0, h.homeZ - pos.z).normalize().multiplyScalar(0.35);
    else move.set(Math.sin(worldTime * 0.35 + h.phase), 0, Math.cos(worldTime * 0.27 + h.phase)).multiplyScalar(0.12);
  }
  if (move.lengthSq() > 0) {
    pos.x += move.x * h.speed * dt; pos.z += move.z * h.speed * dt;
  }
  pos.x = clamp(pos.x, -97, 97); pos.z = clamp(pos.z, -97, 97);
  pos.y = groundAt(pos.x, pos.z);
  h.group.rotation.y = Math.atan2(dir.x, dir.z);
  const legs = h.group.userData;
  if (legs['leg-1']) legs['leg-1'].rotation.x = Math.sin(worldTime * 8 + h.phase) * (move.lengthSq() > 0.01 ? 0.55 : 0.05);
  if (legs.leg1) legs.leg1.rotation.x = -Math.sin(worldTime * 8 + h.phase) * (move.lengthSq() > 0.01 ? 0.55 : 0.05);
  h.group.position.y += Math.sin(worldTime * 2 + h.phase) * 0.02;
  if (h.flash > 0) { h.flash -= dt; h.group.scale.setScalar(1 + Math.sin(h.flash * 55) * 0.04); }
  else h.group.scale.setScalar(1);
}
function updateBoss(dt) {
  if (!boss || boss.dead) return;
  const pos = boss.group.position;
  const toPlayer = new THREE.Vector3(player.pos.x - pos.x, 0, player.pos.z - pos.z);
  const dist = toPlayer.length() || 0.001;
  const dir = toPlayer.clone().divideScalar(dist);
  boss.phase = worldTime;
  if (!boss.active) {
    boss.group.rotation.y = Math.atan2(dir.x, dir.z);
    if (boss.shield) {
      boss.shield.material.opacity = 0.1 + Math.sin(worldTime * 2.1) * 0.035;
      boss.shield.rotation.y = worldTime * 0.15;
      boss.shield.scale.setScalar(1 + Math.sin(worldTime * 1.7) * 0.02);
    }
    boss.group.position.y = groundAt(pos.x, pos.z) + Math.sin(worldTime * 1.2) * 0.03;
    return;
  }
  if (boss.shield) boss.shield.visible = false;
  boss.group.rotation.y = Math.atan2(dir.x, dir.z);
  let move = new THREE.Vector3();
  if (dist > 9 && !player.dead) move.copy(dir);
  else if (dist < 4.5) move.copy(dir).multiplyScalar(-0.4);
  else move.set(-dir.z, 0, dir.x).multiplyScalar(0.2);
  pos.x += move.x * boss.speed * dt; pos.z += move.z * boss.speed * dt;
  pos.x = clamp(pos.x, -20, 20); pos.z = clamp(pos.z, -90, -55);
  pos.y = groundAt(pos.x, pos.z) + Math.sin(worldTime * 1.4) * 0.035;
  const legs = boss.group.userData;
  if (legs['leg-1']) legs['leg-1'].rotation.x = Math.sin(worldTime * 4.2) * (move.lengthSq() > 0.01 ? 0.25 : 0.02);
  if (legs.leg1) legs.leg1.rotation.x = -Math.sin(worldTime * 4.2) * (move.lengthSq() > 0.01 ? 0.25 : 0.02);
  boss.attackTimer -= dt;
  boss.stormTimer -= dt;
  const enraged = boss.hp < boss.maxHp * 0.5;
  if (boss.attackTimer <= 0 && !player.dead) {
    boss.attackTimer = enraged ? 1.5 : 2.2;
    const origin = pos.clone().add(new THREE.Vector3(0, 2.6, 0));
    for (let i = -2; i <= 2; i++) {
      const aim = playerEye().sub(origin).normalize();
      aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.095);
      const mesh = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 4), glowMat(0xff7b55, 4));
      mesh.add(core);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xff8f60, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      spr.scale.set(1.6, 1.6, 1); mesh.add(spr);
      mesh.position.copy(origin);
      scene.add(mesh);
      enemyShots.push({ mesh, vel: aim.multiplyScalar(20), life: 4.4, damage: 13, radius: 0.45 });
    }
    burst(origin, 0xff875f, 9, 2.4, 0.1);
    tone(110, 0.12, 0.03, 'square', 0.6);
  }
  if (boss.stormTimer <= 0 && dist < 17) {
    boss.stormTimer = enraged ? 6 : 8.5;
    ringPulse(pos, 0xff7f57, 16, 1.1);
    shake = 10;
    if (dist < 11) damagePlayer(enraged ? 25 : 18, 'shockwave');
    tone(75, 0.5, 0.08, 'sawtooth', 0.7);
  }
  if (dist < 4.8 && boss.attackTimer > 0.9 && !player.dead) {
    damagePlayer(15, 'melee'); boss.attackTimer = 1.3;
  }
  if (boss.flash > 0) { boss.flash -= dt; boss.group.scale.setScalar(1.8 * (1 + Math.sin(boss.flash * 50) * 0.03)); }
  else boss.group.scale.setScalar(1.8);
}
function updateCompanion(dt) {
  const c = activeCompanion();
  if (!c) return;
  c.petCooldown = Math.max(0, c.petCooldown - dt);
  const pos = c.group.position;
  let targetPos;
  if (c.rallyTarget && !c.rallyTarget.dead && c.rallyTimer > 0) {
    targetPos = c.rallyTarget.group.position.clone().add(new THREE.Vector3(0, 0, 4));
  } else {
    targetPos = player.pos.clone().add(forwardVector().multiplyScalar(-2.4)).add(rightVector().multiplyScalar(-1.25));
  }
  const d = pos.distanceTo(targetPos);
  if (d > 26) {
    pos.copy(targetPos);
  } else if (d > 0.4) {
    const move = targetPos.clone().sub(pos); move.y = 0;
    const speed = c.rallyTarget && c.rallyTimer > 0 ? 9 : 7.2;
    pos.x += move.normalize().x * speed * dt;
    pos.z += move.z * speed * dt;
  }
  pos.x = clamp(pos.x, -97, 97); pos.z = clamp(pos.z, -97, 97);
  let face = player.pos.clone().sub(pos);
  if (c.rallyTarget && !c.rallyTarget.dead) face = c.rallyTarget.group.position.clone().sub(pos);
  else {
    const fwd = forwardVector();
    face = pos.clone().add(fwd);
    face.sub(pos);
  }
  c.group.rotation.y = Math.atan2(face.x, face.z);
  c.model.anim(worldTime, c.phase);
  pos.y = groundAt(pos.x, pos.z) + c.def.hover + Math.sin(worldTime * 2.4 + c.phase) * 0.055;
  c.rallyTimer = Math.max(0, c.rallyTimer - dt);
  if (c.rallyTarget && (c.rallyTarget.dead || c.rallyTimer <= 0)) c.rallyTarget = null;
  c.attackTimer -= dt;
  if (c.attackTimer <= 0) {
    let target = c.rallyTarget && !c.rallyTarget.dead ? c.rallyTarget : null;
    if (!target) {
      let score = Infinity;
      const all = [];
      creatures.forEach(x => { if (!x.dead && (x.aggro || x.hp < x.maxHp)) all.push(x); });
      hollows.forEach(x => { if (!x.dead) all.push(x); });
      if (boss && !boss.dead && boss.active) all.push(boss);
      for (const a of all) {
        const dd = a.group.position.distanceTo(player.pos);
        if (dd < 24 && dd < score) { score = dd; target = a; }
      }
    }
    if (target) {
      c.attackTimer = Math.max(0.85, 2.25 - c.bond * 0.008);
      const start = pos.clone().add(new THREE.Vector3(0, Math.max(0.9, c.def.hover + 0.8), 0));
      const mesh = new THREE.Group();
      const color = c.def.accent;
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), glowMat(color, 4));
      mesh.add(core);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      spr.scale.set(1.4, 1.4, 1); mesh.add(spr);
      mesh.position.copy(start);
      scene.add(mesh);
      friendlyShots.push({ mesh, target, life: 3, damage: 11 + c.bond * 0.08 + c.level * 0.8, color });
      tone(620 + c.level * 20, 0.08, 0.02, 'sine', 1.5);
    }
  }
  const aura = c.group.userData.aura;
  if (aura) aura.material.opacity = 0.14 + (c.bond / 100) * 0.4 + Math.sin(worldTime * 2) * 0.03;
  c.group.visible = !(cameraMode === 2 && state === 'playing');
}
function updateFriendlyShots(dt) {
  for (let i = friendlyShots.length - 1; i >= 0; i--) {
    const s = friendlyShots[i];
    s.life -= dt;
    if (!s.target || s.target.dead || s.life <= 0) {
      burst(s.mesh.position, s.color, 4, 1.5, 0.06);
      scene.remove(s.mesh); friendlyShots.splice(i, 1); continue;
    }
    const dest = s.target.group.position.clone().add(new THREE.Vector3(0, s.target.kind === 'boss' ? 2.4 : 1, 0));
    const move = dest.sub(s.mesh.position);
    const dist = move.length();
    if (dist < 0.7) {
      damageActor(s.target, s.damage, dest, false);
      scene.remove(s.mesh); friendlyShots.splice(i, 1); continue;
    }
    s.mesh.position.addScaledVector(move.normalize(), 30 * dt);
  }
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    p.mesh.rotation.y += dt * 1.7;
    p.mesh.position.y = p.baseY + Math.sin(worldTime * 2.4 + p.phase) * 0.12;
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (d < 9 && !player.dead) {
      const pull = 1 - d / 9;
      p.mesh.position.x += (player.pos.x - p.mesh.position.x) * pull * dt * 2.6;
      p.mesh.position.z += (player.pos.z - p.mesh.position.z) * pull * dt * 2.6;
      p.x = p.mesh.position.x; p.z = p.mesh.position.z;
    }
    if (d < 1.5 && !player.dead) { collectPickup(p); continue; }
    if (p.life <= 0) { scene.remove(p.mesh); pickups.splice(i, 1); }
  }
}

/* ---------------- player movement + camera ---------------- */
let footstepTimer = 0;
let cameraTargetPos = new THREE.Vector3(0, 6, 20);
function updatePlayer(dt) {
  if (player.dead) return;
  const fwd = forwardVector();
  const right = rightVector();
  let mx = 0, mz = 0;
  if (keys.has('w') || keys.has('arrowup')) mz += 1;
  if (keys.has('s') || keys.has('arrowdown')) mz -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  mz += input.forward; mx += input.right;
  const wish = new THREE.Vector3().addScaledVector(fwd, mz).addScaledVector(right, mx);
  if (wish.lengthSq() > 0) wish.normalize();
  player.moving = wish.lengthSq() > 0.01;
  const sprinting = (keys.has('shift') || input.sprint) && player.moving && !input.ads;
  let speed = input.ads ? 3.9 : sprinting ? player.sprint : player.speed;
  if (player.weakenedMove) speed *= 0.6;
  const targetVel = wish.multiplyScalar(speed);
  const accel = player.grounded ? 12 : 4;
  player.vel.x = damp(player.vel.x, targetVel.x, accel, dt);
  player.vel.z = damp(player.vel.z, targetVel.z, accel, dt);
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  const r = Math.hypot(player.pos.x, player.pos.z);
  if (r > 98) { player.pos.x *= 98 / r; player.pos.z *= 98 / r; }
  const ground = groundAt(player.pos.x, player.pos.z);
  if (player.grounded) {
    player.pos.y = ground;
    if (keys.has(' ') || input.jump) {
      player.vy = 7.8;
      player.grounded = false;
      input.jump = false;
      tone(280, 0.09, 0.015, 'sine', 0.7);
    }
  } else {
    player.vy -= 21 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= ground) { player.pos.y = ground; player.vy = 0; player.grounded = true; }
  }
  player.walkPhase += dt * (player.moving ? (sprinting ? 13 : 9) : 2.5);
  const planarSpeed = Math.hypot(player.vel.x, player.vel.z);
  footstepTimer -= dt;
  if (planarSpeed > 2 && player.grounded && footstepTimer <= 0) {
    footstepTimer = sprinting ? 0.27 : 0.42;
    tone(75 + Math.random() * 25, 0.045, 0.009, 'triangle', 0.8);
    if (Math.random() < 0.35) burst(player.pos.clone().add(new THREE.Vector3(rnd(-0.2, 0.2), 0.08, rnd(-0.2, 0.2))), 0xb7b18a, 2, 0.7, 0.045);
  }
  player.invuln = Math.max(0, player.invuln - dt);
  player.shieldDelay = Math.max(0, player.shieldDelay - dt);
  if (player.shieldDelay <= 0 && player.shield < player.maxShield) player.shield = Math.min(player.maxShield, player.shield + 9 * dt);
  fireCooldown = Math.max(0, fireCooldown - dt);
  if (reloading) {
    reloadTimer -= dt;
    if (reloadTimer <= 0) finishReload();
  }
  if (input.fire && currentWeaponSpec().auto) shootWeapon();
  recoilPitch = damp(recoilPitch, 0, 9, dt);
  recoilYaw = damp(recoilYaw, 0, 9, dt);
  // body animation
  playerGroup.visible = cameraMode !== 0;
  playerGroup.position.copy(player.pos);
  playerGroup.rotation.y = player.yaw;
  const p = playerGroup.userData.parts;
  const stride = player.moving ? (sprinting ? 0.78 : 0.52) : 0;
  p.legL.rotation.x = Math.sin(player.walkPhase) * stride;
  p.legR.rotation.x = -Math.sin(player.walkPhase) * stride;
  p.armL.rotation.x = -Math.sin(player.walkPhase) * stride * 0.6;
  p.armR.rotation.x = -0.6 + Math.sin(player.walkPhase) * stride * 0.2;
  p.torso.rotation.x = input.ads ? 0.04 : sprinting ? 0.17 : 0.02;
  p.torso.position.y = 1.18 + Math.abs(Math.sin(player.walkPhase)) * (player.moving ? 0.025 : 0.005);
  p.head.rotation.x = clamp(player.pitch, -0.5, 0.4) * 0.35;
  p.tailScarf.rotation.x = 0.1 + Math.sin(player.walkPhase * 0.8) * 0.08 + planarSpeed * 0.025;
  p.scarf.rotation.z = Math.sin(worldTime * 2) * 0.05;
}
function updateCamera(dt) {
  cameraBaseFov = input.ads ? 47 : cameraMode === 0 ? 69 : 71;
  if (state === 'menu') {
    const t = worldTime * 0.045;
    camera.position.set(19 + Math.sin(t) * 4.2, 9.4 + Math.sin(t * 0.8) * 0.6, 26 + Math.cos(t) * 3.4);
    camera.lookAt(0, 4.1 - 1.5, -18 - Math.sin(t) * 4);
    camera.fov = damp(camera.fov, 64, 4, dt);
    camera.updateProjectionMatrix();
    viewWeaponRoot.visible = false;
    playerGroup.visible = false;
    return;
  }
  const bob = Math.sin(player.walkPhase) * (player.moving ? 0.035 : 0.01);
  const sway = Math.sin(player.walkPhase * 0.5) * (player.moving ? 0.025 : 0.008);
  const yaw = player.yaw + recoilYaw;
  const pitch = clamp(player.pitch + recoilPitch, -1.3, 1.25);
  camera.rotation.set(pitch, yaw, 0);
  if (cameraMode === 0) {
    const eye = playerEye();
    camera.position.set(eye.x + sway * 0.3, eye.y + bob, eye.z);
    camera.position.y = Math.max(camera.position.y, groundAt(camera.position.x, camera.position.z) + 0.25);
    camera.fov = damp(camera.fov, cameraBaseFov, 14, dt);
    playerGroup.visible = false;
    viewWeaponRoot.visible = state === 'playing';
  } else if (cameraMode === 1) {
    const fwd = forwardVector(), right = rightVector();
    const desired = player.pos.clone()
      .add(fwd.multiplyScalar(-4.4 - (input.ads ? 1.1 : 0)))
      .add(right.multiplyScalar(0.78))
      .add(new THREE.Vector3(0, 2.18 + (input.ads ? -0.12 : 0), 0));
    const minY = groundAt(desired.x, desired.z) + 0.55;
    desired.y = Math.max(desired.y, minY);
    cameraTargetPos.lerp(desired, 1 - Math.exp(-8 * dt));
    camera.position.copy(cameraTargetPos);
    camera.position.y += bob * 0.5;
    camera.fov = damp(camera.fov, cameraBaseFov + 2, 10, dt);
    playerGroup.visible = true;
    viewWeaponRoot.visible = false;
  } else {
    const c = activeCompanion();
    let desired;
    if (c) {
      desired = c.group.position.clone().add(new THREE.Vector3(0, Math.max(1.3, c.def.hover + 1.15), 0));
      c.group.visible = false;
    } else {
      const fwd = forwardVector(), right = rightVector();
      desired = player.pos.clone().add(fwd.multiplyScalar(-2.9)).add(right.multiplyScalar(-1.2)).add(new THREE.Vector3(0, 1.65, 0));
    }
    const minY = groundAt(desired.x, desired.z) + 0.45;
    desired.y = Math.max(desired.y, minY);
    cameraTargetPos.lerp(desired, 1 - Math.exp(-10 * dt));
    camera.position.copy(cameraTargetPos);
    camera.fov = damp(camera.fov, cameraBaseFov + 3, 9, dt);
    playerGroup.visible = true;
    viewWeaponRoot.visible = false;
  }
  camera.updateProjectionMatrix();
  // view model animation
  if (cameraMode === 0) {
    const spec = currentWeaponSpec();
    const adsY = input.ads ? -0.22 : -0.33;
    const adsX = input.ads ? 0.06 : 0.23;
    const adsZ = input.ads ? -0.68 : -0.58;
    const reloadTilt = reloading ? (1 - reloadTimer / Math.max(0.01, spec.reload)) : 0;
    viewWeaponRoot.position.x = damp(viewWeaponRoot.position.x, adsX + (input.ads ? 0 : sway * 0.22), 12, dt);
    viewWeaponRoot.position.y = damp(viewWeaponRoot.position.y, adsY + (input.ads ? 0 : bob * 0.5 - (player.moving ? 0.015 : 0)), 12, dt);
    viewWeaponRoot.position.z = damp(viewWeaponRoot.position.z, adsZ + (reloading ? -0.06 : 0), 12, dt);
    viewWeaponRoot.rotation.x = damp(viewWeaponRoot.rotation.x, input.ads ? 0 : reloading ? -0.38 - Math.sin(reloadTilt * Math.PI) * 0.22 : 0.02, 10, dt);
    viewWeaponRoot.rotation.z = damp(viewWeaponRoot.rotation.z, input.ads ? 0 : reloading ? 0.2 : 0.04, 10, dt);
    viewWeaponRoot.rotation.y = damp(viewWeaponRoot.rotation.y, input.ads ? 0 : 0.16, 8, dt);
  }
}
function cycleCamera() {
  cameraMode = (cameraMode + 1) % 3;
  if (cameraMode !== 2) updateTeamVisibility();
  const labels = ['FIRST PERSON', 'THIRD PERSON', 'SECOND PERSON'];
  const copy = ['GUNNER VIEW', 'OVERWATCH / SHOULDER', 'BOND SIGHT / ANIMA EYES'];
  $('cameraMode').textContent = labels[cameraMode];
  $('cameraChip').title = copy[cameraMode];
  cameraTargetPos.copy(camera.position);
  toast(`VIEW SYSTEM // ${labels[cameraMode]} — ${copy[cameraMode]}`, '');
  tone(540 + cameraMode * 80, 0.09, 0.025, 'sine', 1.4);
  if (cameraMode === 2 && !activeCompanion()) toast('NO ACTIVE ANIMA — BOND ONE TO SEE THROUGH ITS EYES', 'warn');
}
/* ---------------- mission + HUD ---------------- */
let lastMissionKey = '';
let lastPackKey = '';
let lastZone = '';
let lastBossActive = false;
function missionData() {
  if (quest.binds < 1) return {
    key: 'bind1', step: '01 / 04', title: 'THE FIRST BOND',
    copy: 'Weaken a wild Anima, then bind it with a Prism Orb.',
    hint: 'F · BIND ANIMA', count: `${quest.binds} / 1`, progress: Math.min(1, quest.binds)
  };
  if (quest.binds < 3) return {
    key: 'bind3', step: '02 / 04', title: 'WILD AT HEART',
    copy: 'Grow your pack. Three bonds will fracture the gate seal.',
    hint: 'T · RALLY PACK · H · TAME', count: `${quest.binds} / 3`, progress: quest.binds / 3
  };
  if (!quest.wardenDead) return {
    key: 'warden', step: '03 / 04', title: 'BREAK THE WARDEN',
    copy: 'The seal is shattered. Reach the Rift Gate and break its guardian.',
    hint: 'RIFT GATE · NORTH', count: 'GATE OPEN', progress: 0.66
  };
  return {
    key: 'seal', step: '04 / 04', title: 'SEAL THE RIFT',
    copy: 'The Warden has fallen. Return to the gate and close the breach.',
    hint: 'E · SEAL THE RIFT', count: 'READY', progress: 1
  };
}
function updateMission() {
  const m = missionData();
  if (m.key !== lastMissionKey) {
    if (lastMissionKey) {
      if (m.key === 'bind3') toast('DIRECTIVE UPDATED — BIND TWO MORE ANIMA', 'good');
      if (m.key === 'warden') toast('DIRECTIVE UPDATED — GO TO THE RIFT GATE', 'warn');
      if (m.key === 'seal') toast('DIRECTIVE UPDATED — SEAL THE RIFT GATE', 'good');
    }
    lastMissionKey = m.key;
  }
  $('missionStep').textContent = m.step;
  $('missionTitle').textContent = m.title;
  $('missionCopy').textContent = m.copy;
  $('missionHint').textContent = m.hint;
  $('missionCount').textContent = m.count;
  $('missionBar').style.width = `${m.progress * 100}%`;
}
function updateObjective() {
  let target = null, label = 'ANIMA SIGNAL';
  if (quest.binds < 3) {
    let best = null, bestD = Infinity;
    for (const c of creatures) {
      if (c.dead) continue;
      const d = c.group.position.distanceTo(player.pos);
      const score = c.weakened ? d - 30 : d;
      if (score < bestD) { bestD = score; best = c; }
    }
    if (best) { target = best.group.position.clone().add(new THREE.Vector3(0, 2.4 + best.def.hover, 0)); label = best.weakened ? `BIND ${best.def.name}` : best.def.name; }
  }
  if (!target && quest.binds >= 3 && !quest.wardenDead && boss && !boss.dead) {
    target = boss.group.position.clone().add(new THREE.Vector3(0, 3.4, 0)); label = 'RIFT WARDEN';
  }
  if (!target && quest.binds >= 3) {
    const gy = groundAt(0, -78);
    target = new THREE.Vector3(0, gy + 4.5, -78); label = quest.wardenDead ? 'SEAL THE RIFT' : 'RIFT GATE';
  }
  if (!target) {
    objectivePos.set(0, groundAt(0, 0) + 5, 0); label = 'BEACON ALPHA';
  } else objectivePos.copy(target);
  objectiveLabel = label;
  const marker = $('objectiveMarker');
  const dist = Math.hypot(objectivePos.x - player.pos.x, objectivePos.z - player.pos.z);
  if (state === 'playing' && dist > 9) {
    const v = objectivePos.clone().project(camera);
    if (v.z < 1 && v.x > -0.94 && v.x < 0.94 && v.y > -0.9 && v.y < 0.9) {
      marker.hidden = false;
      marker.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
      marker.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
      $('markerLabel').textContent = label;
      $('markerDistance').textContent = `${Math.round(dist)}M`;
    } else marker.hidden = true;
  } else marker.hidden = true;
  $('compassObjective').querySelector('span').textContent = label;
}
function updateTargetCard() {
  const card = $('targetCard');
  if (!aimTarget || state !== 'playing') { card.hidden = true; return; }
  const a = aimTarget;
  card.hidden = false;
  const isCreature = a.kind === 'creature';
  const isBoss = a.kind === 'boss';
  $('targetType').textContent = isCreature ? `WILD ANIMA · ${a.def.element}` : isBoss ? 'RIFT WARDEN' : 'HOLLOW STALKER';
  $('targetName').textContent = isCreature ? a.def.name : isBoss ? 'OSSuary' : 'HOLLOW STALKER';
  const dist = a.group.position.distanceTo(player.pos);
  $('targetDistance').textContent = `${Math.round(dist)}M`;
  const ratio = clamp(a.hp / a.maxHp, 0, 1);
  $('targetHealthBar').style.width = `${ratio * 100}%`;
  $('targetHpText').textContent = `${Math.ceil(a.hp)} / ${a.maxHp}`;
  card.classList.toggle('weakened', isCreature && a.weakened);
  card.classList.toggle('captured', false);
  if (isCreature) $('targetState').textContent = a.weakened ? 'BIND READY · F' : a.aggro ? 'AGGRO' : 'WILD';
  else if (isBoss) $('targetState').textContent = a.active ? 'HOSTILE' : 'SEALED';
  else $('targetState').textContent = a.aggro ? 'HOSTILE' : 'PATROL';
}
function updateBossBar() {
  const wrap = $('bossWrap');
  if (!boss || boss.dead || quest.binds < 3) { wrap.hidden = true; return; }
  const dist = boss.group.position.distanceTo(player.pos);
  if (dist > 78 || state !== 'playing') { wrap.hidden = true; return; }
  wrap.hidden = false;
  const ratio = clamp(boss.hp / boss.maxHp, 0, 1);
  $('bossBar').style.width = `${ratio * 100}%`;
  $('bossHpText').textContent = `${Math.ceil(ratio * 100)}%`;
}
function updatePackUI() {
  const key = `${team.length}|` + team.map(c => `${c.key}:${Math.round(c.bond)}:${activeCompanionIndex}`).join('|');
  if (key === lastPackKey) return;
  lastPackKey = key;
  $('packCount').textContent = `${team.length} / 3`;
  const slots = $('packSlots');
  slots.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const c = team[i];
    const el = document.createElement('div');
    el.className = 'pack-slot' + (c ? ' filled' : ' empty') + (i === activeCompanionIndex && c ? ' active' : '');
    if (c) {
      el.innerHTML = `<span>0${i + 1}</span><b>${c.def.name}</b><div class="mini-bond"><i style="width:${c.bond}%"></i></div><i>${Math.round(c.bond)}%</i>`;
      el.addEventListener('click', () => { if (team[i]) { activeCompanionIndex = i; updateTeamVisibility(); lastPackKey = ''; updateHUD(true); toast(`ACTIVE ANIMA // ${team[i].def.name}`, 'good'); } });
    } else {
      el.innerHTML = `<span>0${i + 1}</span><b>EMPTY</b><i>NO SIGNAL</i>`;
    }
    slots.appendChild(el);
  }
}
function updateWeaponVisuals() {
  const viewScale = [1, 0.82, 1.04, 0.72];
  const fit = clamp(viewCamera.aspect / 1.4, 0.7, 1);
  worldWeaponModels.forEach((m, i) => { m.visible = i === currentWeapon; });
  viewWeaponModels.forEach((m, i) => {
    m.visible = i === currentWeapon;
    m.scale.setScalar((viewScale[i] ?? 1) * fit);
  });
  viewWeaponModels[3].rotation.set(0.62, 0.55, 0.35);
  viewWeaponModels[3].position.set(0, 0.03, 0);
  $('cameraMode').textContent = ['FIRST PERSON', 'THIRD PERSON', 'SECOND PERSON'][cameraMode];
}
function updateHUD(force = false) {
  if (force || state === 'playing') {
    $('healthText').textContent = Math.ceil(player.health);
    $('healthSmall').textContent = Math.ceil(player.health);
    $('shieldSmall').textContent = Math.ceil(player.shield);
    $('healthBar').style.width = `${clamp(player.health / player.maxHealth, 0, 1) * 100}%`;
    $('shieldBar').style.width = `${clamp(player.shield / player.maxShield, 0, 1) * 100}%`;
    document.querySelector('.vitals').classList.toggle('low', player.health < 35);
    $('stimCount').textContent = player.stims;
    $('orbCount').textContent = player.orbs;
    $('shardCount').textContent = fmt(quest.shards);
    $('bindCount').textContent = quest.binds;
    $('enemyCount').textContent = hollows.filter(h => !h.dead).length + (boss && boss.active && !boss.dead ? 1 : 0);
    const spec = currentWeaponSpec();
    const st = weaponState[currentWeapon];
    $('weaponName').textContent = spec.name;
    $('weaponClass').textContent = spec.klass;
    $('fireMode').textContent = spec.mode;
    $('ammoMag').textContent = spec.id === 'cleaver' ? '∞' : st.mag;
    $('ammoReserve').textContent = spec.id === 'cleaver' ? '∞' : st.reserve;
    $('reloadHint').textContent = reloading ? 'RELOADING...' : 'R · RELOAD';
    $('reloadBar').style.width = reloading ? `${(1 - reloadTimer / Math.max(0.01, spec.reload)) * 100}%` : '0%';
    document.querySelectorAll('.wslot').forEach((el, i) => el.classList.toggle('active', i === currentWeapon));
    $('cameraMode').textContent = ['FIRST PERSON', 'THIRD PERSON', 'SECOND PERSON'][cameraMode];
    $('orbIcon').style.opacity = player.orbs > 0 ? '1' : '0.35';
    $('packAction').innerHTML = `<kbd>T</kbd> RALLY <kbd>H</kbd> TAME <kbd>V</kbd> SWAP`;
    updateMission();
    updatePackUI();
    updateTargetCard();
    updateBossBar();
    const near = nearestInteractable();
    if (near) {
      $('interactPrompt').hidden = false;
      $('interactText').textContent = near.label;
      lastPrompt = near.kind;
    } else {
      $('interactPrompt').hidden = true;
      lastPrompt = null;
    }
    $('headerZone').textContent = currentZoneName();
    const mins = 42 + Math.floor(gameTime / 60) % 60;
    $('timeLabel').textContent = `18:${String(mins).padStart(2, '0')}`;
    const cx = Math.round((player.pos.x + 180) * 3.1);
    const cz = Math.round((player.pos.z + 180) * 3.1);
    $('coordLabel').textContent = `N 41°${String(cz % 60).padStart(2, '0')}' · E 73°${String(cx % 60).padStart(2, '0')}'`;
    $('lockHint').hidden = !(state === 'playing' && !pointerLocked && !isTouch);
    if (team.length >= 3 && !lastBossActive && boss && !boss.active) {
      boss.active = true;
      if (boss.shield) boss.shield.visible = false;
      lastBossActive = true;
    }
  }
}
function currentZoneName() {
  let best = null, dist = 30;
  for (const p of POIS) {
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (d < dist) { dist = d; best = p; }
  }
  return best ? best.name : 'VERDANT WILDS';
}
function updateZoneDiscovery() {
  let near = null, dmin = 22;
  for (const p of POIS) {
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (d < dmin) { dmin = d; near = p; }
  }
  if (near && lastZone !== near.id) {
    lastZone = near.id;
    if (near.id !== 'beacon') {
      quest.shards += 75;
      toast(`LANDMARK DISCOVERED // ${near.name} · +75 SHARDS`, 'good');
      sfx('discover');
    }
  }
}

/* ---------------- compass + maps ---------------- */
const compassCanvas = $('compass');
const compassCtx = compassCanvas.getContext('2d');
function drawCompass() {
  const ctx = compassCtx, W = compassCanvas.width, H = compassCanvas.height;
  ctx.clearRect(0, 0, W, H);
  let heading = ((-player.yaw * 180 / Math.PI) % 360 + 360) % 360;
  ctx.strokeStyle = 'rgba(228,240,224,.28)';
  ctx.fillStyle = 'rgba(218,232,218,.7)';
  ctx.font = '10px "DM Mono", monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 1;
  const center = W / 2;
  for (let deg = 0; deg < 360; deg += 5) {
    let delta = ((deg - heading + 540) % 360) - 180;
    if (Math.abs(delta) > 65) continue;
    const x = center + delta * 3.2;
    const major = deg % 45 === 0;
    ctx.globalAlpha = 1 - Math.abs(delta) / 85;
    ctx.beginPath();
    ctx.moveTo(x, major ? 21 : 27);
    ctx.lineTo(x, major ? 33 : 31);
    ctx.stroke();
    if (major) {
      const cards = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
      ctx.fillText(cards[deg], x, 45);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#c8f36a';
  ctx.beginPath();
  ctx.moveTo(center, 12); ctx.lineTo(center - 4, 19); ctx.lineTo(center + 4, 19); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(200,243,106,.4)';
  ctx.fillRect(center - 0.5, 19, 1, 14);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c8f36a';
  ctx.font = '9px "DM Mono", monospace';
  ctx.fillText(`${String(Math.round(heading)).padStart(3, '0')}°`, 12, 25);
}
let mapBaseCanvas = null;
function initMapBase() {
  const size = 300;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const worldScale = 220 / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const wx = (px / size - 0.5) * 220;
      const wz = (py / size - 0.5) * 220;
      const h = heightAt(wx, wz);
      let r, gg, b;
      if (h < -2.2) {
        const depth = clamp((-h - 2.2) / 14, 0, 1);
        r = 10 - depth * 5; gg = 43 - depth * 18; b = 46 - depth * 13;
      } else if (h < 0.5) {
        r = 113; gg = 103; b = 72;
      } else {
        const dry = smoothstep(6, 13, h);
        r = lerp(58, 107, dry); gg = lerp(91, 104, dry); b = lerp(62, 74, dry);
        const pd = pathDistance(wx, wz);
        if (pd < 3.2) { const t = 1 - pd / 3.2; r = lerp(r, 151, t * 0.8); gg = lerp(gg, 134, t * 0.8); b = lerp(b, 92, t * 0.8); }
      }
      const i = (py * size + px) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // veil / grid
  g.globalAlpha = 0.1; g.strokeStyle = '#d9e8dc'; g.lineWidth = 0.6;
  for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(size / 2, size / 2, 12 + i * 11, 0, TAU); g.stroke(); }
  g.globalAlpha = 1;
  mapBaseCanvas = c;
}
function mapXY(ctx, x, z, cx, cy, scale) { return { x: cx + x * scale, y: cy + z * scale }; }
function drawMapContents(ctx, cx, cy, scale, full = false) {
  // paths
  ctx.strokeStyle = full ? 'rgba(212,190,132,.32)' : 'rgba(212,190,132,.26)';
  ctx.lineWidth = full ? 2.2 : 1.2;
  for (const route of PATHS) {
    ctx.beginPath();
    route.forEach((p, i) => { const m = mapXY(ctx, p[0], p[1], cx, cy, scale); if (i) ctx.lineTo(m.x, m.y); else ctx.moveTo(m.x, m.y); });
    ctx.stroke();
  }
  // POIs
  for (const p of POIS) {
    const m = mapXY(ctx, p.x, p.z, cx, cy, scale);
    if (p.id === 'gate') {
      ctx.strokeStyle = '#b991ff'; ctx.lineWidth = 2;
      ctx.strokeRect(m.x - 4, m.y - 4, 8, 8);
    } else {
      ctx.fillStyle = p.id === 'beacon' ? '#c8f36a' : '#ffb56b';
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    }
    if (full) {
      ctx.fillStyle = 'rgba(229,240,225,.75)';
      ctx.font = '10px "DM Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText(p.name, m.x + 8, m.y + 3);
    }
  }
  // creatures
  creatures.forEach(c => {
    if (c.dead) return;
    const m = mapXY(ctx, c.group.position.x, c.group.position.z, cx, cy, scale);
    ctx.fillStyle = c.weakened ? '#ffb56b' : '#79d9e3';
    ctx.beginPath(); ctx.arc(m.x, m.y, full ? 3.2 : 2.1, 0, TAU); ctx.fill();
    if (c.weakened) { ctx.strokeStyle = '#ffb56b'; ctx.beginPath(); ctx.arc(m.x, m.y, 5, 0, TAU); ctx.stroke(); }
  });
  // hollows
  hollows.forEach(h => {
    if (h.dead) return;
    const m = mapXY(ctx, h.group.position.x, h.group.position.z, cx, cy, scale);
    ctx.fillStyle = '#ff6f5d';
    ctx.beginPath(); ctx.arc(m.x, m.y, full ? 3 : 1.8, 0, TAU); ctx.fill();
  });
  if (boss && !boss.dead) {
    const m = mapXY(ctx, boss.group.position.x, boss.group.position.z, cx, cy, scale);
    ctx.strokeStyle = '#ff875f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(m.x, m.y, full ? 7 : 4, 0, TAU); ctx.stroke();
  }
  // companion
  const comp = activeCompanion();
  if (comp) {
    const m = mapXY(ctx, comp.group.position.x, comp.group.position.z, cx, cy, scale);
    ctx.fillStyle = '#a7e95f';
    ctx.beginPath(); ctx.arc(m.x, m.y, 2, 0, TAU); ctx.fill();
  }
  // player
  const pp = mapXY(ctx, player.pos.x, player.pos.z, cx, cy, scale);
  ctx.save(); ctx.translate(pp.x, pp.y); ctx.rotate(-player.yaw);
  ctx.fillStyle = '#e9ffbd';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(0, 3); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(200,243,106,.4)';
  ctx.beginPath(); ctx.arc(pp.x, pp.y, 8, 0, TAU); ctx.stroke();
}
function drawMinimap() {
  const c = $('minimap'), ctx = c.getContext('2d');
  const W = c.width, H = c.height, cx = W / 2, cy = H / 2;
  const scale = 0.82;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, W / 2 - 2, 0, TAU); ctx.clip();
  ctx.fillStyle = '#09221c'; ctx.fillRect(0, 0, W, H);
  if (mapBaseCanvas) ctx.drawImage(mapBaseCanvas, 2, 2, W - 4, H - 4);
  ctx.fillStyle = 'rgba(4,16,13,.16)'; ctx.fillRect(0, 0, W, H);
  drawMapContents(ctx, cx, cy, scale, false);
  ctx.strokeStyle = 'rgba(200,243,106,.18)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, 12 + i * 20, 0, TAU); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(224,238,225,.32)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, W / 2 - 2, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#c8f36a'; ctx.font = '8px "DM Mono", monospace'; ctx.textAlign = 'center';
  ctx.fillText('N', cx, 12);
}
function drawFullMap() {
  const c = $('fullMap'), ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#09221c'; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, scale = 2.65;
  if (mapBaseCanvas) ctx.drawImage(mapBaseCanvas, cx - 110 * scale, cy - 110 * scale, 220 * scale, 220 * scale);
  // grid
  ctx.strokeStyle = 'rgba(179,209,186,.08)'; ctx.lineWidth = 1;
  for (let i = -100; i <= 100; i += 20) {
    ctx.beginPath(); ctx.moveTo(cx + i * scale, 20); ctx.lineTo(cx + i * scale, H - 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, cy + i * scale); ctx.lineTo(W - 30, cy + i * scale); ctx.stroke();
  }
  drawMapContents(ctx, cx, cy, scale, true);
  ctx.strokeStyle = 'rgba(200,243,106,.22)'; ctx.lineWidth = 2;
  ctx.strokeRect(cx - 102 * scale, cy - 102 * scale, 204 * scale, 204 * scale);
  ctx.fillStyle = 'rgba(200,243,106,.7)'; ctx.font = '11px "DM Mono", monospace'; ctx.textAlign = 'left';
  ctx.fillText('RIFT CARTOGRAPHY // SECTOR 07', 24, 28);
  ctx.textAlign = 'right';
  ctx.fillText('N ↑', W - 24, 28);
}
/* ---------------- game flow ---------------- */
function requestPointerLock() {
  if (isTouch || state !== 'playing') return;
  if (document.pointerLockElement === canvas) return;
  try {
    const p = canvas.requestPointerLock && canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (err) { /* fallback aim remains available */ }
}
function startGame() {
  $('briefScreen').hidden = true;
  $('startScreen').classList.add('is-hidden');
  $('pauseScreen').hidden = true;
  $('resultScreen').hidden = true;
  $('deathScreen').hidden = true;
  $('mapScreen').hidden = true;
  $('touchControls').hidden = !isTouch;
  $('hud').hidden = false;
  state = 'playing';
  lastMissionKey = ''; lastPackKey = ''; lastZone = ''; lastBossActive = false;
  resetGame();
  updateWeaponVisuals();
  cameraTargetPos.copy(player.pos).add(new THREE.Vector3(0, 2.2, 4.2));
  playerGroup.visible = false;
  updateHUD(true);
  drawMinimap();
  drawCompass();
  if (!audioOn) setAudio(true);
  requestPointerLock();
  toast('DEPLOYED TO VERDANT RIFT // FIND THE WILD SIGNAL', 'good');
  setTimeout(() => { if (state === 'playing') requestPointerLock(); }, 80);
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  triggerHeld = false; input.fire = false; input.ads = false;
  keys.clear();
  $('pauseScreen').hidden = false;
  $('touchControls').hidden = true;
  const total = Math.max(1, Math.round((performance.now() - quest.startedAt) / 1000));
  const mm = Math.floor(total / 60), ss = total % 60;
  $('pauseStats').innerHTML = `
    <div class="panel-stat-cell"><span>RIFT TIME</span><b>${mm}:${String(ss).padStart(2, '0')}</b></div>
    <div class="panel-stat-cell"><span>BONDED PACK</span><b>${team.length} / 3</b></div>
    <div class="panel-stat-cell"><span>SHARDS SECURED</span><b>${fmt(quest.shards)}</b></div>
    <div class="panel-stat-cell"><span>HOLLOW DOWN</span><b>${quest.hollowKills}</b></div>`;
  if (document.pointerLockElement) document.exitPointerLock();
}
function resumeGame() {
  if (state !== 'paused') return;
  $('pauseScreen').hidden = true;
  state = 'playing';
  $('touchControls').hidden = !isTouch;
  last = performance.now();
  updateHUD(true);
  requestPointerLock();
}
function togglePause() {
  if (state === 'playing') pauseGame();
  else if (state === 'paused') resumeGame();
}
function openMap() {
  if (state !== 'playing') return;
  state = 'map';
  triggerHeld = false; input.fire = false; input.ads = false;
  $('mapScreen').hidden = false;
  $('touchControls').hidden = true;
  drawFullMap();
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeMap() {
  if (state !== 'map') return;
  state = 'playing';
  $('mapScreen').hidden = true;
  $('touchControls').hidden = !isTouch;
  updateHUD(true);
  requestPointerLock();
}
function showBrief() { $('briefScreen').hidden = false; }
function hideBrief() { $('briefScreen').hidden = true; }
function showResult(won) {
  state = 'result';
  const total = Math.max(1, Math.round((performance.now() - quest.startedAt) / 1000));
  const mm = Math.floor(total / 60), ss = total % 60;
  $('resultStats').innerHTML = `
    <div><span>RIFT TIME</span><b>${mm}:${String(ss).padStart(2, '0')}</b></div>
    <div><span>BONDED PACK</span><b class="lime">${team.length} / 3</b></div>
    <div><span>SHARDS</span><b class="lime">${fmt(quest.shards)}</b></div>
    <div><span>HOLLOW DOWN</span><b>${quest.hollowKills}</b></div>`;
  $('resultKicker').textContent = won ? 'RIFT SEALED // EXPEDITION COMPLETE' : 'SIGNAL LOST';
  $('resultTitle').innerHTML = won ? 'THE ISLAND<br><span>REMEMBERS.</span>' : 'THE WILD<br><span>WON THIS ONE.</span>';
  $('resultCopy').textContent = won ? 'The breach is closed. Three souls chose to follow you home. For now.' : 'The beacon pulls you back. Your pack refuses to leave without you.';
  $('hud').hidden = true;
  $('touchControls').hidden = true;
  $('resultScreen').hidden = false;
  $('lockHint').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
function updateRespawn(rawDt) {
  deathTimer -= rawDt;
  $('respawnTimer').textContent = Math.max(0, Math.ceil(deathTimer));
  if (deathTimer <= 0) respawnPlayer();
}

/* ---------------- world animation ---------------- */
function updateWorldVisuals(dt) {
  waterUniforms.uTime.value = worldTime;
  skyMat.uniforms.uTime.value = worldTime;
  if (worldAnim.grassShader) worldAnim.grassShader.uniforms.uTime.value = worldTime;
  sky.position.copy(camera.position);
  clouds.rotation.y = Math.sin(worldTime * 0.008) * 0.05;
  if (worldAnim.beaconCrystal) {
    worldAnim.beaconCrystal.rotation.y = worldTime * 0.7;
    worldAnim.beaconCrystal.position.y = 4.9 + Math.sin(worldTime * 1.4) * 0.12;
  }
  for (const r of worldAnim.rings) {
    r.mesh.rotation.z += r.speed * dt;
    r.mesh.rotation.x += r.speed * dt * 0.42;
    r.mesh.position.y = r.y + Math.sin(worldTime * 1.2 + r.speed * 4) * 0.08;
  }
  for (const c of worldAnim.crystals) {
    c.mesh.position.y = c.base + Math.sin(worldTime * 1.9 + c.phase) * c.amp;
    c.mesh.rotation.y += dt * 0.5;
  }
  for (const c of worldAnim.floating) {
    c.position.y = c.userData.baseY + Math.sin(worldTime * 0.6 + c.userData.phase) * 1.2;
    c.rotation.y += dt * 0.05;
  }
  if (worldAnim.gateRing) {
    worldAnim.gateRing.rotation.z += dt * 0.32;
    worldAnim.gateRing.material.emissiveIntensity = 2.2 + Math.sin(worldTime * 2.3) * 0.5;
  }
  if (worldAnim.gatePortal) worldAnim.gatePortal.uniforms.uTime.value = worldTime;
  if (worldAnim.gateShield) {
    worldAnim.gateShield.rotation.y += dt * 0.12;
    if (worldAnim.gateShield.visible) worldAnim.gateShield.material.opacity = 0.075 + Math.sin(worldTime * 1.8) * 0.035;
  }
  if (worldAnim.gateLight) worldAnim.gateLight.intensity = 26 + Math.sin(worldTime * 2.2) * 6;
  if (worldAnim.fireflies) {
    worldAnim.fireflies.rotation.y += dt * 0.12;
    worldAnim.fireflies.position.y = Math.sin(worldTime * 0.8) * 0.3;
  }
  if (worldAnim.campFire) worldAnim.campFire.scale.set(1.8 + Math.sin(worldTime * 7) * 0.18, 3 + Math.sin(worldTime * 5.5) * 0.3, 1);
  for (const s of worldAnim.ruinsStones) {
    s.mesh.position.y = s.base + Math.sin(worldTime * 1.4 + s.phase) * s.amp;
    s.mesh.rotation.y += dt * s.rot; s.mesh.rotation.x += dt * s.rot * 0.4;
  }
  if (worldAnim.shrineCrystal) {
    worldAnim.shrineCrystal.rotation.y = worldTime * 0.6;
    worldAnim.shrineCrystal.position.y = 2.3 + Math.sin(worldTime * 1.7) * 0.12;
  }
  for (const f of worldAnim.gateBraziers) {
    f.scale.set(2.1 + Math.sin(worldTime * 6.2 + f.position.x) * 0.16, 3.1 + Math.sin(worldTime * 5 + f.position.x) * 0.32, 1);
  }
  if (worldAnim.motes) worldAnim.motes.rotation.y = worldTime * 0.012;
  // idle anima on the menu
  if (state === 'menu' || state === 'result') {
    for (const c of creatures) {
      c.model.anim(worldTime, c.phase);
      c.group.position.y = groundAt(c.group.position.x, c.group.position.z) + c.def.hover;
    }
    for (const h of hollows) {
      h.group.position.y = groundAt(h.group.position.x, h.group.position.z) + Math.sin(worldTime * 1.8 + h.phase) * 0.02;
    }
  }
}

/* ---------------- input ---------------- */
function switchWeapon(i) {
  if (state !== 'playing' || player.dead) return;
  if (i === currentWeapon) return;
  currentWeapon = i;
  reloading = false; reloadTimer = 0;
  fireCooldown = 0.18;
  updateWeaponVisuals();
  updateHUD(true);
  const spec = currentWeaponSpec();
  toast(`${spec.name} EQUIPPED // ${spec.klass}`, '');
  tone(300 + i * 55, 0.08, 0.022, 'triangle', 1.2);
}
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' || k === 'tab') e.preventDefault();
  if (e.repeat) { if (k === ' ') input.jump = true; return; }
  keys.add(k);
  if (state === 'playing') {
    if (k === 'escape' || k === 'p') { pauseGame(); return; }
    if (k === '1') switchWeapon(0);
    if (k === '2') switchWeapon(1);
    if (k === '3') switchWeapon(2);
    if (k === '4') switchWeapon(3);
    if (k === 'r') startReload();
    if (k === 'f') tryBind();
    if (k === 'e') doInteract();
    if (k === 'q') useStim();
    if (k === 'c') cycleCamera();
    if (k === 't') rallyCompanion();
    if (k === 'h') petCompanion();
    if (k === 'v') swapCompanion();
    if (k === 'm') openMap();
    if (k === ' ') input.jump = true;
  } else if (state === 'paused') {
    if (k === 'escape' || k === 'p') resumeGame();
  } else if (state === 'map') {
    if (k === 'escape' || k === 'm') closeMap();
  } else if (state === 'dead') {
    if (k === 'enter') respawnPlayer();
  } else if (state === 'menu') {
    if (k === 'enter') startGame();
  }
});
window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
window.addEventListener('blur', () => { keys.clear(); input.fire = false; input.ads = false; });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    player.yaw -= e.movementX * 0.00215;
    player.pitch = clamp(player.pitch - e.movementY * 0.00195, -1.25, 1.18);
  } else if (state === 'playing') {
    const r = canvas.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
    pointerNDC.set(nx * 2 - 1, -(ny * 2 - 1));
    const ret = $('reticle');
    ret.style.left = `${clamp(nx, 0, 1) * 100}%`;
    ret.style.top = `${clamp(ny, 0, 1) * 100}%`;
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  if (!isTouch && document.pointerLockElement !== canvas) requestPointerLock();
  if (e.button === 0) {
    input.fire = true;
    triggerHeld = true;
    shootWeapon();
  }
  if (e.button === 2) input.ads = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) { input.fire = false; triggerHeld = false; }
  if (e.button === 2) input.ads = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('wheel', (e) => {
  if (state !== 'playing') return;
  e.preventDefault();
  const dir = e.deltaY > 0 ? 1 : -1;
  switchWeapon((currentWeapon + dir + 4) % 4);
}, { passive: false });
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  $('lockHint').hidden = pointerLocked || state !== 'playing' || isTouch;
  if (pointerLocked) {
    $('reticle').style.left = '50%';
    $('reticle').style.top = '50%';
    pointerNDC.set(0, 0);
  } else if (state === 'playing' && !isTouch) {
    pauseGame();
  }
});
document.addEventListener('pointerlockerror', () => { $('lockHint').hidden = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pauseGame(); });

// touch joystick
(function setupTouch() {
  const stick = $('touchStick');
  let stickId = null, center = null, max = 42;
  const knob = stick.querySelector('i');
  function updateStick(e) {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - center.x, dy = e.clientY - center.y;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx *= max / d; dy *= max / d; }
    input.right = dx / max; input.forward = -dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    stickId = e.pointerId;
    const r = stick.getBoundingClientRect();
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    stick.setPointerCapture(e.pointerId);
    updateStick(e);
  });
  stick.addEventListener('pointermove', (e) => { e.preventDefault(); updateStick(e); });
  const end = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; input.forward = 0; input.right = 0; knob.style.transform = '';
  };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  const look = $('touchLook');
  let lookId = null, lx = 0, ly = 0;
  look.addEventListener('pointerdown', (e) => {
    e.preventDefault(); lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    look.setPointerCapture(e.pointerId);
  });
  look.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    e.preventDefault();
    player.yaw -= (e.clientX - lx) * 0.006;
    player.pitch = clamp(player.pitch - (e.clientY - ly) * 0.0045, -1.25, 1.18);
    lx = e.clientX; ly = e.clientY;
  });
  const lookEnd = (e) => { if (e.pointerId === lookId) lookId = null; };
  look.addEventListener('pointerup', lookEnd); look.addEventListener('pointercancel', lookEnd);
  const bindHold = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); on(); });
    el.addEventListener('pointerup', (e) => { e.preventDefault(); if (off) off(); });
    el.addEventListener('pointercancel', (e) => { if (off) off(); });
  };
  bindHold($('touchFire'), () => { input.fire = true; shootWeapon(); }, () => { input.fire = false; });
  bindHold($('touchJump'), () => { input.jump = true; });
  bindHold($('touchBind'), () => tryBind());
  bindHold($('touchCamera'), () => cycleCamera());
  bindHold($('touchInteract'), () => doInteract());
  bindHold($('touchReload'), () => startReload());
})();

/* ---------------- UI button wiring ---------------- */
$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', resumeGame);
$('restartBtn').addEventListener('click', () => {
  $('pauseScreen').hidden = true;
  startGame();
});
$('briefBtn').addEventListener('click', showBrief);
$('briefClose').addEventListener('click', hideBrief);
$('briefDeploy').addEventListener('click', () => { hideBrief(); startGame(); });
$('briefScreen').addEventListener('click', (e) => { if (e.target === $('briefScreen')) hideBrief(); });
$('pauseBtn').addEventListener('click', togglePause);
$('audioBtn').addEventListener('click', () => setAudio(!audioOn));
$('mapBtn').addEventListener('click', openMap);
$('mapClose').addEventListener('click', closeMap);
$('orbBtn').addEventListener('click', tryBind);
$('respawnBtn').addEventListener('click', respawnPlayer);
$('wordmark').addEventListener('click', (e) => { e.preventDefault(); if (state === 'playing') pauseGame(); });
document.querySelectorAll('.wslot').forEach((el, i) => el.addEventListener('click', () => switchWeapon(i)));
$('resultScreen').addEventListener('click', (e) => { if (e.target === $('resultScreen') && state === 'result') startGame(); });

/* ---------------- resize ---------------- */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  viewCamera.aspect = w / h;
  viewCamera.updateProjectionMatrix();
  updateWeaponVisuals();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.3 : 1.75));
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
}
window.addEventListener('resize', onResize);

/* ---------------- main loop ---------------- */
function updateCaptureOrbs(dt) {
  for (let i = captureOrbs.length - 1; i >= 0; i--) {
    const o = captureOrbs[i];
    o.t += dt / o.dur;
    o.mesh.rotation.y += dt * 8;
    o.mesh.rotation.z += dt * 5;
    const t = clamp(o.t, 0, 1);
    const arc = Math.sin(t * Math.PI) * 2.2;
    o.mesh.position.lerpVectors(o.start, o.end, t);
    o.mesh.position.y += arc;
    if (Math.random() < 0.45) burst(o.mesh.position, 0xc8f36a, 1, 0.5, 0.06);
    if (t >= 1) {
      const target = o.target;
      scene.remove(o.mesh);
      captureOrbs.splice(i, 1);
      if (!target || target.dead || !creatures.includes(target)) {
        toast('BOND LOST — TARGET OUT OF SIGNAL', 'warn');
        continue;
      }
      if (Math.random() <= o.chance || target.hp / target.maxHp <= 0.2) {
        captureCreature(target);
      } else {
        target.aggro = true;
        target.attackTimer = 0.1;
        burst(target.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff8d6c, 18, 3, 0.11);
        toast(`BOND FAILED — ${target.def.name} RESISTED · WEAKEN FURTHER`, 'warn');
        tone(180, 0.25, 0.04, 'sawtooth', 0.6);
      }
    }
  }
}
function updateRespawns(dt) {
  for (let i = respawns.length - 1; i >= 0; i--) {
    respawns[i].time -= dt;
    if (respawns[i].time <= 0) {
      const r = respawns[i];
      spawnCreature(r.key, r.x + rnd(-2, 2), r.z + rnd(-2, 2));
      burst(new THREE.Vector3(r.x, groundAt(r.x, r.z) + 1, r.z), 0xc8f36a, 12, 2, 0.1);
      respawns.splice(i, 1);
    }
  }
  for (let i = hollowRespawns.length - 1; i >= 0; i--) {
    hollowRespawns[i].time -= dt;
    if (hollowRespawns[i].time <= 0) {
      const r = hollowRespawns[i];
      spawnHollow(r.x, r.z);
      hollowRespawns.splice(i, 1);
    }
  }
}
function updateWorldLogic(dt) {
  for (const c of creatures) updateCreature(c, dt);
  for (const h of hollows) updateHollow(h, dt);
  updateBoss(dt);
  updateCompanion(dt);
  updateEnemyShots(dt);
  updateFriendlyShots(dt);
  updateCaptureOrbs(dt);
  updatePickups(dt);
  updateRespawns(dt);
}
function updateMenuWorld(dt) {
  // idle creatures breathe and turn slowly while the menu camera drifts
}
function animate(now) {
  requestAnimationFrame(animate);
  const rawDt = Math.min(0.05, Math.max(0.001, (now - last) / 1000 || 0.016));
  last = now;
  worldTime += rawDt;
  updateWorldVisuals(rawDt);
  updateFx(rawDt);

  if (state === 'playing') {
    gameTime += rawDt;
    const dt = rawDt * (captureSlow > 0 ? 0.34 : 1);
    captureSlow = Math.max(0, captureSlow - rawDt);
    updatePlayer(dt);
    if (state === 'playing') updateWorldLogic(dt);
    updateZoneDiscovery();
    scanTimer -= rawDt;
    if (scanTimer <= 0 && state === 'playing') { scanAimTarget(); scanTimer = 0.075; }
    if (state === 'playing') updateCamera(rawDt);
    updateObjective();
    drawCompass();
    hudTimer -= rawDt;
    if (hudTimer <= 0) {
      updateHUD(false);
      drawMinimap();
      hudTimer = 0.09;
    }
  } else if (state === 'dead') {
    updateRespawn(rawDt);
    updateFx(rawDt);
    updateCamera(rawDt);
  } else if (state === 'menu') {
    updateCamera(rawDt);
    drawCompass();
  } else if (state === 'paused' || state === 'map') {
    // frozen, but keep subtle world motion and post FX alive
  } else if (state === 'result') {
    const t = worldTime * 0.12;
    const target = player.pos;
    camera.position.set(target.x + Math.cos(t) * 6.2, target.y + 3.1, target.z + Math.sin(t) * 6.2);
    camera.lookAt(target.x, target.y + 1.5, target.z);
    camera.fov = 58; camera.updateProjectionMatrix();
    playerGroup.visible = true;
    viewWeaponRoot.visible = false;
  }

  if (shake > 0 && state === 'playing') {
    camera.position.x += rnd(-shake, shake) * 0.035;
    camera.position.y += rnd(-shake, shake) * 0.035;
    shake = Math.max(0, shake - rawDt * 22);
  }
  composer.render();
  if (viewWeaponRoot.visible && state === 'playing' && cameraMode === 0) {
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(viewScene, viewCamera);
    renderer.autoClear = prevAutoClear;
  }
}

/* ---------------- debug + boot ---------------- */
buildWorld();
initMapBase();
resetGame();
state = 'menu';
playerGroup.visible = false;
viewWeaponRoot.visible = false;
$('hud').hidden = true;
$('touchControls').hidden = true;
$('startScreen').hidden = false;
setAudio(false);
updateHUD(true);
drawMinimap();
drawCompass();
last = performance.now();
requestAnimationFrame(animate);

window.__wildline = {
  get state() { return state; },
  get player() { return player; },
  get quest() { return quest; },
  get team() { return team; },
  get aimTarget() { return aimTarget; },
  start: startGame,
  pause: pauseGame,
  resume: resumeGame,
  teleport(x, z, yaw = 0) {
    player.pos.set(x, groundAt(x, z), z); player.yaw = yaw; player.pitch = -0.04; player.vy = 0; player.grounded = true;
    cameraTargetPos.copy(player.pos);
  },
  camera(mode) { cameraMode = clamp(mode, 0, 2); updateWeaponVisuals(); },
  weaken() {
    if (aimTarget && aimTarget.kind === 'creature') { aimTarget.hp = aimTarget.maxHp * 0.12; aimTarget.weakened = true; }
  },
  bindNearest() {
    if (aimTarget && aimTarget.kind === 'creature') { aimTarget.hp = aimTarget.maxHp * 0.1; aimTarget.weakened = true; captureCreature(aimTarget); }
  },
  activateBoss() {
    if (quest.binds >= 3 && boss) { boss.active = true; if (boss.shield) boss.shield.visible = false; }
  },
  seal: sealRift,
  creatures: () => creatures,
  hollows: () => hollows,
  boss: () => boss,
  drawMap: drawFullMap,
  hud: updateHUD,
  debug: { scene, camera, viewScene, viewCamera, viewWeaponRoot, viewWeaponModels, worldWeaponModels }
};
