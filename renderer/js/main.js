// PolySlice UI entry point. Wires the engine link, 3D stage, HUD, screens and audio together
// and runs the render loop. The UI never decides gameplay; it renders what the engine reports.

import { AudioEngine } from './audio.js';
import { BladeLayer } from './blade.js';
import { Effects } from './effects.js';
import { GameView } from './game-view.js';
import { Hud, prettyPower } from './hud.js';
import { POWER_COLORS } from './icons.js';
import { setCatalog } from './models.js';
import { Screens } from './screens.js';
import { Settings } from './settings.js';
import { Stage } from './stage.js';

const bridge = window.polyslice;
const DEMO_RESTART_MS = 7000;

class App {
  constructor() {
    this.phase = 'loading'; // loading | menu | playing | paused | over | demo | error
    this.mode = 'CLASSIC';
    this.hello = null;
    this.lastMode = null;
    this.lastLevel = 1;

    this.settings = new Settings();
    this.audio = new AudioEngine(this.settings);
    this.stage = new Stage(document.getElementById('scene'), this.settings.get('quality'));
    this.effects = new Effects(this.stage);
    this.blade = new BladeLayer(document.getElementById('fx'), {
      stage: this.stage,
      send: (cmd) => this.send(cmd),
      settings: this.settings,
      audio: this.audio,
      canSlice: () => ['menu', 'playing', 'over'].includes(this.phase) && this.screens.current !== 'settings',
      isPlaying: () => this.phase === 'playing',
    });
    this.view = new GameView(this.stage, this.effects, this.blade);
    this.hud = new Hud(this.stage);
    this.screens = new Screens(this);
    this.fpsEl = document.getElementById('fps');

    document.body.classList.add(`os-${bridge.platform || 'unknown'}`);
    this.settings.onChange((key) => this.onSetting(key));
    this.screens.show('loading');
    this.wire();
    this.loop();
  }

  send(cmd) {
    bridge.send(cmd);
  }

  // ---- Wiring ------------------------------------------------------------------------------

  wire() {
    bridge.onMessage((line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.type === 'state') this.onState(msg);
      else if (msg.type === 'hello') this.onHello(msg);
    });
    bridge.onStatus((s) => this.onStatus(s));
    bridge.onCommand((c) => this.onCommand(c));
    bridge.onBlur(() => {
      if (this.phase === 'playing') this.pause();
    });
    bridge.status().then((s) => this.onStatus(s));

    window.addEventListener('resize', () => {
      this.stage.resize();
      this.blade.resize();
      this.send({ cmd: 'resize', aspect: window.innerWidth / window.innerHeight });
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', () => {
      this.audio.ensure();
      if (this.phase === 'demo') this.toMenu();
    });

