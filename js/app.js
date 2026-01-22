// Main application initialization for Cafe POS

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Check if we need to show login or app screen
  if (window.electronAPI) {
    // Electron environment
    window.electronAPI.onLockStatus((isLocked) => {
      if (isLocked) {
        showScreen('lock-screen');
      }
    });
    
    // Initialize all feature managers
    initializeFeatureManagers();
  }
  
  // Initialize authentication
  initAuth();
  
  // Initialize UI components
  UI.init();
  
  // Initialize menu
  Menu.init();
  
  // Initialize cart
  Cart.setupEventListeners();
  
  // Initialize KOT
  KOT.setupEventListeners();
  
  // Initialize history
  History.setupEventListeners();
  
  // Initialize payments
  Payments.setupEventListeners();
  
  // Initialize modifier manager
  ModifierManager.init();
  
  // Initialize combo manager
  ComboManager.init();
  
  // Initialize weight manager
  WeightManager.init();
  
  // Initialize split bill manager
  SplitBillManager.init();
  
  // Initialize void/refund manager
  VoidRefundManager.init();
  
  // Initialize KDS manager
  KDSManager.init();
  
  // Initialize hardware manager
  HardwareManager.init();
  
  // Initialize digital receipt manager
  DigitalReceiptManager.init();
  
  // Initialize loyalty manager
  LoyaltyManager.init();
  
  // Initialize online order manager
  OnlineOrderManager.init();
  
  // Initialize recipe manager
  RecipeManager.init();
  
  // Initialize cash drawer manager
  CashDrawerManager.init();
  
  // Initialize buzzer manager
  BuzzerManager.init();
  
  // Initialize table manager
  TableManager.init();
  
  // Initialize offline manager
  OfflineManager.init();
  
  // Initialize sync manager
  SyncManager.init();
  
  // Initialize reporting manager
  ReportingManager.init();
  
  // Initialize tax engine
  TaxEngine.init();
  
  // Calculate initial billing
  Billing.calculate();
});

// Initialize app after login
function initApp() {
  // Menu is already initialized, but let's refresh it
  Menu.refresh();
  
  // Refresh KOT display
  KOT.refresh();
  
  // Refresh history
  History.refresh();
}

// Initialize all feature managers
async function initializeFeatureManagers() {
  try {
    // Initialize feature managers via Electron API
    if (window.electronAPI) {
      await window.electronAPI.initModifierManager();
      await window.electronAPI.initComboManager();
      await window.electronAPI.initWeightManager();
      await window.electronAPI.initSplitBillManager();
      await window.electronAPI.initVoidRefundManager();
      await window.electronAPI.initKDSManager();
      await window.electronAPI.initHardwareManager();
      await window.electronAPI.initDigitalReceiptManager();
      await window.electronAPI.initLoyaltyManager();
      await window.electronAPI.initOnlineOrderManager();
      await window.electronAPI.initRecipeManager();
      await window.electronAPI.initCashDrawerManager();
      await window.electronAPI.initCashReconciliationManager();
      await window.electronAPI.initBuzzerManager();
      await window.electronAPI.initTableManager();
      await window.electronAPI.initOfflineManager();
      await window.electronAPI.initSyncManager();
      await window.electronAPI.initReportingManager();
      await window.electronAPI.initTaxEngine();
    }
    
    console.log('All feature managers initialized successfully');
  } catch (error) {
    console.error('Error initializing feature managers:', error);
  }
}

// Helper function to show screen
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
  }
}

// Helper function to hide screen
function hideScreen(screenId) {
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.remove('active');
  }
}

// Global error handler
window.addEventListener('error', (e) => {
  console.error('Application Error:', e.error);
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled Promise Rejection:', e.reason);
});

// Make initApp globally available
window.initApp = initApp;

// Console welcome message
console.log('%c☕ Welcome to Cafe POS!', 'font-size: 24px; font-weight: bold; color: #6c5ce7;');
console.log('%cPoint of Sale System', 'font-size: 14px; color: #636e72;');
