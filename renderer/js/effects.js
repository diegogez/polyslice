// Purely cosmetic effects: sliced halves, sparks, shards, shockwave rings and glowing splats.
// None of this affects gameplay; the engine has already decided what happened.

import * as THREE from 'three';
import { getGlowTexture } from './models.js';
import { rand } from './util.js';

const MAX_SPARKS = 1800;
const MAX_SHARDS = 520;
const HALF_SEPARATION = 230;
const HALF_LIFE = 2.4;

export class Effects {
  constructor(stage) {
    this.stage = stage;
    this.scene = stage.scene;
    this.halves = [];
    this.rings = [];
    this.splats = [];
    this.buildSparks();
    this.buildShards();
    this.splatTextures = [0, 1, 2].map(() => makeSplatTexture());
  }

  // ---- Sparks (additive glowing points) ------------------------------------------------

  buildSparks() {
    this.sparks = [];
    const geo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(MAX_SPARKS * 3);
    this.sparkCol = new Float32Array(MAX_SPARKS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.sparkPoints = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 9, sizeAttenuation: false, vertexColors: true, map: getGlowTexture(), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.sparkPoints.frustumCulled = false;
    this.sparkPoints.renderOrder = 5;
    this.scene.add(this.sparkPoints);
  }

  spark(x, y, color, { speed = 500, life = 0.7, gravity = 0.5, z = 20, spread = Math.PI * 2, angle = 0, drag = 2.2, bright = 1.6 } = {}) {
    if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
    const a = angle + (Math.random() - 0.5) * spread;
    const v = speed * (0.35 + Math.random() * 0.65);
    const c = _color.set(color);
    this.sparks.push({
      x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(-80, 80),
      life, max: life * (0.6 + Math.random() * 0.4), gravity, drag,
      r: c.r * bright, g: c.g * bright, b: c.b * bright,
    });
  }

  burst(x, y, color, count, opts) {
    for (let i = 0; i < count; i++) this.spark(x, y, color, opts);
  }

  // ---- Shards (instanced tumbling tetrahedra) -----------------------------------------

  buildShards() {
    this.shards = [];
    this.shardMesh = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(10),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      MAX_SHARDS,
    );
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_SHARDS; i++) this.shardMesh.setColorAt(i, _color.set(0xffffff));
    this.shardMesh.count = 0;
    this.shardMesh.frustumCulled = false;
    this.scene.add(this.shardMesh);
  }

  shard(x, y, color, { speed = 520, life = 1.1, size = 1, bright = 1.2 } = {}) {
    if (this.shards.length >= MAX_SHARDS) this.shards.shift();
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    const c = new THREE.Color(color).multiplyScalar(bright);
    this.shards.push({
      x, y, z: rand(-30, 60), vx: Math.cos(a) * v, vy: Math.sin(a) * v + 160, vz: rand(-200, 200),
      rx: Math.random() * 6, ry: Math.random() * 6, sx: rand(-9, 9), sy: rand(-9, 9),
      life, max: life * (0.6 + Math.random() * 0.4), size: size * (0.5 + Math.random() * 0.8), color: c,
    });
  }

  // ---- Shockwave rings ----------------------------------------------------------------

  ring(x, y, color, { from = 20, to = 260, duration = 0.5, opacity = 0.9, width = 0.12 } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(1 - width, 1, 72),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(1.5), transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(x, y, 30);
    mesh.scale.setScalar(from);
    this.scene.add(mesh);
    this.rings.push({ mesh, from, to, duration, t: 0, opacity });
  }

  // ---- Splats on the back wall --------------------------------------------------------

  splat(x, y, color, size) {
    const z = -320;
    const p = this.stage.projectToDepth(x, y, z);
    const mat = new THREE.MeshBasicMaterial({
      map: this.splatTextures[Math.floor(Math.random() * this.splatTextures.length)],
      color: new THREE.Color(color), transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(_splatGeo, mat);
    mesh.position.set(p.x, p.y, z);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(size * p.scale * rand(2.2, 3.0));
    this.scene.add(mesh);
    this.splats.push({ mesh, t: 0, life: 2.8 });
    if (this.splats.length > 30) this.removeSplat(this.splats.shift());
  }

  removeSplat(s) {
    this.scene.remove(s.mesh);
    s.mesh.material.dispose();
  }

  // ---- Halves -------------------------------------------------------------------------

  /**
   * Splits an entity's Group into two clipped copies that fly apart along the cut normal.
   * Each copy keeps its own clipping plane, recomputed every frame as the half tumbles.
   * A back-face "core" mesh in a bright color makes the cut look solid.
   */
  slice(group, dirX, dirY, vx, vy, coreColor) {
    group.updateMatrixWorld(true);
    const normal = new THREE.Vector3(-dirY, dirX, 0).normalize();
    const localNormal = normal.clone().applyQuaternion(group.quaternion.clone().invert());
    const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const core = new THREE.Color(coreColor);
    const twistAxis = new THREE.Vector3(dirX, dirY, 0).normalize();

    for (const sign of [1, -1]) {
      const half = new THREE.Group();
      half.position.copy(group.position);
      half.quaternion.copy(group.quaternion);
      half.scale.copy(group.scale);
      const plane = new THREE.Plane();
      const mats = [];
      group.traverse((o) => {
        if (o === group || !(o.isMesh || o.isLineSegments)) return;
        const rel = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld);
        const m = o.material.clone();
        m.clippingPlanes = [plane];
        m.transparent = true;
        m.userData.baseOpacity = m.opacity;
        mats.push(m);
        const copy = o.isMesh ? new THREE.Mesh(o.geometry, m) : new THREE.LineSegments(o.geometry, m);
        rel.decompose(copy.position, copy.quaternion, copy.scale);
        half.add(copy);
        if (o.isMesh && o.userData.solid) {
          const im = new THREE.MeshBasicMaterial({
            color: core, side: THREE.BackSide, clippingPlanes: [plane], transparent: true, toneMapped: false,
          });
          im.userData.baseOpacity = 1;
          mats.push(im);
          const inner = new THREE.Mesh(o.geometry, im);
          rel.decompose(inner.position, inner.quaternion, inner.scale);
          half.add(inner);
        }
      });
      this.scene.add(half);
      this.halves.push({
        obj: half, plane, mats,
        localNormal: localNormal.clone().multiplyScalar(sign),
        vx: vx * 0.6 + normal.x * sign * HALF_SEPARATION,
        vy: Math.max(vy * 0.6, -200) + normal.y * sign * HALF_SEPARATION + 80,
        vz: rand(-40, 80),
        axis: twistAxis.clone().multiplyScalar(sign),
        spin: rand(2.5, 5),
        t: 0,
      });
      this.updatePlane(this.halves[this.halves.length - 1]);
    }
  }

  updatePlane(h) {
    _n.copy(h.localNormal).applyQuaternion(h.obj.quaternion);
    h.plane.setFromNormalAndCoplanarPoint(_n, h.obj.position);
  }

  // ---- Frame --------------------------------------------------------------------------

  /** `dt` is real seconds; `ts` the engine time scale (0 while paused); `g` engine gravity. */
  update(dt, ts, g) {
    const sdt = dt * ts;

    for (let i = this.halves.length - 1; i >= 0; i--) {
      const h = this.halves[i];
      h.t += sdt;
      h.vy -= g * sdt;
      h.obj.position.x += h.vx * sdt;
      h.obj.position.y += h.vy * sdt;
      h.obj.position.z += h.vz * sdt;
      _q.setFromAxisAngle(h.axis, h.spin * sdt);
      h.obj.quaternion.premultiply(_q);
      this.updatePlane(h);
      const fade = Math.min(1, Math.max(0, (HALF_LIFE - h.t) / 0.6));
      for (const m of h.mats) m.opacity = m.userData.baseOpacity * fade;
      if (h.t > HALF_LIFE || h.obj.position.y < -300) {
        this.scene.remove(h.obj);
        h.mats.forEach((m) => m.dispose());
        this.halves.splice(i, 1);
      }
    }

    // Sparks
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= sdt;
      if (p.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      const damp = Math.exp(-p.drag * sdt);
      p.vx *= damp;
      p.vy = p.vy * damp - g * p.gravity * sdt;
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;
      p.z += p.vz * sdt;
      const f = Math.pow(Math.min(1, p.life / p.max), 1.4);
      this.sparkPos[n * 3] = p.x;
      this.sparkPos[n * 3 + 1] = p.y;
      this.sparkPos[n * 3 + 2] = p.z;
      this.sparkCol[n * 3] = p.r * f;
      this.sparkCol[n * 3 + 1] = p.g * f;
      this.sparkCol[n * 3 + 2] = p.b * f;
      n++;
    }
    const sg = this.sparkPoints.geometry;
    sg.setDrawRange(0, n);
    sg.attributes.position.needsUpdate = true;
    sg.attributes.color.needsUpdate = true;

    // Shards
    let s = 0;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const p = this.shards[i];
      p.life -= sdt;
      if (p.life <= 0) {
        this.shards.splice(i, 1);
        continue;
      }
      p.vy -= g * 0.8 * sdt;
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;
      p.z += p.vz * sdt;
      p.rx += p.sx * sdt;
      p.ry += p.sy * sdt;
      const f = Math.min(1, p.life / p.max);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.rx, p.ry, 0);
      _dummy.scale.setScalar(p.size * (0.3 + 0.7 * f));
      _dummy.updateMatrix();
      this.shardMesh.setMatrixAt(s, _dummy.matrix);
      this.shardMesh.setColorAt(s, _color.copy(p.color).multiplyScalar(0.4 + 0.6 * f));
      s++;
    }
    this.shardMesh.count = s;
    this.shardMesh.instanceMatrix.needsUpdate = true;
    if (this.shardMesh.instanceColor) this.shardMesh.instanceColor.needsUpdate = true;

    // Rings use real time so they still finish while the world is frozen.
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt * (ts > 0 ? 1 : 0);
      const k = Math.min(1, r.t / r.duration);
      const e = 1 - Math.pow(1 - k, 3);
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * e);
      r.mesh.material.opacity = r.opacity * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }

    for (let i = this.splats.length - 1; i >= 0; i--) {
      const sp = this.splats[i];
      sp.t += dt * (ts > 0 ? 1 : 0);
      sp.mesh.material.opacity = 0.3 * Math.max(0, 1 - sp.t / sp.life);
      if (sp.t >= sp.life) {
        this.removeSplat(sp);
        this.splats.splice(i, 1);
      }
    }
  }

  clear() {
    for (const h of this.halves) {
      this.scene.remove(h.obj);
      h.mats.forEach((m) => m.dispose());
    }
    this.halves.length = 0;
    this.sparks.length = 0;
    this.shards.length = 0;
  }
}

const _color = new THREE.Color();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _dummy = new THREE.Object3D();
const _splatGeo = new THREE.PlaneGeometry(1, 1);

/** A soft, irregular blob with droplets, used as a glowing stain behind sliced shapes. */
function makeSplatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  const blob = (x, y, r, a) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.6, `rgba(255,255,255,${a * 0.6})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  // Irregular core made of overlapping lobes, plus a few small droplets.
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * 28;
    blob(Math.cos(a) * d, Math.sin(a) * d, 38 + Math.random() * 26, 0.45);
  }
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 70 + Math.random() * 45;
    blob(Math.cos(a) * d, Math.sin(a) * d, 4 + Math.random() * 9, 0.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
