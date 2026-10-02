// The 3D world: camera, lights, bloom and the synthwave backdrop (sky, sun, mountains, grid).
//
// The camera is set up so that the z = 0 plane maps exactly onto the window: world x in
// [0, width] and y in [0, 1000] fill the screen. That lets the Java engine work in plain 2D while
// the UI renders in 3D, and keeps the blade's screen coordinates lined up with engine hitboxes.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getGlowTexture } from './models.js';

export const WORLD_H = 1000;
export const ASPECT_MIN = 0.6;
export const ASPECT_MAX = 3.2;
/** Camera height. The horizon sits at this height, so the grid fills the bottom third. */
export const EYE_Y = 340;
export const CAM_DIST = 1700;
const FULL_H = 2 * (WORLD_H - EYE_Y);
const FAR_SCALE = 3.4;

// Backdrop palettes. The world shifts color as the level climbs.
const THEMES = [
  { from: 1, grid: '#22d3ee', sky: '#3a0f63', top: '#05030f', sunTop: '#ffd36e', sunBottom: '#ff3cac' },
  { from: 3, grid: '#a78bfa', sky: '#2c1070', top: '#04030f', sunTop: '#ffe08a', sunBottom: '#c026d3' },
  { from: 5, grid: '#f472b6', sky: '#4c0d52', top: '#070310', sunTop: '#ffe9a0', sunBottom: '#ff2d6f' },
  { from: 7, grid: '#fb923c', sky: '#511227', top: '#0a0308', sunTop: '#fff1a8', sunBottom: '#ff3b1f' },
  { from: 10, grid: '#f43f5e', sky: '#470a14', top: '#0b0205', sunTop: '#ffffff', sunBottom: '#ff1e3c' },
];
const FREEZE_THEME = { grid: '#7dd3fc', sky: '#0b2f55', top: '#020617', sunTop: '#e0f2fe', sunBottom: '#38bdf8' };

const QUALITY = {
  high: { pixelRatio: 2, bloom: true },
  medium: { pixelRatio: 1.5, bloom: true },
  low: { pixelRatio: 1, bloom: false },
};

export class Stage {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.localClippingEnabled = true; // used to cut shapes in half
    // Neutral tone mapping keeps the neon colors saturated (ACES washes them toward white).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fovFor(), 16 / 9, 10, 60000);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.addLights();
    this.colors = {
      grid: new THREE.Color(THEMES[0].grid),
      sky: new THREE.Color(THEMES[0].sky),
      top: new THREE.Color(THEMES[0].top),
      sunTop: new THREE.Color(THEMES[0].sunTop),
      sunBottom: new THREE.Color(THEMES[0].sunBottom),
    };
    this.target = { ...THEMES[0] };
    this.level = 1;
    this.frozen = false;
    this.gridOffset = 0;
    this.gridSpeed = 160;
    this.shakeAmount = 0;
    this.time = 0;

    // Sun, mountains and stars live in a group scaled up around the camera: same apparent size,
    // but far enough away that the grid floor reaches almost to the horizon.
    this.far = new THREE.Group();
    this.far.scale.setScalar(FAR_SCALE);
    this.scene.add(this.far);

    this.buildSky();
    this.buildStars();
    this.buildSun();
    this.buildMountains();
    this.buildGrid();

