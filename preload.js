const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auto-lock functions
  onLockScreen: (callback) => ipcRenderer.on('lock-screen', callback),
  onAppUnlocked: (callback) => ipcRenderer.on('app-unlocked', callback),
  sendUserActivity: () => ipcRenderer.send('user-activity'),
  unlockApp: () => ipcRenderer.send('unlock-app'),
  getLockStatus: () => ipcRenderer.send('get-lock-status'),
  onLockStatus: (callback) => ipcRenderer.on('lock-status', (event, status) => callback(status))
});
