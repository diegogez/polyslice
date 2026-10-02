// Player preferences, kept in localStorage (they're per-machine UI choices, not game data).

const KEY = 'polyslice.settings.v1';

const DEFAULTS = {
  playerName: 'Player',
  master: 0.8,
  music: 0.6,
  sfx: 0.85,
  muted: false,
  bladeColor: 'cyan',
  sliceInput: 'hold', // 'hold' = press and drag, 'hover' = blade always on while playing
  shake: true,
  quality: 'high',
  autoQuality: true, // turned off once the player picks a quality themselves
  showFps: false,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.listeners = new Set();
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      for (const k of Object.keys(DEFAULTS)) {
        if (typeof saved[k] === typeof DEFAULTS[k]) this.values[k] = saved[k];
      }
    } catch {
      // Storage unavailable or corrupt: defaults are fine.
    }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // Not fatal.
    }
    for (const fn of this.listeners) fn(key, value);
  }

  onChange(fn) {
    this.listeners.add(fn);
  }
}
