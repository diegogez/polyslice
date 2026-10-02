// Builds the 3D look of every entity the engine can send. Geometry and materials are cached and
// shared; each entity gets its own lightweight Group.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { iconCanvas, POWER_COLORS } from './icons.js';

export const SHAPE_COLORS = {
  CUBE: { color: 0x22d3ee, core: 0xcffafe },
  PYRAMID: { color: 0xf472b6, core: 0xfce7f3 },
  PRISM: { color: 0xa3e635, core: 0xf7fee7 },
  OCTAHEDRON: { color: 0xa78bfa, core: 0xf5f3ff },
  TORUS: { color: 0xfb923c, core: 0xfff7ed },
  FRACTAL: { color: 0x38bdf8, core: 0xe0f2fe },
  DODECAHEDRON: { color: 0xfacc15, core: 0xfefce8 },
  GEM: { color: 0xf0abfc, core: 0xffffff },
  SHARD: { color: 0x7dd3fc, core: 0xf0f9ff },
};
export const GOLD = { color: 0xffc83d, core: 0xfff3c4 };
export const BOMB_COLOR = 0xff3b3b;

const radii = {
  CUBE: 58, PYRAMID: 58, PRISM: 56, OCTAHEDRON: 56, TORUS: 54,
  FRACTAL: 74, DODECAHEDRON: 50, GEM: 40, SHARD: 34, BOMB: 54, ORB: 50,
};

/** Uses the engine's radii so visuals match hitboxes exactly. */
export function setCatalog(hello) {
  for (const s of hello.shapes) radii[s.code] = s.radius;
  radii.BOMB = hello.bombRadius;
  radii.ORB = hello.orbRadius;
}

export function radiusOf(code) {
  if (code.startsWith('PU_')) return radii.ORB;
  return radii[code] ?? 50;
}

export function colorOf(code, flags = 0) {
  if (flags & 1) return GOLD.color;
  if (code === 'BOMB') return BOMB_COLOR;
  if (code.startsWith('PU_')) return new THREE.Color(POWER_COLORS[code.slice(3)] || '#ffffff').getHex();
  return (SHAPE_COLORS[code] || SHAPE_COLORS.CUBE).color;
}

export function coreColorOf(code, flags = 0) {
  if (flags & 1) return GOLD.core;
  return (SHAPE_COLORS[code] || SHAPE_COLORS.CUBE).core;
}

// ---- Shared resources ------------------------------------------------------------------------

const geometries = new Map();
const materials = new Map();

function cached(map, key, make) {
  let v = map.get(key);
  if (!v) {
    v = make();
    map.set(key, v);
  }
  return v;
}

function shapeGeometry(code) {
  return cached(geometries, code, () => {
    const r = radiusOf(code);
    switch (code) {
      case 'CUBE': return new THREE.BoxGeometry(r * 1.3, r * 1.3, r * 1.3);
      case 'PYRAMID': return new THREE.ConeGeometry(r * 1.02, r * 1.55, 4, 1);
      case 'PRISM': return new THREE.CylinderGeometry(r * 0.8, r * 0.8, r * 1.2, 6, 1);
      case 'OCTAHEDRON': return new THREE.OctahedronGeometry(r * 1.1);
      case 'TORUS': return new THREE.TorusGeometry(r * 0.68, r * 0.28, 8, 18);
      case 'FRACTAL': return new THREE.BoxGeometry(r * 1.28, r * 1.28, r * 1.28);
      case 'DODECAHEDRON': return new THREE.DodecahedronGeometry(r * 1.08);
      case 'GEM': return new THREE.IcosahedronGeometry(r * 1.12, 0);
      case 'SHARD': return new THREE.BoxGeometry(r * 1.15, r * 1.15, r * 1.15);
      default: return new THREE.BoxGeometry(r, r, r);
    }
  });
}

function edgesGeometry(code) {
  return cached(geometries, `${code}:edges`, () => new THREE.EdgesGeometry(shapeGeometry(code), 24));
}

