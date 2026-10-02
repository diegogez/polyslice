// Electron main process: owns the window, serves the UI over app://, and bridges the UI to the
// Java engine process.

const { app, BrowserWindow, ipcMain, protocol, Menu, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { EngineProcess } = require('./engine-process');

const APP_ROOT = path.join(__dirname, '..');
const SCHEME = 'app';
const HOST = 'polyslice';
const DEV = process.argv.includes('--dev');
const CAPTURE_ARG = process.argv.find((a) => a.startsWith('--capture='));
const CAPTURE_DIR = CAPTURE_ARG ? path.resolve(APP_ROOT, CAPTURE_ARG.split('=')[1]) : null;
const SELFTEST = process.argv.includes('--selftest');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// A privileged custom scheme lets the UI use ES modules and an import map without a bundler,
// while staying off file:// (which Chromium treats as an opaque origin).
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win = null;
let engine = null;
let lastStatus = { state: 'starting' };

function serveAppFile(request) {
  const url = new URL(request.url);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(APP_ROOT, rel));
  // Only the UI folder is reachable.
  if (!file.startsWith(path.join(APP_ROOT, 'renderer') + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const body = fs.readFileSync(file);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    return new Response(body, { headers: { 'content-type': type } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function sendToRenderer(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function startEngine() {
  engine = new EngineProcess({
    appRoot: APP_ROOT,
    resources: process.resourcesPath,
    packaged: app.isPackaged,
    dataDir: SELFTEST ? path.join(app.getPath('temp'), `polyslice-selftest-${process.pid}`) : app.getPath('userData'),
  });
  engine.on('message', (line) => sendToRenderer('engine:message', line));
  engine.on('status', (status) => {
    lastStatus = status;
    if (status.state === 'error') console.error('[engine]', status.message);
    sendToRenderer('engine:status', status);
  });
  engine.start();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#07051a',
    title: 'PolySlice',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 14 },
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('blur', () => sendToRenderer('app:blur'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(`${SCHEME}://${HOST}/renderer/index.html`);
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  if (DEV || CAPTURE_DIR || SELFTEST) {
    // Surface UI warnings and errors in the terminal.
    win.webContents.on('console-message', (event) => {
      if (event.level === 'warning' || event.level === 'error') console.log(`[ui:${event.level}] ${event.message}`);
    });
  }
  if (CAPTURE_DIR) runCapture();
  if (SELFTEST) {
    // Test data goes to a throwaway folder so real high scores are untouched.
    win.webContents.once('did-finish-load', () => require('./selftest').runSelfTest(win, app));
  }
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'Game',
      submenu: [
        { label: 'Pause / Resume', accelerator: 'Esc', registerAccelerator: false, click: () => sendToRenderer('app:command', 'pause') },
        { label: 'Main Menu', accelerator: 'CmdOrCtrl+M', click: () => sendToRenderer('app:command', 'menu') },
        { type: 'separator' },
        { label: 'Restart Engine', click: () => engine && engine.start() },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload', visible: DEV || !app.isPackaged },
        { role: 'toggleDevTools', visible: DEV || !app.isPackaged },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- IPC -------------------------------------------------------------------------------------

ipcMain.on('engine:send', (_e, command) => {
  if (engine) engine.send(command);
});
ipcMain.handle('engine:status', () => lastStatus);
ipcMain.on('engine:restart', () => engine && engine.start());
ipcMain.on('app:toggle-fullscreen', () => {
  if (win) win.setFullScreen(!win.isFullScreen());
});
ipcMain.on('app:quit', () => app.quit());
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
  packaged: app.isPackaged,
  capture: Boolean(CAPTURE_DIR),
}));

// ---- Screenshot mode (npm run screenshots) ----------------------------------------------------

function runCapture() {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(CAPTURE_DIR, `${name}.png`), image.toPNG());
    console.log(`📸 ${name}.png`);
  };
  const act = (action) => sendToRenderer('app:command', action);

  win.webContents.once('did-finish-load', async () => {
    win.setSize(1600, 1000);
    await wait(4000);
    await shot('menu');
    act('demo');
    await wait(12000);
    await shot('gameplay-1');

    // Hunt for feature moments in the live demo and grab one frame of each.
    const wanted = {
      bomb: `[...app.view.views.values()].some((v) => v.code === 'BOMB' && v.group.position.y > 350)`,
      powerup: `[...app.view.views.values()].some((v) => v.code.startsWith('PU_') && v.group.position.y > 380)`,
      combo: `!!document.querySelector('.popup.combo')`,
      freeze: `document.body.classList.contains('frozen')`,
      frenzy: `document.body.classList.contains('frenzy')`,
    };
    const huntUntil = Date.now() + 70000;
    while (Date.now() < huntUntil && Object.keys(wanted).length) {
      for (const [name, test] of Object.entries(wanted)) {
        if (await win.webContents.executeJavaScript(`(() => { const app = window.app; return ${test}; })()`)) {
          await shot(`feature-${name}`);
          delete wanted[name];
        }
      }
      if (await win.webContents.executeJavaScript(`window.app.phase === 'over'`)) act('demo');
      await wait(120);
    }
    await shot('gameplay-2');
    act('end');
    await wait(3500);
    await shot('results');
    act('menu');
    await wait(800);
    act('guide');
    await wait(2500);
    await shot('guide');
    act('achievements');
    await wait(1200);
    await shot('achievements');
    act('settings');
    await wait(1200);
    await shot('settings');
    app.quit();
  });
}

// ---- Lifecycle -------------------------------------------------------------------------------

app.setName('PolySlice');

app.whenReady().then(() => {
  protocol.handle(SCHEME, serveAppFile);
  buildMenu();
  startEngine();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => engine && engine.stop());
