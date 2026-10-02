// Pointer input -> engine blade samples, plus the 2D overlay that draws blade trails, slash
// streaks and the cursor glow.

const TRAIL_MS = 150;
const BLADE_COLORS = {
  cyan: ['#22d3ee', '#a5f3fc'],
  magenta: ['#e879f9', '#f5d0fe'],
  gold: ['#fbbf24', '#fef3c7'],
  lime: ['#a3e635', '#ecfccb'],
  white: ['#e2e8f0', '#ffffff'],
  rainbow: null,
};
export const BLADE_COLOR_NAMES = Object.keys(BLADE_COLORS);

export function bladeSwatch(name) {
  return BLADE_COLORS[name] ? BLADE_COLORS[name][0] : 'conic-gradient(#f43f5e,#fbbf24,#a3e635,#22d3ee,#a78bfa,#f43f5e)';
}

/** Recent blade positions in screen pixels, drawn as a tapered glowing ribbon. */
class Trail {
  constructor() {
    this.points = [];
  }

  add(x, y, t) {
    const last = this.points[this.points.length - 1];
    if (last && Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5) {
      last.t = t;
      return;
    }
    this.points.push({ x, y, t });
    if (this.points.length > 64) this.points.shift();
  }

  /** Pixels per millisecond over the newest few samples. */
  speed() {
    const p = this.points;
    if (p.length < 2) return 0;
    const a = p[Math.max(0, p.length - 4)];
    const b = p[p.length - 1];
    const dt = Math.max(1, b.t - a.t);
    return Math.hypot(b.x - a.x, b.y - a.y) / dt;
  }

  draw(g, now, width, colors, hueBase) {
    const pts = this.points.filter((p) => now - p.t < TRAIL_MS);
    this.points = pts;
    if (pts.length < 2) return;
    const n = pts.length;
    const left = [];
    const right = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[Math.min(n - 1, i + 1)];
      const o = pts[Math.max(0, i - 1)];
      let dx = q.x - o.x;
      let dy = q.y - o.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const age = (now - p.t) / TRAIL_MS;
      const w = width * Math.pow(i / (n - 1), 0.8) * (1 - age * 0.6);
      left.push([p.x - dy * w, p.y + dx * w]);
      right.push([p.x + dy * w, p.y - dx * w]);
    }
    const path = new Path2D();
    path.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < n; i++) path.lineTo(left[i][0], left[i][1]);
    // Rounded tip.
    const tip = pts[n - 1];
    path.arc(tip.x, tip.y, Math.hypot(left[n - 1][0] - tip.x, left[n - 1][1] - tip.y), 0, Math.PI * 2);
    for (let i = n - 1; i >= 0; i--) path.lineTo(right[i][0], right[i][1]);
    path.closePath();

    let glow;
    let core;
    if (colors) {
      [glow, core] = colors;
    } else {
      glow = `hsl(${hueBase % 360} 95% 60%)`;
      core = `hsl(${(hueBase + 40) % 360} 100% 88%)`;
    }
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.shadowColor = glow;
    g.shadowBlur = 26;
    g.fillStyle = glow;
    g.globalAlpha = 0.75;
    g.fill(path);
    // Bright core along the center line.
    g.shadowBlur = 8;
    g.globalAlpha = 1;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(1.5, width * 0.35);
    g.strokeStyle = core;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) g.lineTo(pts[i].x, pts[i].y);
    g.stroke();
    g.restore();
  }

  clear() {
    this.points.length = 0;
  }
}

