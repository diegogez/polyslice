// Mirrors the engine's entities as 3D objects and turns engine events into visual effects.
//
// The engine sends authoritative snapshots at 60 Hz. Between snapshots each object is
// extrapolated with the same ballistic formula the engine uses, so motion stays smooth at any
// display refresh rate.

import * as THREE from 'three';
import {
  animateShared, colorOf, coreColorOf, createEntityObject, disposeEntityObject, radiusOf, spin,
} from './models.js';
import { POWER_COLORS } from './icons.js';
import { hex } from './util.js';

const MAX_EXTRAPOLATION_MS = 120;

export class GameView {
  constructor(stage, effects, blade) {
    this.stage = stage;
    this.effects = effects;
    this.blade = blade;
    this.views = new Map();
    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.g = 900;
    this.ts = 1;
    this.offset = null;
    this.stamp = performance.now();
    this.time = 0;
    this.seen = new Set();
  }

  /** Estimates when this snapshot was taken, in local time, from the engine clock. */
  beginFrame(msg, now) {
    const est = now - msg.clk;
    // Track the lowest observed latency; drift slowly so clock skew can't accumulate.
    if (this.offset === null || est < this.offset) this.offset = est;
    else this.offset += (est - this.offset) * 0.01;
    this.stamp = msg.clk + this.offset;
    this.g = msg.g;
    this.ts = msg.paused ? 0 : msg.ts;
  }

  sync(entities) {
    const seen = this.seen;
    seen.clear();
    for (const [id, code, x, y, vx, vy, flags] of entities) {
      let v = this.views.get(id);
      if (v && (v.code !== code || v.flags !== flags)) {
        this.remove(v);
        v = null;
      }
      if (!v) v = this.create(id, code, flags, x, y);
      v.sx = x;
      v.sy = y;
      v.vx = vx;
      v.vy = vy;
      seen.add(id);
    }
    for (const v of this.views.values()) {
      if (!seen.has(v.id)) this.remove(v);
    }
  }

  create(id, code, flags, x, y) {
    const group = createEntityObject(code, flags);
    group.position.set(x, y, 0);
    this.root.add(group);
    const v = { id, code, flags, group, sx: x, sy: y, vx: 0, vy: 0, golden: (flags & 1) === 1 };
    this.views.set(id, v);
    return v;
  }

  remove(v) {
    this.root.remove(v.group);
    disposeEntityObject(v.group);
    this.views.delete(v.id);
  }

  /** Clears everything (new session). Leftovers vanish in a little puff. */
  clear(puff = true) {
    for (const v of [...this.views.values()]) {
      if (puff) this.effects.burst(v.group.position.x, v.group.position.y, colorOf(v.code, v.flags), 10, { speed: 260, life: 0.5 });
      this.remove(v);
    }
  }

  onEvent(ev) {
    switch (ev.k) {
      case 'slice': return this.onSlice(ev);
      case 'bomb': return this.onBomb(ev);
      case 'power': return this.onPower(ev);
      case 'nova': return this.onNova();
      default: return undefined;
    }
  }

  onSlice(ev) {
    const v = this.views.get(ev.id);
    const flags = ev.golden ? 1 : 0;
    const color = colorOf(ev.shape, flags);
    const x = v ? v.group.position.x : ev.x;
    const y = v ? v.group.position.y : ev.y;
    const r = radiusOf(ev.shape);
    if (v) {
      const cut = new THREE.Color(color).lerp(new THREE.Color(coreColorOf(ev.shape, flags)), 0.45).multiplyScalar(1.15);
      this.effects.slice(v.group, ev.dx, ev.dy, v.vx, v.vy, cut);
      this.remove(v);
    }
    const along = Math.atan2(ev.dy, ev.dx);
    this.effects.burst(x, y, color, 14, { speed: 700, angle: along, spread: 0.7, life: 0.45 });
    this.effects.burst(x, y, color, 14, { speed: 700, angle: along + Math.PI, spread: 0.7, life: 0.45 });
    this.effects.burst(x, y, 0xffffff, 8, { speed: 380, life: 0.3 });
    for (let i = 0; i < 6; i++) this.effects.shard(x, y, color, { speed: 420, size: r / 60 });
    this.effects.splat(x, y, color, r);
    this.blade.slash(x, y, ev.dx, ev.dy, r, hex(color));
    if (ev.golden) {
      this.effects.ring(x, y, 0xffd36e, { to: 220, duration: 0.45 });
      this.effects.burst(x, y, 0xffd36e, 40, { speed: 900, life: 0.9, gravity: 0.2 });
    }
    if (ev.shape === 'FRACTAL') this.effects.ring(x, y, color, { to: 180, duration: 0.35 });
  }

