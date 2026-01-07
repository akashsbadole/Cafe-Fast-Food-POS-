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
