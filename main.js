// Import required modules
const path = require('path');

// Import Electron modules
const { app, BrowserWindow, ipcMain, screen } = require('electron');

// Start Express server
const { startServer } = require('./server.js');

// Check if server is already running
async function checkServerRunning() {
  try {
    const response = await fetch('http://127.0.0.1:3000/api/ping');
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Load feature managers
const ModifierManager = require('./js/modifier-manager.js');
const ComboManager = require('./js/combo-manager.js');
const WeightManager = require('./js/weight-manager.js');
const SplitBillManager = require('./js/split-bill-manager.js');
const VoidRefundManager = require('./js/void-refund-manager.js');
const KDSManager = require('./js/kds-manager.js');
const HardwareManager = require('./js/hardware-manager.js');
const DigitalReceiptManager = require('./js/digital-receipt-manager.js');
const LoyaltyManager = require('./js/loyalty-manager.js');
const OnlineOrderManager = require('./js/online-order-manager.js');
const RecipeManager = require('./js/recipe-manager.js');
const CashDrawerManager = require('./js/cash-drawer-manager.js');
const CashReconciliationManager = require('./js/cash-reconciliation-manager.js');
const BuzzerManager = require('./js/buzzer-manager.js');
const TableManager = require('./js/table-manager.js');
const OfflineManager = require('./js/offline-manager.js');
const SyncManager = require('./js/sync-manager.js');
const ReportingManager = require('./js/reporting-manager.js');
const TaxEngine = require('./js/tax-engine.js');

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

  // Load the server URL instead of index.html
  mainWindow.loadURL('http://127.0.0.1:3000');

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('app-ready');
    mainWindow.show();
  });

  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();
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

// Initialize app
async function initApp() {
  try {
    // Check if server is already running
    const serverRunning = await checkServerRunning();
    if (!serverRunning) {
      console.log('Starting Express server...');
      // Start the Express server first
      await startServer();
      console.log('Express server started successfully');
    } else {
      console.log('Express server already running');
    }

    // Then create the window
    console.log('Creating Electron window...');
    await createWindow();
    console.log('Electron window created');

    // Register IPC handlers
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
