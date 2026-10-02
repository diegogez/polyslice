// The only bridge between the sandboxed UI and Electron. Exposes a tiny, explicit API.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('polyslice', {
  platform: process.platform,
  /** Sends a command object to the Java engine. */
  send: (command) => ipcRenderer.send('engine:send', JSON.stringify(command)),
  /** Receives raw JSON lines from the engine. */
  onMessage: (callback) => ipcRenderer.on('engine:message', (_e, line) => callback(line)),
  onStatus: (callback) => ipcRenderer.on('engine:status', (_e, status) => callback(status)),
  status: () => ipcRenderer.invoke('engine:status'),
  restartEngine: () => ipcRenderer.send('engine:restart'),
  /** Menu items and screenshot mode drive the UI through these commands. */
  onCommand: (callback) => ipcRenderer.on('app:command', (_e, command) => callback(command)),
  onBlur: (callback) => ipcRenderer.on('app:blur', () => callback()),
  toggleFullscreen: () => ipcRenderer.send('app:toggle-fullscreen'),
  quit: () => ipcRenderer.send('app:quit'),
  info: () => ipcRenderer.invoke('app:info'),
});
