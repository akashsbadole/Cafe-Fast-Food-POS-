const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

// Start Express server
const { startServer } = require('./server.js');

let mainWindow;
let isLocked = false;
let lockTimer = null;
const LOCK_TIMEOUT = 120000; // 2 minutes

async function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: Math.min(1400, width),
    height: Math.min(900, height),
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

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('app-ready');
    mainWindow.show();
  });
}

// Activity tracking for auto-lock
function resetLockTimer() {
  if (lockTimer) {
    clearTimeout(lockTimer);
  }
  if (isLocked) return;
  
  lockTimer = setTimeout(() => {
    if (mainWindow && !isLocked) {
      isLocked = true;
      mainWindow.webContents.send('lock-screen');
    }
  }, LOCK_TIMEOUT);
}

// Track user activity
ipcMain.on('user-activity', () => {
  resetLockTimer();
});

ipcMain.on('unlock-app', () => {
  isLocked = false;
  resetLockTimer();
  mainWindow.webContents.send('app-unlocked');
});

ipcMain.on('get-lock-status', (event) => {
  event.reply('lock-status', isLocked);
});

// Initialize app
async function initApp() {
  try {
    console.log('Starting Express server...');
    // Start the Express server first
    await startServer();
    console.log('Express server started successfully');
    
    // Then create the window
    console.log('Creating Electron window...');
    await createWindow();
    console.log('Electron window created');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    process.exit(1);
  }
}

app.whenReady().then(initApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