    this.width = WORLD_H * 16 / 9;
    this.setQuality(quality);
    this.resize();
  }

  fovFor() {
    return THREE.MathUtils.radToDeg(2 * Math.atan(FULL_H / 2 / CAM_DIST));
  }

  addLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    this.scene.add(new THREE.HemisphereLight(0x9fdcff, 0x5b1a8a, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(-0.8, 1.2, 1.6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xff4fd8, 0.7);
    fill.position.set(1, -0.6, 0.8);
    this.scene.add(fill);
  }

  // ---- Backdrop ------------------------------------------------------------------------

  buildSky() {
    this.skyUniforms = {
      uTop: { value: this.colors.top },
      uHorizon: { value: this.colors.sky },
      uHorizonY: { value: EYE_Y / WORLD_H },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform float uHorizonY;
        varying vec2 vUv;
        void main() {
          float t = clamp((vUv.y - uHorizonY) / (1.0 - uHorizonY), 0.0, 1.0);
          vec3 col = mix(uHorizon * 1.15, uTop, pow(t, 0.55));
          col += uHorizon * 0.6 * exp(-abs(vUv.y - uHorizonY) * 28.0); // horizon haze
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    this.scene.add(sky);
  }

  buildStars() {
    const count = 900;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16000;
      pos[i * 3 + 1] = 200 + Math.random() * 4600;
      pos[i * 3 + 2] = -10700;
      const b = 0.25 + Math.random() * 0.75;
      col[i * 3] = b * (0.8 + Math.random() * 0.2);
      col[i * 3 + 1] = b * 0.85;
      col[i * 3 + 2] = b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false,
    }));
    this.far.add(this.stars);
  }

  buildSun() {
    const R = 1300;
    this.sunUniforms = {
      uTop: { value: this.colors.sunTop },
      uBottom: { value: this.colors.sunBottom },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.sunUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uBottom; uniform float uTime;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          if (d > 1.0) discard;
          float y = vUv.y;
          vec3 col = mix(uBottom, uTop, smoothstep(0.4, 1.0, y));
          float band = 0.8 - y;
          if (band > 0.0) {
            float s = fract(y * 22.0 + uTime * 0.12);
            if (s < band * 0.9) discard; // classic retro sun stripes
          }
          float edge = smoothstep(1.0, 0.985, d);
          gl_FragColor = vec4(col * 0.95, edge);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), mat);
    this.sun.position.set(0, 150, -9100);
    this.far.add(this.sun);

    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(), color: this.colors.sunBottom, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.sunGlow.scale.set(R * 5.2, R * 3.6, 1);
    this.sunGlow.position.set(0, 200, -9300);
    this.far.add(this.sunGlow);
  }

  buildMountains() {
    const shape = new THREE.Shape();
    const half = 9000;
    shape.moveTo(-half, -40);
    let x = -half;
    while (x < half) {
      const fromCenter = Math.abs(x) / half;
      // Low valley in the middle so the sun stays visible.
      const peak = EYE_Y + 80 + Math.pow(fromCenter, 1.3) * 1300 * (0.55 + Math.random() * 0.45);
      shape.lineTo(x, peak);
      x += 220 + Math.random() * 380;
      shape.lineTo(x, EYE_Y + (peak - EYE_Y) * (0.35 + Math.random() * 0.3));
      x += 160 + Math.random() * 260;
    }
    shape.lineTo(half, -40);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const mountains = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0d0520 }));
    const ridge = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), new THREE.LineBasicMaterial({
      color: this.colors.grid, transparent: true, opacity: 0.55, toneMapped: false,
    }));
    this.ridgeMaterial = ridge.material;
    this.mountains = new THREE.Group();
    this.mountains.add(mountains, ridge);
    this.mountains.position.set(0, -EYE_Y, -8500);
    this.far.add(this.mountains);
  }

  buildGrid() {
    this.gridUniforms = {
      uColor: { value: this.colors.grid },
      uHorizon: { value: this.colors.sky },
      uOffset: { value: 0 },
      uCell: { value: 140 },
      uFar: { value: 27000 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.gridUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uHorizon; uniform float uOffset; uniform float uCell; uniform float uFar;
        varying vec3 vWorld;
        void main() {
          vec2 p = vec2(vWorld.x, vWorld.z + uOffset) / uCell;
          vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          float depth = clamp(-vWorld.z / uFar, 0.0, 1.0);
          vec3 col = mix(uHorizon * 0.12, uHorizon * 0.55, depth);
          col += uColor * line * (1.9 * pow(1.0 - depth, 2.0) + 0.15);
          col = mix(col, uHorizon * 0.9, smoothstep(0.3, 0.95, depth));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(140000, 28500), mat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(0, -30, -12750);
    this.grid = grid;
    this.scene.add(grid);
  }

  // ---- Configuration -------------------------------------------------------------------

  setQuality(name) {
    this.quality = QUALITY[name] || QUALITY.high;
    if (this.quality.bloom && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.7, 0.45, 1.0);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
    const aspect = Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, w / h));
    this.aspect = aspect;
    this.width = WORLD_H * aspect;
    this.camera.aspect = this.width / FULL_H;
    this.camera.setViewOffset(this.width, FULL_H, 0, 0, this.width, WORLD_H);
    this.camera.updateProjectionMatrix();
    this.baseCamX = this.width / 2;
    this.camera.position.set(this.baseCamX, EYE_Y, CAM_DIST);
    this.far.position.set(this.width / 2, EYE_Y, CAM_DIST);
    this.grid.position.x = this.width / 2;
  }

  /** Picks the backdrop palette for a level. */
  setLevel(level) {
    this.level = level;
    if (!this.frozen) this.target = themeFor(level);
  }

  setFrozen(on) {
    this.frozen = on;
    this.target = on ? FREEZE_THEME : themeFor(this.level);
  }

  shake(amount) {
    this.shakeAmount = Math.min(40, this.shakeAmount + amount);
  }

  // ---- Frame ---------------------------------------------------------------------------

  update(dt, timeScale = 1) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 2.2);
    for (const key of ['grid', 'sky', 'top', 'sunTop', 'sunBottom']) {
      _c.set(this.target[key]);
      this.colors[key].lerp(_c, k);
    }
    this.ridgeMaterial.color.copy(this.colors.grid);
    this.sunGlow.material.color.copy(this.colors.sunBottom);

    const speed = (120 + this.level * 42) * (this.frozen ? 0.3 : 1);
    this.gridSpeed += (speed - this.gridSpeed) * k;
    this.gridOffset = (this.gridOffset + this.gridSpeed * dt * Math.max(timeScale, 0.15)) % 14000;
    this.gridUniforms.uOffset.value = this.gridOffset;
    this.sunUniforms.uTime.value = this.time;
    this.stars.rotation.z = Math.sin(this.time * 0.02) * 0.01;

    // Camera shake decays quickly.
    this.shakeAmount *= Math.exp(-dt * 7);
    const s = this.shakeAmount;
    this.camera.position.x = this.baseCamX + (Math.random() - 0.5) * s;
    this.camera.position.y = EYE_Y + (Math.random() - 0.5) * s;
  }

  render() {
    if (this.quality.bloom && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // ---- Coordinates ---------------------------------------------------------------------

  /** Window pixels -> engine world units. */
  toWorld(clientX, clientY) {
    return {
      x: (clientX / window.innerWidth) * this.width,
      y: (1 - clientY / window.innerHeight) * WORLD_H,
    };
  }

  /** Engine world units -> window pixels. */
  toScreen(x, y) {
    return {
      x: (x / this.width) * window.innerWidth,
      y: (1 - y / WORLD_H) * window.innerHeight,
    };
  }

  /** Where to place an object at depth z so it appears at world (x, y) on screen. */
  projectToDepth(x, y, z) {
    const f = (CAM_DIST - z) / CAM_DIST;
    return { x: this.width / 2 + (x - this.width / 2) * f, y: EYE_Y + (y - EYE_Y) * f, scale: f };
  }
}

const _c = new THREE.Color();

function themeFor(level) {
  let theme = THEMES[0];
  for (const t of THEMES) if (level >= t.from) theme = t;
  return theme;
}
