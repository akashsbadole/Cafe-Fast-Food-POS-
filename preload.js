const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auto-lock functions
  onLockScreen: (callback) => ipcRenderer.on('lock-screen', callback),
  onAppUnlocked: (callback) => ipcRenderer.on('app-unlocked', callback),
  sendUserActivity: () => ipcRenderer.send('user-activity'),
  unlockApp: () => ipcRenderer.send('unlock-app'),
  getLockStatus: () => ipcRenderer.send('get-lock-status'),
  onLockStatus: (callback) => ipcRenderer.on('lock-status', (event, status) => callback(status)),
  
  // Feature manager initialization
  initModifierManager: () => ipcRenderer.invoke('init-modifier-manager'),
  initComboManager: () => ipcRenderer.invoke('init-combo-manager'),
  initWeightManager: () => ipcRenderer.invoke('init-weight-manager'),
  initSplitBillManager: () => ipcRenderer.invoke('init-split-bill-manager'),
  initVoidRefundManager: () => ipcRenderer.invoke('init-void-refund-manager'),
  initKDSManager: () => ipcRenderer.invoke('init-kds-manager'),
  initHardwareManager: () => ipcRenderer.invoke('init-hardware-manager'),
  initDigitalReceiptManager: () => ipcRenderer.invoke('init-digital-receipt-manager'),
  initLoyaltyManager: () => ipcRenderer.invoke('init-loyalty-manager'),
  initOnlineOrderManager: () => ipcRenderer.invoke('init-online-order-manager'),
  initRecipeManager: () => ipcRenderer.invoke('init-recipe-manager'),
  initCashDrawerManager: () => ipcRenderer.invoke('init-cash-drawer-manager'),
  initCashReconciliationManager: () => ipcRenderer.invoke('init-cash-reconciliation-manager'),
  initBuzzerManager: () => ipcRenderer.invoke('init-buzzer-manager'),
  initTableManager: () => ipcRenderer.invoke('init-table-manager'),
  initOfflineManager: () => ipcRenderer.invoke('init-offline-manager'),
  initSyncManager: () => ipcRenderer.invoke('init-sync-manager'),
  initReportingManager: () => ipcRenderer.invoke('init-reporting-manager'),
  initTaxEngine: () => ipcRenderer.invoke('init-tax-engine'),
  
  // API endpoints
  fetchModifierGroups: (params) => ipcRenderer.invoke('fetch-modifier-groups', params),
  fetchModifiers: (params) => ipcRenderer.invoke('fetch-modifiers', params),
  fetchComboDeals: (params) => ipcRenderer.invoke('fetch-combo-deals', params),
  fetchWeightedItems: (params) => ipcRenderer.invoke('fetch-weighted-items', params),
  fetchSplitBillSessions: (params) => ipcRenderer.invoke('fetch-split-bill-sessions', params),
  fetchVoidRefundRequests: (params) => ipcRenderer.invoke('fetch-void-refund-requests', params),
  fetchKDSTickets: (params) => ipcRenderer.invoke('fetch-kds-tickets', params),
  fetchHardwareDevices: (params) => ipcRenderer.invoke('fetch-hardware-devices', params),
  fetchDigitalReceiptTemplates: (params) => ipcRenderer.invoke('fetch-digital-receipt-templates', params),
  fetchLoyaltyPrograms: (params) => ipcRenderer.invoke('fetch-loyalty-programs', params),
  fetchOnlineOrderProviders: (params) => ipcRenderer.invoke('fetch-online-order-providers', params),
  fetchRecipes: (params) => ipcRenderer.invoke('fetch-recipes', params),
  fetchCashDrawers: (params) => ipcRenderer.invoke('fetch-cash-drawers', params),
  fetchBuzzers: (params) => ipcRenderer.invoke('fetch-buzzers', params),
  fetchTables: (params) => ipcRenderer.invoke('fetch-tables', params),
  fetchOfflineStatus: () => ipcRenderer.invoke('fetch-offline-status'),
  fetchReports: (params) => ipcRenderer.invoke('fetch-reports', params),
  calculateTax: (params) => ipcRenderer.invoke('calculate-tax', params)
});
