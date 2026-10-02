// Menu, guide, achievements, high scores, settings, pause and results screens.
// All game data shown here (catalog, scores, achievements) comes from the Java engine's hello.

import { BLADE_COLOR_NAMES, bladeSwatch } from './blade.js';
import { iconDataUrl, POWER_COLORS } from './icons.js';
import { renderThumbnails, SHAPE_COLORS } from './models.js';
import { escapeHtml as esc, fmt, fmtDuration, hex } from './util.js';

const $ = (id) => document.getElementById(id);

const MODE_ICONS = {
  CLASSIC: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.3-9.2C1.4 8.4 3.6 5 7 5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 16.4 12 21 12 21z"/></svg>',
  ARCADE: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-1 2v5.4l4.3 2.6 1-1.7-3.3-2V7h-2z"/></svg>',
  ZEN: '<svg viewBox="0 0 24 24"><path d="M12 2c3 4 3 8 0 12-3-4-3-8 0-12zm-8 9c4 0 7 2 8 5-4 1-7-1-8-5zm16 0c-1 4-4 6-8 5 1-3 4-5 8-5zM5 19h14v2H5z"/></svg>',
};
const MODE_ACCENTS = { CLASSIC: '#22d3ee', ARCADE: '#fbbf24', ZEN: '#a78bfa' };
const MODE_META = (m) => (m.lives > 0 ? `${m.lives} lives` : `${m.time} seconds`);

export class Screens {
  /** @param {object} app  callbacks: start(mode), action(name), settings, audio, send */
  constructor(app) {
    this.app = app;
    this.current = null;
    this.thumbs = null;
    this.scoreTab = 'CLASSIC';
    this.bindStatic();
  }

  show(name) {
    this.current = name;
    document.body.dataset.screen = name || '';
    for (const s of document.querySelectorAll('.screen')) {
      s.classList.toggle('active', s.id === `screen-${name}`);
    }
  }

  hide() {
    this.show(null);
  }

