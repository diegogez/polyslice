// In-game heads-up display plus floating popups, banners and achievement toasts.

import { iconDataUrl, POWER_COLORS } from './icons.js';
import { colorOf } from './models.js';
import { el, fmt, fmtTime, hex } from './util.js';

const $ = (id) => document.getElementById(id);
const RING_LENGTH = 2 * Math.PI * 26;

export class Hud {
  constructor(stage) {
    this.stage = stage;
    this.root = $('hud');
    this.scoreEl = $('hud-score');
    this.bestEl = $('hud-best');
    this.levelEl = $('hud-level');
    this.multEl = $('hud-mult');
    this.progressEl = $('hud-progress');
    this.livesEl = $('hud-lives');
    this.timerEl = $('hud-timer');
    this.timeEl = $('hud-time');
    this.ringEl = $('hud-ring');
    this.powerEl = $('hud-powerups');
    this.comboEl = $('hud-combo');
    this.comboN = $('hud-combo-n');
    this.popups = $('popups');
    this.toasts = $('toasts');
    this.bannerEl = $('banner');
    this.pills = new Map();
    this.ringEl.style.strokeDasharray = `${RING_LENGTH}`;
    this.reset(0);
  }

  reset(best) {
    this.score = 0;
    this.shown = 0;
    this.best = best;
    this.lives = -1;
    this.level = 0;
    this.combo = 0;
    this.scoreEl.textContent = '0';
    this.bestEl.textContent = fmt(best);
    for (const p of this.pills.values()) p.node.remove();
    this.pills.clear();
    this.comboEl.classList.remove('show');
    this.root.classList.remove('double', 'shielded', 'warning');
  }

  show(on) {
    document.body.classList.toggle('hud-on', on);
  }

  update(msg) {
    this.score = msg.score;
    if (msg.score > this.best) {
      this.best = msg.score;
      this.bestEl.textContent = fmt(this.best);
      this.bestEl.parentElement.classList.add('beaten');
    }

    if (msg.level !== this.level) {
      this.level = msg.level;
      this.levelEl.textContent = msg.level;
      this.multEl.textContent = `×${msg.mult.toFixed(2)}`;
      this.root.dataset.level = Math.min(10, msg.level);
    }
    this.progressEl.style.transform = `scaleX(${msg.progress})`;

    const timed = msg.timeLimit > 0;
    this.root.classList.toggle('timed', timed);
    if (timed) {
      this.timeEl.textContent = fmtTime(msg.time);
      this.ringEl.style.strokeDashoffset = `${RING_LENGTH * (1 - msg.time / msg.timeLimit)}`;
      this.root.classList.toggle('warning', msg.time <= 10);
    } else if (msg.lives !== this.lives) {
      this.renderLives(msg.lives, msg.maxLives, this.lives);
      this.lives = msg.lives;
    }

    // Power-up pills with draining timers.
    const active = new Set();
    for (const [code, remaining, duration] of msg.pu) {
      active.add(code);
      let pill = this.pills.get(code);
      if (!pill) {
        const node = el('div', 'pill');
        node.style.setProperty('--c', POWER_COLORS[code] || '#fff');
        const img = el('img');
        img.src = iconDataUrl(code, 64);
        img.alt = '';
        const label = el('span', 'pill-name', prettyPower(code));
        const bar = el('div', 'pill-bar');
        const fill = el('i');
        bar.append(fill);
        node.append(img, label, bar);
        this.powerEl.append(node);
        pill = { node, fill };
        this.pills.set(code, pill);
      }
      pill.fill.style.transform = `scaleX(${Math.max(0, remaining / duration)})`;
    }
    for (const [code, pill] of this.pills) {
      if (!active.has(code)) {
        pill.node.classList.add('out');
        setTimeout(() => pill.node.remove(), 300);
        this.pills.delete(code);
      }
    }
    this.root.classList.toggle('double', active.has('DOUBLE'));
    this.root.classList.toggle('shielded', active.has('SHIELD'));

    if (msg.combo !== this.combo) {
      this.combo = msg.combo;
      if (msg.combo >= 2) {
        this.comboN.textContent = `×${msg.combo}`;
        this.comboEl.classList.add('show');
        this.comboEl.classList.remove('bump');
        void this.comboEl.offsetWidth; // restart the animation
        this.comboEl.classList.add('bump');
      } else {
        this.comboEl.classList.remove('show');
      }
    }
  }

