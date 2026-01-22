// Electron modules are available in the main process
const path = require('path');

// In Electron 40+, the modules should be available as globals
// Try different approaches to get Electron modules
let app, BrowserWindow, ipcMain;

// Approach 1: Check globals first (Electron 40+)
app = global.app;
BrowserWindow = global.BrowserWindow;
ipcMain = global.ipcMain;

// Approach 2: Check if we're in a worker thread
if (!app && process && process.resourcePath) {
  console.log('Resource path:', process.resourcePath);
}

// Approach 3: Check process.mainModule
if (!app && process.mainModule) {
  console.log('Main module:', process.mainModule.filename);
}

// Approach 4: Check if Electron is available through process
if (!app && process.versions.electron) {
  console.log('Running under Electron version:', process.versions.electron);
  console.log('Attempting to access Electron API through process...');
  
  // In Electron 40+, try to access modules through the process object
  try {
    // Try to get the Electron module from the main module
    const mainModule = require.main;
    if (mainModule && mainModule.require) {
      const electron = mainModule.require('electron');
      console.log('Main module require result:', typeof electron);
      if (typeof electron === 'object' && electron !== null) {
        app = electron.app;
        BrowserWindow = electron.BrowserWindow;
        ipcMain = electron.ipcMain;
      }
    }
  } catch (e) {
    console.error('Main module approach failed:', e.message);
  }
}

console.log('Electron app:', !!app);
console.log('Electron BrowserWindow:', !!BrowserWindow);
console.log('Electron ipcMain:', !!ipcMain);
console.log('process.versions.electron:', process.versions.electron);

if (!app) {
  console.error('Electron app is not available. Exiting...');
  console.error('This might be because:');
  console.error('1. Not running under Electron');
  console.error('2. Electron modules not properly initialized');
  console.error('3. Version compatibility issue');
  console.error('4. Module resolution issue');
  console.error('5. Electron 40+ module system changes');
  process.exit(1);
}

let mainWindow;
let serverProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: true,
    resizable: true,
    titleBarStyle: 'default'
  });

  // Load the server URL
  mainWindow.loadURL('http://127.0.0.1:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();
}

// Handle IPC communication
ipcMain.on('app-ready', () => {
  console.log('App ready event received');
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});