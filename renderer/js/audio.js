// Every sound in the game is synthesized live with the Web Audio API, including a small
// procedural synthwave soundtrack whose tempo follows the difficulty level.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// i - VI - III - VII in A minor: Am, F, C, G
const PROGRESSION = [
  { bass: 45, chord: [69, 72, 76] },
  { bass: 41, chord: [65, 69, 72] },
  { bass: 48, chord: [64, 67, 72] },
  { bass: 43, chord: [67, 71, 74] },
];
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 1];

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.musicMode = null;
    this.level = 1;
    this.frozen = false;
  }

  /** Lazily creates the audio graph. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.music = ctx.createGain();
    this.music.connect(this.musicFilter).connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.applyVolumes();
    return true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const muted = s.get('muted');
    this.master.gain.value = muted ? 0 : s.get('master');
    this.sfx.gain.value = s.get('sfx');
    this.music.gain.value = s.get('music') * 0.55;
  }

  // ---- Building blocks -----------------------------------------------------------------

  tone({ freq, type = 'sine', start = 0, dur = 0.15, gain = 0.3, attack = 0.005, to = null, dest = this.sfx, detune = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.detune.value = detune;
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  hiss({ start = 0, dur = 0.2, gain = 0.3, type = 'bandpass', freq = 2000, to = null, q = 1, dest = this.sfx }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  ready() {
    return this.ctx && !this.settings.get('muted');
  }

  // ---- Sound effects -------------------------------------------------------------------

  swoosh(intensity) {
    if (!this.ready()) return;
    this.hiss({ dur: 0.16, gain: 0.05 + intensity * 0.1, freq: 700, to: 2600, q: 0.9 });
  }

  /** `value` 0..1 (shape worth), `combo` running combo count. */
  slice(value, combo = 1, golden = false) {
    if (!this.ready()) return;
    this.hiss({ dur: 0.12, gain: 0.22, freq: 4200, to: 1200, q: 1.4 });
    const step = Math.min(combo - 1, 12);
    const base = 620 + value * 260;
    this.tone({ freq: base * Math.pow(2, (step * 2) / 12), type: 'triangle', dur: 0.14, gain: 0.16 });
    this.tone({ freq: base * 2 * Math.pow(2, (step * 2) / 12), type: 'sine', dur: 0.09, gain: 0.06 });
    if (golden) {
      [0, 4, 7, 12].forEach((n, i) => this.tone({ freq: midi(84 + n), type: 'sine', start: i * 0.04, dur: 0.25, gain: 0.08 }));
    }
  }

  combo(n) {
    if (!this.ready()) return;
    const root = 60 + Math.min(n, 10);
    [0, 4, 7, 12].forEach((s, i) => {
      this.tone({ freq: midi(root + s), type: 'square', start: i * 0.05, dur: 0.22, gain: 0.05 });
      this.tone({ freq: midi(root + s + 12), type: 'triangle', start: i * 0.05, dur: 0.3, gain: 0.07 });
    });
  }

  bomb() {
    if (!this.ready()) return;
    this.hiss({ dur: 1.1, gain: 0.9, type: 'lowpass', freq: 2400, to: 120, q: 0.4 });
    this.tone({ freq: 140, to: 32, type: 'sine', dur: 0.8, gain: 0.8 });
    this.tone({ freq: 70, to: 25, type: 'sawtooth', dur: 0.5, gain: 0.2 });
  }

  miss() {
    if (!this.ready()) return;
    this.tone({ freq: 190, to: 80, type: 'sine', dur: 0.22, gain: 0.35 });
    this.hiss({ dur: 0.15, gain: 0.08, type: 'lowpass', freq: 500, q: 0.5 });
  }

  lifeLost() {
    if (!this.ready()) return;
    this.tone({ freq: 440, to: 110, type: 'sawtooth', dur: 0.45, gain: 0.12 });
  }

  shield() {
    if (!this.ready()) return;
    this.tone({ freq: 880, to: 1760, type: 'triangle', dur: 0.3, gain: 0.15 });
    this.tone({ freq: 660, to: 1320, type: 'sine', dur: 0.4, gain: 0.1, start: 0.05 });
  }

  power(kind) {
    if (!this.ready()) return;
    const sets = {
      FREEZE: [88, 84, 79, 76],
      FRENZY: [64, 67, 71, 76, 79],
      DOUBLE: [72, 76, 79, 84],
      MEGA_BLADE: [60, 67, 72, 79],
      SHIELD: [69, 72, 76, 81],
      HEART: [72, 76, 79, 84, 88],
      NOVA: [60, 64, 67, 72, 76, 79, 84],
    };
    const notes = sets[kind] || sets.DOUBLE;
    notes.forEach((m, i) => {
      this.tone({ freq: midi(m), type: 'triangle', start: i * 0.06, dur: 0.35, gain: 0.12 });
      this.tone({ freq: midi(m), type: 'square', start: i * 0.06, dur: 0.12, gain: 0.03, detune: 8 });
    });
    if (kind === 'NOVA') this.hiss({ dur: 0.9, gain: 0.4, freq: 300, to: 6000, q: 0.6 });
    if (kind === 'FREEZE') this.hiss({ dur: 0.7, gain: 0.2, freq: 6000, to: 800, q: 2 });
  }

  levelUp() {
    if (!this.ready()) return;
    [57, 61, 64, 69, 73, 76].forEach((m, i) => this.tone({ freq: midi(m + 12), type: 'triangle', start: i * 0.055, dur: 0.3, gain: 0.1 }));
  }

  achievement() {
    if (!this.ready()) return;
    [84, 88, 91, 96].forEach((m, i) => this.tone({ freq: midi(m), type: 'sine', start: i * 0.07, dur: 0.4, gain: 0.08 }));
  }

  gameOver() {
    if (!this.ready()) return;
    [69, 65, 62, 57].forEach((m, i) => this.tone({ freq: midi(m), type: 'triangle', start: i * 0.18, dur: 0.6, gain: 0.14 }));
  }

  click() {
    if (!this.ready()) return;
    this.tone({ freq: 1200, to: 1800, type: 'sine', dur: 0.06, gain: 0.08 });
  }

  hover() {
    if (!this.ready()) return;
    this.tone({ freq: 900, type: 'sine', dur: 0.04, gain: 0.025 });
  }

  countdown(final = false) {
    if (!this.ready()) return;
    this.tone({ freq: final ? 1320 : 880, type: 'square', dur: final ? 0.3 : 0.12, gain: 0.06 });
  }

  setFrozen(on) {
    this.frozen = on;
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(on ? 650 : 18000, this.ctx.currentTime, 0.15);
  }

  // ---- Music ---------------------------------------------------------------------------

  /** mode: 'menu' (calm pad + bass) or 'game' (full beat). */
  startMusic(mode) {
    if (!this.ensure()) return;
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    if (!this.timer) {
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
    }
  }

  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
    this.musicMode = null;
  }

  setLevel(level) {
    this.level = level;
  }

  bpm() {
    if (this.musicMode === 'menu') return 92;
    return Math.min(156, 108 + (this.level - 1) * 4) * (this.frozen ? 0.7 : 1);
  }

  schedule() {
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.bpm() / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, time) {
    const start = time - this.ctx.currentTime;
    const bar = PROGRESSION[Math.floor(step / 16) % 4];
    const s16 = step % 16;
    const game = this.musicMode === 'game';
    const dest = this.music;

    // Bass: driving eighths with an octave bounce.
    if (s16 % 2 === 0) {
      const oct = s16 % 4 === 2 ? 12 : 0;
      this.bassNote(midi(bar.bass + oct - 12), start, game ? 0.2 : 0.35, game ? 0.22 : 0.14);
    }
    // Pad on each bar in the menu.
    if (!game && s16 === 0) {
      for (const m of bar.chord) {
        this.tone({ freq: midi(m - 12), type: 'sawtooth', start, dur: 2.4, gain: 0.025, attack: 0.6, dest, detune: -6 });
        this.tone({ freq: midi(m - 12), type: 'sawtooth', start, dur: 2.4, gain: 0.025, attack: 0.6, dest, detune: 6 });
      }
    }
    if (!game) return;

    // Arpeggio
    const note = ARP[s16] === 3 ? bar.chord[0] + 12 : bar.chord[ARP[s16]];
    this.tone({ freq: midi(note), type: 'square', start, dur: 0.11, gain: 0.035, dest });
    // Kick on every beat
    if (s16 % 4 === 0) this.tone({ freq: 150, to: 42, type: 'sine', start, dur: 0.22, gain: 0.55, attack: 0.002, dest });
    // Clap on 2 and 4
    if (s16 === 4 || s16 === 12) this.hiss({ start, dur: 0.14, gain: 0.16, freq: 1700, q: 0.8, dest });
    // Off-beat hats
    if (s16 % 4 === 2) this.hiss({ start, dur: 0.05, gain: 0.07, type: 'highpass', freq: 7500, q: 0.5, dest });
  }

  bassNote(freq, start, dur, gain) {
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f).connect(g).connect(this.music);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