    this.send({ cmd: 'resize', aspect: window.innerWidth / window.innerHeight });
    this.send({ cmd: 'hello' });
  }

  onStatus(status) {
    if (!status) return;
    if (status.state === 'error') {
      this.phase = 'error';
      this.screens.setError(status.message);
      this.screens.show('error');
      this.hud.show(false);
    } else if (status.state === 'running' && this.phase === 'error') {
      this.screens.show('loading');
      this.phase = 'loading';
      this.send({ cmd: 'resize', aspect: window.innerWidth / window.innerHeight });
      this.send({ cmd: 'hello' });
    }
  }

  onHello(hello) {
    this.hello = hello;
    setCatalog(hello);
    this.screens.renderMenu(hello);
    if (this.phase === 'loading' || this.phase === 'error') {
      this.toMenu(false);
    }
    if (this.screens.current === 'achievements') this.screens.renderAchievements(hello);
    if (this.screens.current === 'scores') this.screens.renderScores(hello);
  }

  // ---- Engine frames -------------------------------------------------------------------------

  onState(msg) {
    const now = performance.now();
    if (msg.mode !== this.lastMode || msg.demo !== this.lastDemo) {
      this.view.clear(this.lastMode !== null);
      this.lastMode = msg.mode;
      this.lastDemo = msg.demo;
    }
    this.view.beginFrame(msg, now);
    for (const ev of msg.ev) this.onEvent(ev, msg);
    this.view.sync(msg.e);
    if (msg.bot) this.blade.botSample(msg.bot[0], msg.bot[1], msg.bot[2], now);

    if (msg.mode !== 'ATTRACT') {
      this.hud.update(msg);
      if (msg.level !== this.lastLevel) {
        this.lastLevel = msg.level;
        this.stage.setLevel(msg.level);
        this.audio.setLevel(msg.level);
      }
      this.blade.mega = msg.pu.some((p) => p[0] === 'MEGA_BLADE');
    } else {
      this.blade.mega = false;
    }
  }

  onEvent(ev, msg) {
    this.view.onEvent(ev);
    const scored = msg.mode !== 'ATTRACT';
    const shake = (n) => this.settings.get('shake') && this.stage.shake(n);
    switch (ev.k) {
      case 'slice': {
        const value = Math.min(1, ev.pts / 120);
        this.audio.slice(scored ? value : 0.2, Math.max(1, ev.combo), ev.golden);
        if (scored) this.hud.slicePopup(ev);
        shake(ev.golden ? 6 : 1.5);
        break;
      }
      case 'combo':
        this.audio.combo(ev.n);
        this.hud.comboPopup(ev);
        shake(4 + ev.n);
        break;
      case 'bomb':
        if (ev.blocked) {
          this.audio.shield();
          this.hud.popup(ev.x, ev.y + 60, 'BLOCKED', 'good', '#c084fc');
        } else {
          this.audio.bomb();
          shake(34);
          this.flash('bomb');
          if (ev.penalty) this.hud.popup(ev.x, ev.y + 70, ev.penalty, 'bad');
        }
        break;
      case 'miss':
        if (ev.penalized) {
          this.audio.miss();
          this.hud.popup(ev.x, 70, '✕', 'miss');
          shake(6);
        }
        break;
      case 'lives':
        if (ev.delta < 0) {
          this.audio.lifeLost();
          this.flash('hurt');
        } else {
          this.hud.banner('+1 LIFE', '', 'small', '#fb7185');
        }
        break;
      case 'time':
        this.hud.banner(`${ev.delta > 0 ? '+' : ''}${ev.delta}s`, ev.delta > 0 ? 'BONUS TIME' : 'TIME PENALTY', 'small', ev.delta > 0 ? '#4ade80' : '#fb7185');
        break;
      case 'shield':
        this.audio.shield();
        this.flash('shield');
        break;
      case 'power':
        this.audio.power(ev.p);
        this.hud.banner(`${ev.name.toUpperCase()}!`, powerSub(ev.p), 'power', POWER_COLORS[ev.p]);
        if (ev.p === 'FREEZE') this.setFrozen(true);
        if (ev.p === 'FRENZY') document.body.classList.add('frenzy');
        if (ev.p === 'NOVA') this.flash('nova');
        shake(8);
        break;
      case 'powerEnd':
        if (ev.p === 'FREEZE') this.setFrozen(false);
        if (ev.p === 'FRENZY') document.body.classList.remove('frenzy');
        break;
      case 'level':
        this.audio.levelUp();
        this.hud.banner(`LEVEL ${ev.level}`, `POINTS ×${ev.mult.toFixed(2)}`, 'level');
        break;
      case 'achievement':
        this.audio.achievement();
        this.hud.toast(ev.name, ev.desc);
        break;
      case 'gameOver':
        this.onGameOver(ev, msg.demo);
        break;
      default:
        break;
    }
  }

  setFrozen(on) {
    document.body.classList.toggle('frozen', on);
    this.stage.setFrozen(on);
    this.audio.setFrozen(on);
  }

  flash(kind) {
    const node = document.getElementById('flash');
    node.className = '';
    void node.offsetWidth;
    node.className = `play ${kind}`;
  }

  clearRunEffects() {
    this.setFrozen(false);
    document.body.classList.remove('frenzy');
    this.blade.mega = false;
  }

  // ---- Flow ----------------------------------------------------------------------------------

  start(mode, demo = false) {
    if (!this.hello) return;
    this.audio.ensure();
    clearTimeout(this.demoTimer);
    this.mode = mode;
    this.phase = demo ? 'demo' : 'playing';
    this.clearRunEffects();
    this.lastLevel = 1;
    this.stage.setLevel(1);
    this.audio.setLevel(1);
    const best = this.hello.modes.find((m) => m.id === mode)?.best || 0;
    this.hud.reset(best);
    this.hud.show(true);
    this.screens.hide();
    document.body.classList.toggle('demo', demo);
    document.body.classList.add('in-game');
    this.send({ cmd: 'start', mode, demo, player: this.settings.get('playerName') });
    this.hud.banner(demo ? 'AI DEMO' : 'SLICE!', demo ? 'Click or press any key to exit' : modeName(this.hello, mode), 'start');
    this.audio.countdown(true);
    this.audio.startMusic('game');
  }

  pause() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.send({ cmd: 'pause' });
    this.screens.show('pause');
    document.body.classList.remove('in-game');
    this.audio.setFrozen(true);
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.screens.hide();
    document.body.classList.add('in-game');
    this.send({ cmd: 'resume' });
    this.audio.setFrozen(document.body.classList.contains('frozen'));
  }

  toMenu(notifyEngine = true) {
    clearTimeout(this.demoTimer);
    if (notifyEngine) this.send({ cmd: 'menu' });
    this.phase = 'menu';
    this.clearRunEffects();
    this.hud.show(false);
    document.body.classList.remove('in-game', 'demo');
    this.stage.setLevel(1);
    this.lastLevel = 1;
    if (this.hello) this.screens.renderMenu(this.hello);
    this.screens.show('menu');
    this.audio.startMusic('menu');
  }

  onGameOver(ev, demo) {
    this.phase = 'over';
    this.clearRunEffects();
    document.body.classList.remove('in-game');
    this.audio.gameOver();
    this.audio.startMusic('menu');
    this.screens.renderResults(ev, this.hello, demo);
    setTimeout(() => {
      if (this.phase !== 'over') return;
      this.hud.show(false);
      this.screens.show('over');
    }, 900);
    if (demo) {
      this.demoTimer = setTimeout(() => {
        if (this.phase === 'over') this.start(ev.mode, true);
      }, DEMO_RESTART_MS);
    }
  }

  /** Buttons anywhere in the UI route here via data-action. */
  action(name, data = {}) {
    switch (name) {
      case 'start': return this.start(data.mode);
      case 'again': return this.start(data.mode || this.mode, data.demo === '1');
      case 'demo': return this.start('CLASSIC', true);
      case 'menu': return this.toMenu();
      case 'back': return this.toMenu(false);
      case 'pause-btn': return this.pause();
      case 'resume': return this.resume();
      case 'restart': return this.start(this.mode);
      case 'end': return this.send({ cmd: 'end' });
      case 'guide':
        this.screens.renderGuide(this.hello);
        return this.screens.show('guide');
      case 'achievements':
        this.screens.renderAchievements(this.hello);
        return this.screens.show('achievements');
      case 'scores':
        this.screens.renderScores(this.hello);
        return this.screens.show('scores');
      case 'score-tab':
        return this.screens.renderScores(this.hello, data.mode);
      case 'settings':
        this.screens.renderSettings();
        return this.screens.show('settings');
      case 'set':
        if (data.key === 'quality') this.settings.set('autoQuality', false);
        this.settings.set(data.key, data.value);
        return this.screens.renderSettings();
      case 'toggle':
        this.settings.set(data.key, !this.settings.get(data.key));
        return this.screens.renderSettings();
      case 'fullscreen':
        return bridge.toggleFullscreen();
      case 'reset-data':
        if (window.confirm('Erase all high scores, achievements and lifetime stats?')) this.send({ cmd: 'resetData' });
        return undefined;
      case 'retry-engine':
        this.screens.show('loading');
        return bridge.restartEngine();
      case 'quit':
        return bridge.quit();
      default:
        return undefined;
    }
  }

  /** Commands from the app menu and screenshot mode. */
  onCommand(cmd) {
    switch (cmd) {
      case 'pause':
        if (this.phase === 'playing') this.pause();
        else if (this.phase === 'paused') this.resume();
        break;
      case 'end':
        if (this.phase === 'playing' || this.phase === 'demo' || this.phase === 'paused') this.send({ cmd: 'end' });
        break;
      default:
        this.action(cmd);
    }
  }

  onKey(e) {
    if (e.target instanceof HTMLInputElement) return;
    const key = e.key;
    if (this.phase === 'demo') {
      e.preventDefault();
      this.toMenu();
      return;
    }
    if (key === 'f' || key === 'F') return bridge.toggleFullscreen();
    if (key === 'm' || key === 'M') return this.settings.set('muted', !this.settings.get('muted'));
    if (key === 'Escape' || key === 'p' || key === 'P') {
      if (this.phase === 'playing') return this.pause();
      if (this.phase === 'paused') return this.resume();
      if (this.phase === 'menu' && this.screens.current !== 'menu') return this.toMenu(false);
      if (this.phase === 'over') return this.toMenu();
    }
    if (key === ' ' && this.phase === 'paused') {
      e.preventDefault();
      return this.resume();
    }
    if (key === 'Enter') {
      if (this.phase === 'over') return this.start(this.mode);
      if (this.phase === 'menu' && this.screens.current === 'menu') return this.start('CLASSIC');
    }
    if (this.phase === 'menu' && this.screens.current === 'menu' && this.hello) {
      const idx = Number(key) - 1;
      if (idx >= 0 && idx < this.hello.modes.length) this.start(this.hello.modes[idx].id);
    }
    return undefined;
  }

  onSetting(key) {
    if (['master', 'music', 'sfx', 'muted'].includes(key)) this.audio.applyVolumes();
    if (key === 'quality') this.stage.setQuality(this.settings.get('quality'));
    if (key === 'muted') this.hud.banner(this.settings.get('muted') ? 'MUTED' : 'SOUND ON', '', 'small', '#94a3b8');
  }

  /** Steps graphics down one notch when the frame rate stays low (unless the player chose a level). */
  maybeLowerQuality(fps, sinceLast) {
    const q = this.settings.get('quality');
    if (!this.settings.get('autoQuality') || fps >= 40 || q === 'low' || sinceLast < 5000) return false;
    const next = q === 'high' ? 'medium' : 'low';
    console.info(`[perf] ${fps.toFixed(0)} FPS, lowering graphics to ${next}`);
    this.settings.set('quality', next);
    return true;
  }

  // ---- Render loop ---------------------------------------------------------------------------

  loop() {
    let last = performance.now();
    let frames = 0;
    let fpsTime = last;
    // Auto quality: if the GPU can't keep up, step graphics down (High -> Medium -> Low).
    let perfFrames = 0;
    let perfStart = last;
    let lastDowngrade = last;
    const frame = (now) => {
      const gap = now - last;
      const dt = Math.min(0.05, gap / 1000);
      last = now;
      if (gap > 200) {
        // Window was hidden or the machine stalled; don't count it against the GPU.
        perfFrames = 0;
        perfStart = now;
      } else if (++perfFrames >= 150) {
        const fps = (perfFrames * 1000) / (now - perfStart);
        perfFrames = 0;
        perfStart = now;
        if (this.maybeLowerQuality(fps, now - lastDowngrade)) lastDowngrade = now;
      }
      this.view.update(dt, now);
      this.stage.update(dt, this.view.ts);
      this.stage.render();
      this.blade.draw(now, this.phase === 'playing');
      this.hud.tick(dt);
      frames++;
      if (now - fpsTime > 500) {
        if (this.settings.get('showFps')) this.fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsTime))} FPS`;
        else this.fpsEl.textContent = '';
        frames = 0;
        fpsTime = now;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

function modeName(hello, id) {
  return hello.modes.find((m) => m.id === id)?.name.toUpperCase() + ' MODE';
}

function powerSub(code) {
  return {
    FREEZE: 'Time slows down',
    FRENZY: 'Shapes incoming!',
    DOUBLE: 'All points ×2',
    MEGA_BLADE: 'Huge blade',
    SHIELD: 'One free hit',
    HEART: 'Bonus',
    NOVA: 'Screen cleared',
  }[code] || prettyPower(code);
}

window.app = new App();