export class BladeLayer {
  /**
   * @param {HTMLCanvasElement} canvas  full-window 2D overlay
   * @param {object} deps  { stage, send, settings, audio, canSlice(), isPlaying() }
   */
  constructor(canvas, deps) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.deps = deps;
    this.trail = new Trail();
    this.botTrail = new Trail();
    this.slashes = [];
    this.down = false;
    this.slicing = false;
    this.pointer = { x: -100, y: -100, visible: false };
    this.mega = false;
    this.lastSwoosh = 0;
    this.resize();
    this.attach();
  }

  resize() {
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.pr = pr;
    this.canvas.width = Math.round(window.innerWidth * pr);
    this.canvas.height = Math.round(window.innerHeight * pr);
  }

  attach() {
    window.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.down = true;
      this.handleMove(e, [e]);
    });
    window.addEventListener('pointermove', (e) => {
      const samples = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      this.handleMove(e, samples.length ? samples : [e]);
    });
    const release = () => {
      this.down = false;
      this.endStroke();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    document.addEventListener('pointerleave', () => {
      this.pointer.visible = false;
      release();
    });
    window.addEventListener('blur', release);
  }

  /** Hold-to-slice in menus; in game the player can choose "always on". */
  wantsSlice() {
    if (!this.deps.canSlice()) return false;
    if (this.down) return true;
    return this.deps.isPlaying() && this.deps.settings.get('sliceInput') === 'hover';
  }

  handleMove(e, samples) {
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.pointer.visible = true;
    if (!this.wantsSlice()) {
      this.endStroke();
      return;
    }
    if (!this.slicing) {
      this.slicing = true;
      this.trail.clear();
    }
    const pts = [];
    for (const s of samples) {
      const w = this.deps.stage.toWorld(s.clientX, s.clientY);
      pts.push([round1(w.x), round1(w.y), round1(s.timeStamp)]);
      this.trail.add(s.clientX, s.clientY, s.timeStamp);
    }
    this.deps.send({ cmd: 'blade', pts });

    const speed = this.trail.speed();
    if (speed > 2.2 && performance.now() - this.lastSwoosh > 140) {
      this.lastSwoosh = performance.now();
      this.deps.audio.swoosh(Math.min(1, speed / 6));
    }
  }

  endStroke() {
    if (!this.slicing) return;
    this.slicing = false;
    this.deps.send({ cmd: 'bladeUp' });
  }

  /** Demo bot position from the engine, in world units. */
  botSample(x, y, down, now) {
    if (!down) {
      this.botTrail.points.length = 0;
      return;
    }
    const s = this.deps.stage.toScreen(x, y);
    this.botTrail.add(s.x, s.y, now);
  }

  /** White streak across a sliced shape, along the blade direction. */
  slash(x, y, dirX, dirY, radius, color) {
    const s = this.deps.stage.toScreen(x, y);
    const scale = window.innerHeight / 1000;
    this.slashes.push({ x: s.x, y: s.y, dx: dirX, dy: -dirY, len: radius * 2.4 * scale, color, t: performance.now() });
  }

  draw(now, showCursor) {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(this.pr, 0, 0, this.pr, 0, 0);

    const choice = this.deps.settings.get('bladeColor');
    const colors = this.mega ? ['#4ade80', '#dcfce7'] : BLADE_COLORS[choice] ?? BLADE_COLORS.cyan;
    const width = (this.mega ? 15 : 7.5) * Math.max(0.8, window.innerHeight / 1000);
    const hue = (now / 4) % 360;

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      const k = (now - s.t) / 240;
      if (k >= 1) {
        this.slashes.splice(i, 1);
        continue;
      }
      const len = s.len * (0.6 + 0.6 * k);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 1 - k;
      g.strokeStyle = s.color;
      g.shadowColor = s.color;
      g.shadowBlur = 24;
      g.lineCap = 'round';
      g.lineWidth = 10 * (1 - k) + 1;
      g.beginPath();
      g.moveTo(s.x - s.dx * len, s.y - s.dy * len);
      g.lineTo(s.x + s.dx * len, s.y + s.dy * len);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3 * (1 - k) + 0.5;
      g.stroke();
      g.restore();
    }

    this.trail.draw(g, now, width, colors, hue);
    this.botTrail.draw(g, now, width, BLADE_COLORS.magenta, hue);

    if (showCursor && this.pointer.visible) {
      const [glow] = colors || ['#22d3ee'];
      const c = colors ? glow : `hsl(${hue} 95% 60%)`;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const r = this.slicing ? 9 : 6;
      const grad = g.createRadialGradient(this.pointer.x, this.pointer.y, 0, this.pointer.x, this.pointer.y, r * 3);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, c);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(this.pointer.x, this.pointer.y, r * 3, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
}

const round1 = (v) => Math.round(v * 10) / 10;
