// Renders the app icon (assets/icon.png, 1024x1024) with a hidden Electron window.
// Run with: npm run icon

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DRAW = `(() => {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');

  // macOS icon grid: 824px rounded square centered in the canvas.
  const pad = 100, size = 824, r = 186;
  const rr = new Path2D();
  rr.roundRect(pad, pad, size, size, r);
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 18;
  const bg = g.createLinearGradient(0, pad, 0, pad + size);
  bg.addColorStop(0, '#0b0624');
  bg.addColorStop(0.55, '#2b0f5c');
  bg.addColorStop(1, '#090418');
  g.fillStyle = bg;
  g.fill(rr);
  g.restore();
  g.save();
  g.clip(rr);

  // Sun
  const horizon = pad + size * 0.68;
  const sun = g.createLinearGradient(0, horizon - 300, 0, horizon);
  sun.addColorStop(0, '#ffd36e');
  sun.addColorStop(1, '#ff3cac');
  g.fillStyle = sun;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.arc(S / 2, horizon, 270, Math.PI, 0);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#2b0f5c';
  for (let i = 0; i < 6; i++) g.fillRect(pad, horizon - 30 - i * 34, size, 6 + i * 1.5);

  // Grid floor
  g.fillStyle = '#07031a';
  g.fillRect(pad, horizon, size, size);
  g.strokeStyle = '#22d3ee';
  g.shadowColor = '#22d3ee';
  g.shadowBlur = 12;
  g.lineWidth = 3;
  for (let i = -12; i <= 12; i++) {
    g.beginPath();
    g.moveTo(S / 2 + i * 18, horizon);
    g.lineTo(S / 2 + i * 150, pad + size);
    g.stroke();
  }
  for (let k = 0; k < 7; k++) {
    const y = horizon + Math.pow(k / 6, 2) * (pad + size - horizon);
    g.globalAlpha = 0.4 + k * 0.1;
    g.beginPath();
    g.moveTo(pad, y);
    g.lineTo(pad + size, y);
    g.stroke();
  }
  g.globalAlpha = 1;

  // Isometric cube, cut in two along a diagonal
  const cx = S / 2, cy = 470, e = 200;
  const top = [[cx, cy - e], [cx + e * 0.87, cy - e / 2], [cx, cy], [cx - e * 0.87, cy - e / 2]];
  const left = [[cx - e * 0.87, cy - e / 2], [cx, cy], [cx, cy + e], [cx - e * 0.87, cy + e / 2]];
  const right = [[cx, cy], [cx + e * 0.87, cy - e / 2], [cx + e * 0.87, cy + e / 2], [cx, cy + e]];
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  const cube = () => {
    g.shadowBlur = 0;
    poly(top); g.fillStyle = '#a5f3fc'; g.fill();
    poly(left); g.fillStyle = '#22d3ee'; g.fill();
    poly(right); g.fillStyle = '#0e7490'; g.fill();
    g.strokeStyle = '#ecfeff'; g.lineWidth = 7; g.lineJoin = 'round';
    g.shadowColor = '#67e8f9'; g.shadowBlur = 28;
    [top, left, right].forEach((p) => { poly(p); g.stroke(); });
  };
  // Cut line from upper-left to lower-right; halves pushed apart along its normal.
  const ang = 0.5, nx = -Math.sin(ang), ny = Math.cos(ang), gap = 26;
  const half = (sign) => {
    g.save();
    g.translate(nx * gap * sign, ny * gap * sign);
    g.beginPath();
    const L = 2000;
    const ox = cx, oy = cy;
    g.moveTo(ox - Math.cos(ang) * L, oy - Math.sin(ang) * L);
    g.lineTo(ox + Math.cos(ang) * L, oy + Math.sin(ang) * L);
    g.lineTo(ox + Math.cos(ang) * L + nx * L * sign, oy + Math.sin(ang) * L + ny * L * sign);
    g.lineTo(ox - Math.cos(ang) * L + nx * L * sign, oy - Math.sin(ang) * L + ny * L * sign);
    g.closePath();
    g.clip();
    cube();
    g.restore();
  };
  half(1);
  half(-1);

  // The slash
  g.save();
  g.lineCap = 'round';
  g.shadowColor = '#e879f9';
  g.shadowBlur = 40;
  g.strokeStyle = '#f5d0fe';
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(cx - Math.cos(ang) * 360, cy - Math.sin(ang) * 360);
  g.lineTo(cx + Math.cos(ang) * 360, cy + Math.sin(ang) * 360);
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  g.stroke();
  g.restore();

  g.restore();
  return c.toDataURL('image/png');
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 200, height: 200 });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const dataUrl = await win.webContents.executeJavaScript(DRAW);
  const out = path.join(__dirname, '..', 'assets', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`✔ Wrote ${path.relative(process.cwd(), out)}`);
  app.quit();
});