function solidMaterial(code, golden) {
  return cached(materials, `${code}:${golden}`, () => {
    if (golden) {
      return new THREE.MeshStandardMaterial({
        color: GOLD.color, metalness: 1, roughness: 0.2, emissive: 0xff8a00,
        emissiveIntensity: 0.4, flatShading: true,
      });
    }
    const { color } = SHAPE_COLORS[code] || SHAPE_COLORS.CUBE;
    if (code === 'GEM') {
      return new THREE.MeshPhysicalMaterial({
        color, metalness: 0.2, roughness: 0.05, clearcoat: 1, iridescence: 1,
        iridescenceIOR: 1.9, emissive: color, emissiveIntensity: 0.2, flatShading: true,
      });
    }
    if (code === 'FRACTAL') {
      return new THREE.MeshStandardMaterial({
        color, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.32,
        depthWrite: false, emissive: color, emissiveIntensity: 0.25, flatShading: true,
      });
    }
    return new THREE.MeshStandardMaterial({
      color, metalness: 0.15, roughness: 0.45, emissive: color, emissiveIntensity: 0.32,
      flatShading: true,
    });
  });
}

function edgeMaterial(code, golden) {
  return cached(materials, `${code}:${golden}:edges`, () => {
    const base = new THREE.Color(golden ? 0xffe9a8 : (SHAPE_COLORS[code] || SHAPE_COLORS.CUBE).color);
    // Lines skip tone mapping so they stay above the bloom threshold and glow.
    base.lerp(new THREE.Color(0xffffff), 0.25).multiplyScalar(2.4);
    return new THREE.LineBasicMaterial({ color: base, toneMapped: false, transparent: true, opacity: 0.95 });
  });
}

let glowTexture = null;
export function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

const iconTextures = new Map();
function iconTexture(kind) {
  return cached(iconTextures, kind, () => {
    const t = new THREE.CanvasTexture(iconCanvas(kind, 128));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// ---- Bomb ------------------------------------------------------------------------------------

const bombMaterials = {
  body: new THREE.MeshStandardMaterial({
    color: 0x1a1024, metalness: 0.7, roughness: 0.35, emissive: BOMB_COLOR,
    emissiveIntensity: 0.15, flatShading: true,
  }),
  edges: new THREE.LineBasicMaterial({ color: new THREE.Color(BOMB_COLOR).multiplyScalar(1.8), toneMapped: false, transparent: true }),
  fuse: new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.8 }),
};

function bombGeometry() {
  return cached(geometries, 'BOMB', () => {
    const r = radii.BOMB;
    const parts = [new THREE.IcosahedronGeometry(r * 0.78, 1)];
    const dirs = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
    const seen = new Set();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < dirs.count; i++) {
      const d = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
      const key = d.toArray().map((v) => v.toFixed(2)).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const spike = new THREE.ConeGeometry(r * 0.13, r * 0.42, 5);
      spike.translate(0, r * 0.88, 0);
      spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d));
      parts.push(spike);
    }
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  });
}

/** Pulses every bomb in sync. Call once per frame. */
export function animateShared(time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 9);
  bombMaterials.body.emissiveIntensity = 0.12 + pulse * 0.55;
  bombMaterials.edges.opacity = 0.35 + pulse * 0.65;
}

// ---- Factory ---------------------------------------------------------------------------------

/**
 * Creates the Group for one engine entity.
 * userData: { kind: 'shape' | 'bomb' | 'orb', code, spinAxis, spinSpeed, spinners[] }
 */