  bindStatic() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this.app.audio.click();
      this.app.action(btn.dataset.action, btn.dataset);
    });
    document.addEventListener('pointerover', (e) => {
      if (e.target.closest && e.target.closest('button, .mode-card') && !e.target.closest('[disabled]')) {
        const t = e.target.closest('button, .mode-card');
        if (t !== this.lastHover) {
          this.lastHover = t;
          this.app.audio.hover();
        }
      }
    });
    const name = $('player-name');
    name.value = this.app.settings.get('playerName');
    name.addEventListener('input', () => this.app.settings.set('playerName', name.value.trim().slice(0, 16) || 'Player'));
    name.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') name.blur();
    });
  }

  // ---- Menu ------------------------------------------------------------------------------

  renderMenu(hello) {
    const cards = $('mode-cards');
    cards.innerHTML = hello.modes.map((m, i) => `
      <button class="mode-card" data-action="start" data-mode="${m.id}" style="--accent:${MODE_ACCENTS[m.id] || '#22d3ee'}">
        <span class="mode-key">${i + 1}</span>
        <span class="mode-icon">${MODE_ICONS[m.id] || ''}</span>
        <span class="mode-name">${esc(m.name)}</span>
        <span class="mode-meta">${MODE_META(m)}</span>
        <span class="mode-desc">${esc(m.desc)}</span>
        <span class="mode-best"><small>BEST</small>${m.best ? fmt(m.best) : '—'}</span>
        <span class="mode-play">PLAY</span>
      </button>`).join('');

    const unlocked = hello.achievements.filter((a) => a.unlocked).length;
    $('ach-count').textContent = `${unlocked}/${hello.achievements.length}`;
    const life = hello.lifetime;
    $('lifetime').textContent = life.games
      ? `${fmt(life.sliced)} shapes sliced · ${fmt(life.games)} games · best combo ×${life.bestCombo}`
      : 'No games yet: pick a mode to start';
    $('engine-label').textContent = `Java ${hello.java.split('.')[0]} engine · v${hello.version}`;
    $('player-name').value = this.app.settings.get('playerName');
  }

  // ---- Guide -----------------------------------------------------------------------------

  renderGuide(hello) {
    if (!this.thumbs) {
      const codes = [...hello.shapes.map((s) => s.code), 'GOLDEN', 'BOMB'];
      try {
        this.thumbs = renderThumbnails(codes);
      } catch (err) {
        console.warn('Thumbnail render failed', err);
        this.thumbs = {};
      }
    }
    const t = this.thumbs;
    const r = hello.rules;
    const shapes = hello.shapes.map((s) => `
      <div class="card shape-card" style="--c:${hex((SHAPE_COLORS[s.code] || SHAPE_COLORS.CUBE).color)}">
        ${t[s.code] ? `<img src="${t[s.code]}" alt="">` : '<div class="thumb-fallback"></div>'}
        <div class="card-body">
          <div class="card-title">${esc(s.name)}<b>${s.points} pts</b></div>
          <div class="card-desc">${esc(s.desc)}</div>
          <div class="card-tag">${s.minLevel > 50 ? 'Bonus only' : s.minLevel <= 1 ? 'From the start' : `From level ${s.minLevel}`}</div>
        </div>
      </div>`).join('');
    const powers = hello.powerups.map((p) => `
      <div class="card power-card" style="--c:${POWER_COLORS[p.code]}">
        <img class="power-icon" src="${iconDataUrl(p.code, 96)}" alt="">
        <div class="card-body">
          <div class="card-title">${esc(p.name)}<b>${p.duration ? `${p.duration}s` : 'Instant'}</b></div>
          <div class="card-desc">${esc(p.desc)}</div>
        </div>
      </div>`).join('');

    $('guide-body').innerHTML = `
      <h3>Shapes</h3>
      <div class="card-grid">${shapes}</div>
      <h3>Specials</h3>
      <div class="card-grid">
        <div class="card shape-card" style="--c:#ffc83d">
          ${t.GOLDEN ? `<img src="${t.GOLDEN}" alt="">` : ''}
          <div class="card-body"><div class="card-title">Golden Shape<b>×${r.goldenMult}</b></div>
          <div class="card-desc">Any shape can spawn golden. Rare, sparkly, and worth ${r.goldenMult}× points.</div></div>
        </div>
        <div class="card shape-card danger" style="--c:#ff3b3b">
          ${t.BOMB ? `<img src="${t.BOMB}" alt="">` : ''}
          <div class="card-body"><div class="card-title">Bomb<b>Avoid</b></div>
          <div class="card-desc">Classic: costs a life. Arcade: costs 5 seconds. A Shield blocks one.</div></div>
        </div>
      </div>
      <h3>Power-ups</h3>
      <div class="card-grid">${powers}</div>
      <h3>Scoring</h3>
      <ul class="rules">
        <li><b>Points</b> = shape value × level multiplier × power-ups</li>
        <li><b>Level up</b> every ${r.levelSeconds} seconds: +${r.multPerLevel.toFixed(2)}× points, faster launches, bigger waves, more bombs</li>
        <li><b>Combos</b>: slice ${r.minCombo}+ shapes in one swipe for a bonus of 10 × n(n−1)/2 (a 6-combo is +150)</li>
        <li><b>Golden</b> shapes are worth ${r.goldenMult}×. Double Points stacks on top.</li>
      </ul>`;
  }

  // ---- Achievements ----------------------------------------------------------------------

  renderAchievements(hello) {
    const done = hello.achievements.filter((a) => a.unlocked).length;
    $('ach-summary').textContent = `${done} of ${hello.achievements.length} unlocked`;
    $('ach-progress').style.transform = `scaleX(${done / hello.achievements.length})`;
    $('achievements-body').innerHTML = hello.achievements.map((a) => `
      <div class="badge ${a.unlocked ? 'unlocked' : ''}">
        <div class="badge-icon">${a.unlocked ? '★' : '?'}</div>
        <div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div>
      </div>`).join('');
  }

  // ---- High scores -----------------------------------------------------------------------

  renderScores(hello, tab = this.scoreTab) {
    this.scoreTab = tab;
    $('score-tabs').innerHTML = hello.modes.map((m) => `
      <button class="tab ${m.id === tab ? 'active' : ''}" data-action="score-tab" data-mode="${m.id}">${esc(m.name)}</button>`).join('');
    const rows = hello.highScores[tab] || [];
    $('scores-body').innerHTML = rows.length
      ? `<table class="score-table">
          <thead><tr><th>#</th><th>Player</th><th>Score</th><th>Level</th><th>Best combo</th><th>Date</th></tr></thead>
          <tbody>${rows.map((s, i) => `
            <tr class="${i === 0 ? 'first' : ''}">
              <td>${i + 1}</td><td>${esc(s.name)}</td><td class="num">${fmt(s.score)}</td>
              <td>${s.level}</td><td>×${s.combo}</td><td>${esc(s.date)}</td>
            </tr>`).join('')}</tbody>
        </table>`
      : '<p class="empty">No scores yet. Go set one!</p>';
  }

  // ---- Settings --------------------------------------------------------------------------

  renderSettings() {
    const s = this.app.settings;
    const slider = (key, label) => `
      <label class="row"><span>${label}</span>
        <input type="range" min="0" max="1" step="0.05" value="${s.get(key)}" data-setting="${key}">
      </label>`;
    const choice = (key, label, options) => `
      <div class="row"><span>${label}</span><div class="seg">
        ${options.map(([v, l]) => `<button class="${s.get(key) === v ? 'on' : ''}" data-action="set" data-key="${key}" data-value="${v}">${l}</button>`).join('')}
      </div></div>`;
    const toggle = (key, label) => `
      <div class="row"><span>${label}</span>
        <button class="switch ${s.get(key) ? 'on' : ''}" data-action="toggle" data-key="${key}" aria-pressed="${s.get(key)}"><i></i></button>
      </div>`;
    $('settings-body').innerHTML = `
      <h3>Audio</h3>
      ${slider('master', 'Master volume')}
      ${slider('music', 'Music')}
      ${slider('sfx', 'Sound effects')}
      ${toggle('muted', 'Mute everything (M)')}
      <h3>Blade</h3>
      <div class="row"><span>Blade color</span><div class="swatches">
        ${BLADE_COLOR_NAMES.map((n) => `<button class="swatch ${s.get('bladeColor') === n ? 'on' : ''}" style="--sw:${bladeSwatch(n)}" title="${n}" data-action="set" data-key="bladeColor" data-value="${n}"></button>`).join('')}
      </div></div>
      ${choice('sliceInput', 'Slicing', [['hold', 'Hold & drag'], ['hover', 'Always on']])}
      <h3>Display</h3>
      ${choice('quality', 'Graphics', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']])}
      ${toggle('shake', 'Screen shake')}
      ${toggle('showFps', 'Show FPS')}
      <div class="row"><span>Fullscreen (F)</span><button class="btn small ghost" data-action="fullscreen">Toggle</button></div>
      <h3>Data</h3>
      <div class="row"><span>Reset high scores, achievements and stats</span><button class="btn small danger" data-action="reset-data">Reset…</button></div>`;
    for (const input of document.querySelectorAll('[data-setting]')) {
      input.addEventListener('input', () => {
        s.set(input.dataset.setting, Number(input.value));
      });
    }
  }

  // ---- Results ---------------------------------------------------------------------------

  renderResults(ev, hello, demo) {
    const st = ev.stats;
    const mode = hello?.modes.find((m) => m.id === ev.mode);
    $('over-reason').textContent = demo ? 'DEMO COMPLETE' : ev.reason;
    $('over-mode').textContent = `${mode ? mode.name : ev.mode} mode${demo ? ' · played by the AI' : ''}`;
    $('over-score').dataset.target = ev.score;
    $('over-score').textContent = '0';
    const rank = $('over-rank');
    rank.className = 'rank';
    if (!demo && ev.rank === 1) {
      rank.textContent = 'NEW HIGH SCORE!';
      rank.classList.add('gold');
    } else if (!demo && ev.rank > 0) {
      rank.textContent = `#${ev.rank} on the leaderboard`;
    } else {
      rank.textContent = ev.best ? `Best: ${fmt(ev.best)}` : '';
    }

    const stat = (label, value) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
    $('over-stats').innerHTML = [
      stat('Shapes sliced', fmt(st.sliced)),
      stat('Best combo', `×${st.bestCombo}`),
      stat('Max level', st.maxLevel),
      stat('Accuracy', `${Math.round(st.accuracy)}%`),
      stat('Power-ups', st.powerUps),
      stat('Time', fmtDuration(st.seconds)),
    ].join('');

    const names = Object.fromEntries((hello?.shapes || []).map((s) => [s.code, s.name]));
    const breakdown = Object.entries(st.byType).sort((a, b) => b[1] - a[1]);
    $('over-shapes').innerHTML = breakdown.map(([code, n]) => `
      <span class="chip" style="--c:${hex((SHAPE_COLORS[code] || SHAPE_COLORS.CUBE).color)}"><i></i>${esc(names[code] || code)} <b>${n}</b></span>`).join('')
      + (st.golden ? `<span class="chip" style="--c:#ffc83d"><i></i>Golden <b>${st.golden}</b></span>` : '');

    $('over-unlocked').innerHTML = ev.unlocked.length
      ? `<h4>Unlocked</h4>${ev.unlocked.map((a) => `<div class="badge unlocked mini"><div class="badge-icon">★</div><div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div></div>`).join('')}`
      : '';
    $('btn-again').dataset.mode = ev.mode;
    $('btn-again').dataset.demo = demo ? '1' : '';
    this.countUp($('over-score'), ev.score);
  }

  countUp(node, target) {
    const start = performance.now();
    const dur = Math.min(1600, 400 + target / 8);
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      node.textContent = fmt(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  setError(message) {
    $('error-message').textContent = message;
  }
}