  renderLives(lives, maxLives, previous) {
    const slots = Math.max(3, Math.min(maxLives, lives));
    this.livesEl.textContent = '';
    for (let i = 0; i < slots; i++) {
      const life = el('span', i < lives ? 'life' : 'life lost');
      if (previous >= 0 && i === lives && lives < previous) life.classList.add('just-lost');
      if (previous >= 0 && i === lives - 1 && lives > previous) life.classList.add('just-gained');
      this.livesEl.append(life);
    }
  }

  /** Smoothly counts the score up. Call every frame. */
  tick(dt) {
    if (this.shown === this.score) return;
    const diff = this.score - this.shown;
    this.shown += Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 14));
    if (Math.abs(this.score - this.shown) < 1) this.shown = this.score;
    this.scoreEl.textContent = fmt(this.shown);
  }

  // ---- Popups ------------------------------------------------------------------------------

  /** Floating text at a world position. */
  popup(x, y, text, cls = '', color = null) {
    const s = this.stage.toScreen(x, y);
    const node = el('div', `popup ${cls}`, text);
    node.style.left = `${Math.max(40, Math.min(window.innerWidth - 40, s.x))}px`;
    node.style.top = `${Math.max(60, Math.min(window.innerHeight - 40, s.y))}px`;
    if (color) node.style.setProperty('--c', color);
    this.popups.append(node);
    node.addEventListener('animationend', () => node.remove());
  }

  slicePopup(ev) {
    if (!ev.pts) return;
    const color = hex(colorOf(ev.shape, ev.golden ? 1 : 0));
    this.popup(ev.x, ev.y + 40, `+${fmt(ev.pts)}`, ev.golden ? 'golden' : '', color);
  }

  comboPopup(ev) {
    const node = el('div', 'popup combo');
    node.append(el('b', '', `${ev.n}× COMBO`), el('span', '', `+${fmt(ev.bonus)}`));
    const s = this.stage.toScreen(ev.x, ev.y);
    node.style.left = `${Math.max(140, Math.min(window.innerWidth - 140, s.x))}px`;
    node.style.top = `${Math.max(120, Math.min(window.innerHeight - 120, s.y - 60))}px`;
    node.style.setProperty('--size', `${Math.min(1.8, 1 + (ev.n - 3) * 0.12)}`);
    this.popups.append(node);
    node.addEventListener('animationend', () => node.remove());
  }

  /** Big centered text, e.g. "LEVEL 4" or "FREEZE!". */
  banner(title, sub = '', cls = '', color = null) {
    const b = this.bannerEl;
    b.className = `banner ${cls}`;
    b.style.setProperty('--c', color || '#22d3ee');
    b.innerHTML = '';
    b.append(el('div', 'banner-title', title));
    if (sub) b.append(el('div', 'banner-sub', sub));
    void b.offsetWidth;
    b.classList.add('play');
  }

  toast(title, desc, icon = '🏆') {
    const t = el('div', 'toast');
    const i = el('div', 'toast-icon', icon);
    const body = el('div', 'toast-body');
    body.append(el('small', '', 'ACHIEVEMENT UNLOCKED'), el('b', '', title), el('span', '', desc));
    t.append(i, body);
    this.toasts.append(t);
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4800);
  }
}

export function prettyPower(code) {
  return {
    FREEZE: 'Freeze', FRENZY: 'Frenzy', DOUBLE: 'Double', MEGA_BLADE: 'Mega Blade',
    SHIELD: 'Shield', HEART: 'Extra Life', NOVA: 'Nova',
  }[code] || code;
}