  onBomb(ev) {
    const v = this.views.get(ev.id);
    const x = v ? v.group.position.x : ev.x;
    const y = v ? v.group.position.y : ev.y;
    if (v) this.remove(v);
    if (ev.blocked) {
      this.effects.ring(x, y, 0xc084fc, { to: 280, duration: 0.5 });
      this.effects.burst(x, y, 0xc084fc, 60, { speed: 700, life: 0.6 });
      return;
    }
    this.effects.ring(x, y, 0xffffff, { from: 10, to: 340, duration: 0.35, width: 0.2 });
    this.effects.ring(x, y, 0xff3b3b, { from: 30, to: 620, duration: 0.8, width: 0.08 });
    this.effects.burst(x, y, 0xff6a3d, 90, { speed: 1300, life: 0.9, gravity: 0.3 });
    this.effects.burst(x, y, 0xffd36e, 50, { speed: 800, life: 0.6 });
    for (let i = 0; i < 26; i++) this.effects.shard(x, y, 0x2a1830, { speed: 900, size: 1.6, bright: 0.6 });
    this.effects.splat(x, y, 0xff3b3b, 110);
  }

  onPower(ev) {
    const v = this.views.get(ev.id);
    const x = v ? v.group.position.x : ev.x;
    const y = v ? v.group.position.y : ev.y;
    if (v) this.remove(v);
    const color = new THREE.Color(POWER_COLORS[ev.p] || '#ffffff').getHex();
    this.effects.ring(x, y, color, { to: 320, duration: 0.55 });
    this.effects.ring(x, y, 0xffffff, { to: 160, duration: 0.3, width: 0.25 });
    this.effects.burst(x, y, color, 80, { speed: 1000, life: 0.8, gravity: 0.15 });
  }

  onNova() {
    const w = this.stage.width;
    this.effects.ring(w / 2, 500, 0xffffff, { from: 40, to: w, duration: 0.7, width: 0.04 });
  }

  update(dt, now) {
    const sdt = dt * this.ts;
    this.time += sdt;
    animateShared(this.time);
    const t = (Math.min(Math.max(now - this.stamp, 0), MAX_EXTRAPOLATION_MS) / 1000) * this.ts;
    const g = this.g;
    for (const v of this.views.values()) {
      const grp = v.group;
      grp.position.set(v.sx + v.vx * t, v.sy + v.vy * t - 0.5 * g * t * t, 0);
      spin(grp, sdt);
      const ud = grp.userData;
      if (v.golden && Math.random() < 0.35 * this.ts) {
        const r = radiusOf(v.code);
        this.effects.spark(grp.position.x + (Math.random() - 0.5) * r * 1.6, grp.position.y + (Math.random() - 0.5) * r * 1.6,
          0xffe08a, { speed: 60, life: 0.6, gravity: 0.05 });
      }
      if (ud.kind === 'bomb') {
        ud.spark.scale.setScalar(radiusOf('BOMB') * (0.6 + Math.random() * 0.6));
        if (Math.random() < 0.5 * this.ts) {
          const p = ud.spark.getWorldPosition(_v);
          this.effects.spark(p.x, p.y, 0xffb347, { speed: 160, life: 0.35, gravity: 0.6, z: 40 });
        }
      } else if (ud.kind === 'orb') {
        grp.children[0].scale.setScalar(radiusOf('ORB') * (3.2 + Math.sin(this.time * 6) * 0.4));
      }
    }
    this.effects.update(dt, this.ts, g);
  }
}

const _v = new THREE.Vector3();