export function createEntityObject(code, flags = 0) {
  const group = new THREE.Group();
  const golden = (flags & 1) === 1;
  const spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  group.userData = { code, golden, spinAxis, spinSpeed: 1.2 + Math.random() * 2.2, spinners: [] };
  group.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));

  if (code === 'BOMB') {
    group.userData.kind = 'bomb';
    group.userData.spinSpeed *= 0.5;
    const body = new THREE.Mesh(bombGeometry(), bombMaterials.body);
    group.add(body);
    const edges = new THREE.LineSegments(
      cached(geometries, 'BOMB:edges', () => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(radii.BOMB * 0.8, 1), 10)),
      bombMaterials.edges,
    );
    group.add(edges);
    const fuse = new THREE.Mesh(
      cached(geometries, 'BOMB:fuse', () => new THREE.CylinderGeometry(radii.BOMB * 0.12, radii.BOMB * 0.16, radii.BOMB * 0.32, 8)),
      bombMaterials.fuse,
    );
    fuse.position.y = radii.BOMB * 0.85;
    group.add(fuse);
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(), color: 0xffb347, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    spark.position.y = radii.BOMB * 1.08;
    spark.scale.setScalar(radii.BOMB * 0.9);
    spark.userData.flicker = true;
    group.add(spark);
    group.userData.spark = spark;
    return group;
  }

  if (code.startsWith('PU_')) {
    const kind = code.slice(3);
    const r = radii.ORB;
    const color = new THREE.Color(POWER_COLORS[kind] || '#ffffff');
    group.userData.kind = 'orb';
    group.userData.power = kind;
    group.quaternion.identity();
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
    }));
    halo.scale.setScalar(r * 3.4);
    group.add(halo);
    const core = new THREE.Mesh(
      cached(geometries, 'ORB:core', () => new THREE.IcosahedronGeometry(r * 0.62, 2)),
      new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.55), transparent: true, opacity: 0.9 }),
    );
    group.add(core);
    const shell = new THREE.LineSegments(
      cached(geometries, 'ORB:shell', () => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(r * 1.0, 1))),
      new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.7), toneMapped: false, transparent: true, opacity: 0.9 }),
    );
    group.add(shell);
    group.userData.spinners.push({ obj: shell, axis: new THREE.Vector3(0.3, 1, 0.2).normalize(), speed: 1.6 });
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(kind), depthTest: false, toneMapped: false }));
    icon.scale.setScalar(r * 1.05);
    icon.renderOrder = 10;
    group.add(icon);
    group.userData.spinSpeed = 0;
    return group;
  }

  group.userData.kind = 'shape';
  const solid = new THREE.Mesh(shapeGeometry(code), solidMaterial(code, golden));
  solid.userData.solid = true;
  group.add(solid);
  group.add(new THREE.LineSegments(edgesGeometry(code), edgeMaterial(code, golden)));

  if (code === 'FRACTAL') {
    // A bright cube spinning inside a glass cube.
    const inner = new THREE.Mesh(
      cached(geometries, 'FRACTAL:inner', () => new THREE.BoxGeometry(radii.FRACTAL * 0.62, radii.FRACTAL * 0.62, radii.FRACTAL * 0.62)),
      cached(materials, `FRACTAL:inner:${golden}`, () => new THREE.MeshStandardMaterial({
        color: golden ? GOLD.color : 0xe0f2fe, emissive: golden ? 0xff9a00 : 0x38bdf8,
        emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.3, flatShading: true,
      })),
    );
    inner.userData.solid = true;
    group.add(inner);
    group.userData.spinners.push({ obj: inner, axis: new THREE.Vector3(1, 1, 0).normalize(), speed: -3 });
  }
  if (code === 'GEM') group.userData.spinSpeed *= 1.8;
  if (code === 'TORUS') group.userData.spinSpeed *= 0.8;
  return group;
}

/** Spins a group (and its inner spinners). `scaledDt` already includes the engine time scale. */
export function spin(group, scaledDt) {
  const ud = group.userData;
  if (ud.spinSpeed) {
    _q.setFromAxisAngle(ud.spinAxis, ud.spinSpeed * scaledDt);
    group.quaternion.premultiply(_q);
  }
  for (const s of ud.spinners) {
    _q.setFromAxisAngle(s.axis, s.speed * scaledDt);
    s.obj.quaternion.premultiply(_q);
  }
}
const _q = new THREE.Quaternion();

/** Only the per-entity materials (orbs, bomb sparks) are owned by a group; shared ones stay cached. */
export function disposeEntityObject(group) {
  if (group.userData.kind !== 'orb' && group.userData.kind !== 'bomb') return;
  group.traverse((o) => {
    if ((o.isMesh || o.isLineSegments || o.isSprite) && o.material) {
      const shared = Object.values(bombMaterials).includes(o.material);
      if (!shared) o.material.dispose();
    }
  });
}

// ---- Guide thumbnails ------------------------------------------------------------------------

/** Renders a transparent PNG preview of each entity code with its own short-lived renderer. */
export function renderThumbnails(codes, size = 160) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.setPixelRatio(2);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight(0x9fdcff, 0x40206a, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(-1, 1.4, 2);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 2000);
  camera.position.set(0, 0, 420);
  const out = {};
  for (const code of codes) {
    const flags = code === 'GOLDEN' ? 1 : 0;
    const obj = createEntityObject(code === 'GOLDEN' ? 'CUBE' : code, flags);
    obj.quaternion.setFromEuler(new THREE.Euler(0.55, 0.75, 0.15));
    if (obj.userData.kind === 'orb') obj.quaternion.identity();
    const r = radiusOf(code === 'GOLDEN' ? 'CUBE' : code);
    obj.scale.setScalar(70 / r);
    scene.add(obj);
    renderer.render(scene, camera);
    out[code] = renderer.domElement.toDataURL('image/png');
    scene.remove(obj);
  }
  scene.environment.dispose();
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
