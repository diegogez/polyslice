// Vector icons for power-ups, drawn on a canvas so they look identical in 3D sprites, the HUD
// and the guide (no emoji-font surprises).

export const POWER_COLORS = {
  FREEZE: '#7dd3fc',
  FRENZY: '#fde047',
  DOUBLE: '#fbbf24',
  MEGA_BLADE: '#4ade80',
  SHIELD: '#c084fc',
  HEART: '#fb7185',
  NOVA: '#ffffff',
};

const cache = new Map();

/** Returns a square canvas with the icon for `kind`, cached per size. */
export function iconCanvas(kind, size = 128) {
  const key = `${kind}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const color = POWER_COLORS[kind] || '#ffffff';
  g.translate(size / 2, size / 2);
  g.scale(size / 128, size / 128);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  (DRAW[kind] || DRAW.NOVA)(g, color);
  cache.set(key, c);
  return c;
}

export function iconDataUrl(kind, size = 96) {
  return iconCanvas(kind, size).toDataURL('image/png');
}

const DRAW = {
  FREEZE(g) {
    g.lineWidth = 7;
    for (let i = 0; i < 6; i++) {
      g.save();
      g.rotate((i * Math.PI) / 3);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -44);
      g.moveTo(0, -26);
      g.lineTo(-12, -38);
      g.moveTo(0, -26);
      g.lineTo(12, -38);
      g.stroke();
      g.restore();
    }
  },
  FRENZY(g) {
    g.beginPath();
    g.moveTo(10, -50);
    g.lineTo(-26, 6);
    g.lineTo(-2, 6);
    g.lineTo(-12, 50);
    g.lineTo(28, -10);
    g.lineTo(4, -10);
    g.closePath();
    g.fill();
  },
  DOUBLE(g) {
    g.font = '800 58px Orbitron, "Exo 2", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('2×', 2, 4);
  },
  MEGA_BLADE(g) {
    g.rotate(-Math.PI / 4);
    g.beginPath();
    g.moveTo(0, -56);
    g.lineTo(10, -38);
    g.lineTo(9, 18);
    g.lineTo(-9, 18);
    g.lineTo(-10, -38);
    g.closePath();
    g.fill();
    g.fillRect(-24, 18, 48, 8);
    g.fillRect(-5, 26, 10, 22);
  },
  SHIELD(g) {
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(0, -48);
    g.lineTo(38, -34);
    g.quadraticCurveTo(38, 22, 0, 50);
    g.quadraticCurveTo(-38, 22, -38, -34);
    g.closePath();
    g.globalAlpha = 0.35;
    g.fill();
    g.globalAlpha = 1;
    g.stroke();
  },
  HEART(g) {
    g.beginPath();
    g.moveTo(0, 42);
    g.bezierCurveTo(-58, 2, -38, -50, 0, -22);
    g.bezierCurveTo(38, -50, 58, 2, 0, 42);
    g.fill();
  },
  NOVA(g) {
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? 52 : 18;
      const a = (i * Math.PI) / 8;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  },
  BOMB(g) {
    g.shadowColor = '#ff3b3b';
    g.fillStyle = '#2a1830';
    g.beginPath();
    g.arc(-4, 8, 36, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ff5b5b';
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = '#ffd36e';
    g.beginPath();
    g.moveTo(18, -20);
    g.quadraticCurveTo(30, -42, 44, -40);
    g.stroke();
    g.fillStyle = '#fff3c4';
    g.beginPath();
    g.arc(46, -42, 6, 0, Math.PI * 2);
    g.fill();
  },
};
