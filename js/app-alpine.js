// Alpine.js Application for Cafe POS - Reactive UI State Management

// Detect API base URL dynamically
function getApiBaseUrl() {
  return 'http://127.0.0.1:3000';
}

const API_BASE = getApiBaseUrl();

function posApp() {
  return {
    // Authentication state
    isLoggedIn: false,
    isLocked: false,
    currentUser: null,
    authToken: null,
    pinString: '',
    lockPinString: '',
    username: '',
    showUsernameLogin: false,
    availableUsers: [],
    loginError: '',
    lockError: '',

    // Token refresh state
    isRefreshingToken: false,
    lastRefreshTime: null,

    // UI state
    theme: 'light',
    language: 'en',
    currentTime: '',
    currentDate: '',
    timeInterval: null,
    activeSettingsTab: 'general',
    settingsErrors: {},
    isSavingSettings: false,

    // Menu state
    categories: [],
    allItems: [],
    selectedCategory: 'all',
    searchQuery: '',

    // Cart state
    cart: [],
    discountValue: 0,
    discountType: 'fixed',
    subtotal: 0,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 0,
    orderNotes: '',

    // Item Details Modal state
    showItemDetailsModal: false,
    selectedItem: null,
    itemWeight: 0,
    itemModifiers: [],
    selectedModifiers: [],
    comboComponents: [],
    selectedComboOptions: {},
    itemQuantity: 1,
    itemNotes: '',
    itemPrice: 0,

    // Computed: Weighted item price
    get weightedPrice() {
      if (!this.selectedItem || !this.selectedItem.is_weighted) return 0;
      return (this.itemWeight * (this.selectedItem.price || 0)).toFixed(2);
    },

    // Computed: Final item price with modifiers and combos
    get finalItemPrice() {
      let basePrice = this.selectedItem?.is_weighted ? this.weightedPrice : (this.selectedItem?.price || 0);
      let modifiersTotal = this.selectedModifiers.reduce((sum, modId) => {
        const modifier = this.itemModifiers.find(m => m.options.some(o => o.id === modId));
        if (modifier) {
          const option = modifier.options.find(o => o.id === modId);
          return sum + (option?.price || 0);
        }
        return sum;
      }, 0);

      let comboTotal = 0;
      if (this.selectedItem?.is_combo) {
        Object.values(this.selectedComboOptions).forEach(optionId => {
          const option = this.comboComponents.flatMap(c => c.options).find(o => o.id === optionId);
          if (option) {
            comboTotal += option.price;
          }
        });
      }

      return (basePrice + modifiersTotal + comboTotal) * this.itemQuantity;
    },

    // Payment state
    paymentMode: 'cash',

    // KOT state
    showKOT: false,
    kotTickets: [],

    // History state
    showHistory: false,
    historyFilter: 'today',
    orderSearch: '',
    orders: [],
    selectedOrder: null,

    // Menu management state
    showMenuManagement: false,
    menuTab: 'categories',
    showCategoryFormModal: false,
    showItemFormModal: false,
    editingCategory: null,
    editingItem: null,
    categoryForm: { name: '', display_order: 0, icon: '☕' },
    itemForm: { name: '', category_id: 1, price: 0, description: '', is_available: true, stock_quantity: 0 },
    showSettings: false,

    // Customer state
    selectedCustomer: null,
    customerSearchQuery: '',
    customerSearchResults: [],
    showCustomerResults: false,
    showAddCustomerForm: false,
    newCustomer: { name: '', phone: '' },

    // User management state
    users: [],

    // MVP Features state
    showUserManagement: false,
    showInventoryManagement: false,
    showCustomerManagement: false,
    showReportsModal: false,

    // Enhanced User Management
    roles: [],
    editingUser: null,
    userForm: {
      username: '',
      pin: '',
      password: '',
      role_id: 1,
      full_name: '',
      permissions: []
    },

    // Enhanced Customer Management
    customers: [],
    customerForm: {
      name: '',
      phone: '',
      email: '',
      notes: ''
    },

    // Inventory Management
    lowStockItems: [],
    inventoryHistory: [],
    selectedInventoryItem: null,
    stockAdjustment: {
      quantity: 0,
      reason: ''
    },

    // Table Management
    showTableManagement: false,
    showTableLayout: true,
    tables: [],
    tableForm: { table_number: '', name: '', status: 'available' },

    // KDS Management
    showKDSManagement: false,
    stations: [],
    kdsTickets: [],
    stationForm: { name: '', description: '', is_active: true },

    // Split Billing
    showSplitBilling: false,
    splitMethod: 'items',
    splitCustomers: [{ id: 1, number: 1, items: [], amount: 0 }],
    equalSplitCount: 2,

    // Cash Drawer Management
    showCashDrawerManagement: false,
    cashDrawerSession: null,
    cashDrawerHistory: [],

    // Void/Refund
    showVoidRefund: false,
    voidRefundOrderNumber: '',
    voidRefundReason: '',
    voidRefundOtherReason: '',
    managerPin: '',
    voidRefundAmount: 0,

    // Reporting
    reportType: 'daily',
    reportStartDate: '',
    reportEndDate: '',
    reportData: null,
    reportLoading: false,
    roles: [],
    showUserManagement: false,
    showUserFormModal: false,
    editingUser: null,
    userForm: { username: '', pin: '', role_id: null, full_name: '' },

    // Reporting state
    showReports: false,
    reportDateRange: { start: '', end: '' },
    reportData: {
      summary: { total_sales: 0, total_orders: 0, total_tax: 0, total_discount: 0 },
      paymentBreakdown: [],
      topItems: []
    },

    // Application configuration
    appSettings: {
      business_name: 'Cafe POS',
      business_address: '',
      tax_rate: '9.00',
      currency_symbol: '₹',
      currency_code: 'INR',
      receipt_header: 'COFFEE CAFE\nTaste the Difference',
      receipt_footer: 'Thank you! Visit Again!',
      receipt_show_logo: 'true',
      receipt_font_size: '12px'
    },

    // Toast state
    toasts: [],
    toastCounter: 0,

    // Bill state
    showBill: false,
    billHtml: '',
    showOrderDetailsModal: false,
    orderDetailsHtml: '',

    // Refresh authentication token
    async refreshToken() {
      // Prevent concurrent refresh calls
      if (this.isRefreshingToken) {
        console.log('[DEBUG] Client: Refresh already in progress, skipping...');
        return true; // Assume it will succeed
      }

      // Prevent refresh too soon after last successful refresh (within 30 seconds)
      if (this.lastRefreshTime && (Date.now() - this.lastRefreshTime) < 30000) {
        console.log('[DEBUG] Client: Refresh called too soon, skipping...');
        return true;
      }

      this.isRefreshingToken = true;

      try {
        console.log('[DEBUG] Client: Attempting token refresh at', new Date().toISOString());

        // Don't send expired token to refresh endpoint - use basic headers only
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            localStorage.setItem('authToken', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            this.authToken = result.token;
            this.currentUser = result.user;
            this.lastRefreshTime = Date.now();
            console.log('[DEBUG] Client: Token refreshed successfully at', new Date().toISOString());
            return true;
          }
        }
        console.error('[DEBUG] Client: Token refresh failed with status:', response.status);
        return false;
      } catch (error) {
        console.error('[DEBUG] Client: Error refreshing token:', error);
        return false;
      } finally {
        this.isRefreshingToken = false;
      }
    },

    // Make authenticated API call with automatic token refresh on 403
    async apiCall(url, options = {}) {
      const makeRequest = async (retry = false) => {
        const headers = await this.getAuthHeaders();
        const requestOptions = {
          ...options,
          headers: {
            ...headers,
            ...options.headers
          }
        };

        const response = await fetch(url, requestOptions);

        // If we get 403 and haven't retried yet, try refreshing token
        if (response.status === 403 && !retry) {
          console.log('[DEBUG] Got 403, attempting token refresh...');
          const refreshed = await this.refreshToken();
          if (refreshed) {
            console.log('[DEBUG] Token refreshed, retrying request...');
            return makeRequest(true); // Retry with new token
          } else {
            console.error('[DEBUG] Token refresh failed, user needs to login');
            this.logout(true);
            this.showToast('Session expired. Please login again.', 'error');
            throw new Error('Authentication failed');
          }
        }

        // Handle 401 errors (unauthorized)
        if (response.status === 401) {
          console.error('[DEBUG] Got 401, user not authenticated');
          this.logout(true);
          this.showToast('You are not authenticated. Please login.', 'error');
          throw new Error('Authentication required');
        }

        return response;
      };

      return makeRequest();
    },

    // Get authentication headers with automatic token refresh
    async getAuthHeaders() {
      let token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json'
      };

      if (token) {
        // Check if token is expired or will expire soon (within 30 minutes)
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const now = Math.floor(Date.now() / 1000);
          const timeToExpiry = payload.exp - now;

          console.log(`[DEBUG] Client: Checking token expiry - expires in ${timeToExpiry} seconds (${new Date(payload.exp * 1000).toISOString()})`);

          if (timeToExpiry < 0) {
            console.warn('[DEBUG] Client: Token is expired, attempting refresh...');
            const refreshed = await this.refreshToken();
            if (refreshed) {
              token = localStorage.getItem('authToken');
            } else {
              // Refresh failed, user needs to login again
              this.logout();
              return headers;
            }
          } else if (timeToExpiry < 300) { // Less than 5 minutes
            console.log('[DEBUG] Client: Token expires soon, refreshing proactively...');
            await this.refreshToken(); // Don't block, refresh in background
            token = localStorage.getItem('authToken'); // Use potentially refreshed token
          }
        } catch (e) {
          console.error('[DEBUG] Client: Error parsing token:', e);
        }

        headers['Authorization'] = `Bearer ${token}`;
      } else {
        console.warn('[DEBUG] Client: No auth token found');
      }
      return headers;
    },

    // Initialize application
    init() {
      // Initialize all arrays to prevent Alpine.js errors
      this.categories = this.categories || [];
      this.allItems = this.allItems || [];
      this.cart = this.cart || [];
      this.orders = this.orders || [];
      this.kotTickets = this.kotTickets || [];
      this.users = this.users || [];
      this.roles = this.roles || [];
      this.customers = this.customers || [];
      this.customerSearchResults = this.customerSearchResults || [];
      this.lowStockItems = this.lowStockItems || [];
      this.inventoryHistory = this.inventoryHistory || [];
      this.tables = this.tables || [];
      this.stations = this.stations || [];
      this.kdsTickets = this.kdsTickets || [];
      this.splitCustomers = this.splitCustomers || [{ id: 1, number: 1, items: [], amount: 0 }];
      this.cashDrawerHistory = this.cashDrawerHistory || [];
      this.itemModifiers = this.itemModifiers || [];
      this.comboComponents = this.comboComponents || [];
      this.selectedModifiers = this.selectedModifiers || [];
      this.selectedComboOptions = this.selectedComboOptions || {};
      this.inventoryCategories = this.inventoryCategories || [];
      this.inventorySuppliers = this.inventorySuppliers || [];

      // Initialize inventory filter properties
      this.inventorySearch = this.inventorySearch || '';
      this.inventoryCategoryFilter = this.inventoryCategoryFilter || '';
      this.inventoryStatusFilter = this.inventoryStatusFilter || '';

      this.loadTheme();
      this.loadLanguage();
      this.startClock();

      // Check if user is authenticated before loading protected data
      const authToken = localStorage.getItem('authToken');
      const user = localStorage.getItem('user');

      if (authToken && user) {
        this.authToken = authToken;
        this.currentUser = JSON.parse(user);
        this.isLoggedIn = true;

        // Load protected data with error handling
        this.loadSettings().catch(err => console.warn('Settings load failed:', err));
        this.loadOrders().catch(err => console.warn('Orders load failed:', err));
        this.loadKOTTickets().catch(err => console.warn('KOT tickets load failed:', err));
        if (this.currentUser.role === 'admin') {
          this.loadUsers().catch(err => console.warn('Users load failed:', err));
          this.loadRoles().catch(err => console.warn('Roles load failed:', err));
        }
        this.loadCustomers().catch(err => console.warn('Customers load failed:', err));
        this.loadLowStockItems().catch(err => console.warn('Low stock items load failed:', err));
        this.loadTables().catch(err => console.warn('Tables load failed:', err));
        this.loadStations().catch(err => console.warn('Stations load failed:', err));
        this.loadCashDrawerSession().catch(err => console.warn('Cash drawer session load failed:', err));
        this.loadCashDrawerHistory().catch(err => console.warn('Cash drawer history load failed:', err));
      }

      this.loadMenuData();
      this.setupAutoLock();
      this.setupShortcuts();
      this.setupSettingsKeyboardNavigation();

      // Init dates for report (Today)
      const today = new Date().toISOString().split('T')[0];
      this.reportDateRange = { start: today, end: today };

      // Global Error Handler
      window.onerror = (msg, _url, _lineNo, _columnNo, error) => {
        console.error('Global Error:', error);

        // Filter out Alpine.js internal errors to prevent spam
        if (msg && (msg.includes('alpine.min.js') || msg.includes('Cannot read properties of undefined'))) {
          console.warn('Alpine.js internal error filtered:', msg);
          return true; // Prevent default error handling
        }

        this.showToast('An unexpected error occurred', 'error');
        return false;
      };

      // Handle unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);

        // Filter out common Alpine.js errors
        if (event.reason && event.reason.message && event.reason.message.includes('alpine')) {
          console.warn('Alpine.js promise rejection filtered:', event.reason);
          event.preventDefault();
          return;
        }

        this.showToast('An unexpected error occurred', 'error');
      });
    },

    // --- Settings Methods ---
    async loadSettings() {
      try {
        const res = await this.apiCall(`${API_BASE}/api/settings`);
        if (res.ok) {
          this.appSettings = await res.json();
          this.updateReceiptPreview(); // Update preview after loading settings
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        this.showToast('Failed to load settings', 'error');
      }
    },

    // Validate settings form
    validateSettings(tab) {
      const errors = {};

      if (tab === 'business') {
        if (!this.appSettings.business_name || this.appSettings.business_name.trim() === '') {
          errors.business_name = 'Business name is required';
        }
      }

      if (tab === 'tax') {
        const taxRate = parseFloat(this.appSettings.tax_rate);
        if (isNaN(taxRate) || taxRate < 0) {
          errors.tax_rate = 'Tax rate must be a positive number';
        }
      }

      this.settingsErrors = errors;
      return Object.keys(errors).length === 0;
    },

    // Save general settings
    async saveGeneralSettings() {
      if (!this.validateSettings('general')) {
        this.showToast('Please fix the errors before saving', 'error');
        return;
      }

      this.isSavingSettings = true;
      try {
        localStorage.setItem('theme', this.theme);
        localStorage.setItem('language', this.language);
        document.documentElement.setAttribute('data-theme', this.theme);
        this.showToast('General settings saved successfully', 'success');
      } catch (error) {
        console.error('Error saving general settings:', error);
        this.showToast('Failed to save general settings', 'error');
      } finally {
        this.isSavingSettings = false;
      }
    },

    // Save business settings
    async saveBusinessSettings() {
      if (!this.validateSettings('business')) {
        this.showToast('Please fix the errors before saving', 'error');
        return;
      }

      this.isSavingSettings = true;
      try {
        const res = await this.apiCall(`${API_BASE}/api/settings`, {
          method: 'PUT',
          body: JSON.stringify(this.appSettings)
        });

        if (res.ok) {
          this.showToast('Business settings saved successfully', 'success');
        } else {
          const err = await res.json();
          this.showToast(err.error || 'Failed to update business settings', 'error');
        }
      } catch (error) {
        console.error('Error updating business settings:', error);
        this.showToast('Failed to save business settings', 'error');
      } finally {
        this.isSavingSettings = false;
      }
    },

    // Save tax settings
    async saveTaxSettings() {
      if (!this.validateSettings('tax')) {
        this.showToast('Please fix the errors before saving', 'error');
        return;
      }

      this.isSavingSettings = true;
      try {
        const res = await fetch(`${API_BASE}/api/settings`, {
          method: 'PUT',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(this.appSettings)
        });

        if (res.ok) {
          this.showToast('Tax settings saved successfully', 'success');
          this.calculateTotals(); // Recalculate totals with new tax rate
        } else {
          const err = await res.json();
          this.showToast(err.error || 'Failed to update tax settings', 'error');
        }
      } catch (error) {
        console.error('Error updating tax settings:', error);
        this.showToast('Failed to save tax settings', 'error');
      } finally {
        this.isSavingSettings = false;
      }
    },

    async updateSettings() {
      try {
        const res = await fetch(`${API_BASE}/api/settings`, {
          method: 'PUT',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(this.appSettings)
        });

        if (res.ok) {
          this.showToast('Settings updated successfully', 'success');
          this.calculateTotals(); // Recalculate if tax_rate changed
        } else {
          const err = await res.json();
          this.showToast(err.error || 'Failed to update settings', 'error');
        }
      } catch (error) {
        console.error('Error updating settings:', error);
        this.showToast('Failed to save settings', 'error');
      }
    },

    // --- Toast Methods ---
    showToast(message, type = 'info') {
      const id = this.toastCounter++;
      this.toasts.push({ id, message, type, visible: true });

      // Auto remove
      setTimeout(() => {
        this.removeToast(id);
      }, 3000);
    },

    removeToast(id) {
      const index = this.toasts.findIndex(t => t.id === id);
      if (index !== -1) {
        this.toasts[index].visible = false; // Trigger transition
        setTimeout(() => {
          this.toasts = this.toasts.filter(t => t.id !== id);
        }, 300);
      }
    },

    // Keyboard Shortcuts
    setupShortcuts() {
      document.addEventListener('keydown', (e) => {
        if (!this.isLoggedIn || this.isLocked) return;

        // F1: Search
        if (e.key === 'F1') {
          e.preventDefault();
          document.querySelector('input[placeholder*="Search menu"]')?.focus();
        }

        // F2: Checkout
        if (e.key === 'F2') {
          e.preventDefault();
          if (this.cart.length > 0) this.checkout();
        }

        // F3: Clear Cart
        if (e.key === 'F3') {
          e.preventDefault();
          this.clearCart();
        }

        // F4: Send to Kitchen
        if (e.key === 'F4') {
          e.preventDefault();
          this.sendToKitchen();
        }

        // F5 is usually Refresh, let browser handle or override if needed.
        // Let's keep F5 native.
      });
    },

    // Load theme from localStorage
    loadTheme() {
      this.theme = localStorage.getItem('theme') || 'light';
      document.documentElement.setAttribute('data-theme', this.theme);
    },

    // Load language from localStorage
    loadLanguage() {
      this.language = localStorage.getItem('language') || 'en';
    },

    // Toggle theme
    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', this.theme);
      document.documentElement.setAttribute('data-theme', this.theme);
    },

    // Setup keyboard navigation for settings
    setupSettingsKeyboardNavigation() {
      document.addEventListener('keydown', (e) => {
        if (!this.showSettings) return;

        // Save with Ctrl+S
        if (e.ctrlKey && e.key === 's') {
          e.preventDefault();
          const activeTab = this.activeSettingsTab;
          if (activeTab === 'general') {
            this.saveGeneralSettings();
          } else if (activeTab === 'business') {
            this.saveBusinessSettings();
          } else if (activeTab === 'tax') {
            this.saveTaxSettings();
          } else if (activeTab === 'receipt') {
            this.updateSettings();
          }
        }

        // Close with Escape
        if (e.key === 'Escape') {
          this.showSettings = false;
        }

        // Tab navigation between tabs
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const tabs = ['general', 'business', 'receipt', 'tax', 'data', 'system'];
          const currentIndex = tabs.indexOf(this.activeSettingsTab);
          if (currentIndex < tabs.length - 1) {
            this.activeSettingsTab = tabs[currentIndex + 1];
          }
        }

        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const tabs = ['general', 'business', 'receipt', 'tax', 'data', 'system'];
          const currentIndex = tabs.indexOf(this.activeSettingsTab);
          if (currentIndex > 0) {
            this.activeSettingsTab = tabs[currentIndex - 1];
          }
        }
      });
    },

    // Start clock
    startClock() {
      this.updateTime();
      this.timeInterval = setInterval(() => this.updateTime(), 1000);
    },

    // Update current time
    updateTime() {
      const now = new Date();
      this.currentTime = now.toLocaleString('default', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      this.currentDate = now.toLocaleDateString('default', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    },

    // Load menu data from database
    async loadMenuData() {
      try {
        // Load categories
        const categoriesResponse = await fetch(`${API_BASE}/api/categories`);
        this.categories = await categoriesResponse.json();

        // Load menu items
        const itemsResponse = await fetch(`${API_BASE}/api/menu-items`);
        this.allItems = await itemsResponse.json();

        // Ensure cost_price and selling_price have default values
        this.allItems = this.allItems.map(item => ({
          ...item,
          cost_price: item.cost_price || 0,
          selling_price: item.selling_price || 0
        }));
      } catch (error) {
        console.error('Error loading menu data:', error);
        this.showToast('Failed to load menu data. Using fallback.', 'error');
        // Fallback to default data
        this.categories = [
          { id: 1, name: 'Coffee', icon: '☕', display_order: 1 },
          { id: 2, name: 'Tea', icon: '🍵', display_order: 2 },
          { id: 3, name: 'Snacks', icon: '🥐', display_order: 3 },
          { id: 4, name: 'Fast-Food', icon: '🍔', display_order: 4 },
          { id: 5, name: 'Cold Beverages', icon: '🧊', display_order: 5 },
          { id: 6, name: 'Meals/Combos', icon: '🍽️', display_order: 6 }
        ];

        this.allItems = [
          { id: 1, category_id: 1, name: 'Espresso', price: 80, category_name: 'Coffee', category_icon: '☕', is_available: true },
          { id: 2, category_id: 1, name: 'Cappuccino', price: 120, category_name: 'Coffee', category_icon: '☕', is_available: true },
          { id: 3, category_id: 1, name: 'Latte', price: 130, category_name: 'Coffee', category_icon: '☕', is_available: true },
          { id: 4, category_id: 2, name: 'Masala Chai', price: 40, category_name: 'Tea', category_icon: '🍵', is_available: true },
          { id: 5, category_id: 2, name: 'Green Tea', price: 60, category_name: 'Tea', category_icon: '🍵', is_available: true },
          { id: 6, category_id: 3, name: 'Croissant', price: 85, category_name: 'Snacks', category_icon: '🥐', is_available: true },
          { id: 7, category_id: 4, name: 'Burger', price: 150, category_name: 'Fast-Food', category_icon: '🍔', is_available: true },
          { id: 8, category_id: 5, name: 'Cold Coffee', price: 140, category_name: 'Cold Beverages', category_icon: '🧊', is_available: true },
          { id: 9, category_id: 6, name: 'Coffee + Sandwich', price: 180, category_name: 'Meals/Combos', category_icon: '🍽️', is_available: true }
        ];
      }
    },

    // Load orders
    async loadOrders() {
      try {
        const response = await this.apiCall(`${API_BASE}/api/orders`);
        if (response.ok) {
          this.orders = await response.json();
        }
      } catch (error) {
        console.error('Error loading orders:', error);
        this.showToast('Failed to load orders.', 'error');
        this.orders = [];
      }
    },

    // Load KOT tickets
    async loadKOTTickets() {
      try {
        const response = await fetch(`${API_BASE}/api/kot`, {
          headers: await this.getAuthHeaders()
        });
        this.kotTickets = await response.json();

        // Enrich tickets with items
        for (const ticket of this.kotTickets) {
          try {
            const orderResponse = await fetch(`${API_BASE}/api/orders/${ticket.order_id}`);
            const order = await orderResponse.json();
            ticket.items = order.items || [];
          } catch (e) {
            ticket.items = [];
          }
        }
      } catch (error) {
        console.error('Error loading KOT tickets:', error);
        this.showToast('Failed to load KOT tickets.', 'error');
        this.kotTickets = [];
      }
    },

    // Computed: filtered items
    get filteredItems() {
      // Defensive check to prevent errors
      if (!Array.isArray(this.allItems)) {
        return [];
      }

      const query = this.searchQuery ? this.searchQuery.toLowerCase() : '';

      return this.allItems.filter(item => {
        // Must be available
        if (!item.is_available) return false;

        // Filter by category
        if (this.selectedCategory !== 'all' && item.category_id != this.selectedCategory) return false;

        // Filter by search query
        if (query) {
          return item.name.toLowerCase().includes(query) ||
            (item.description && item.description.toLowerCase().includes(query));
        }

        return true;
      });
    },

    // Computed: filtered inventory items
    get filteredInventoryItems() {
      // Defensive check to prevent errors
      if (!Array.isArray(this.allItems)) {
        return [];
      }

      return this.allItems.filter(item => {
        // Filter by search
        if (this.inventorySearch) {
          const query = this.inventorySearch.toLowerCase();
          if (!item.name.toLowerCase().includes(query) &&
            !item.category_name?.toLowerCase().includes(query)) {
            return false;
          }
        }

        // Filter by category
        if (this.inventoryCategoryFilter && item.category_id != this.inventoryCategoryFilter) {
          return false;
        }

        // Filter by status
        if (this.inventoryStatusFilter) {
          const hasStock = item.stock_quantity > 0;
          const isLowStock = item.stock_quantity <= (item.low_stock_threshold || 0);

          switch (this.inventoryStatusFilter) {
            case 'in-stock':
              return hasStock && !isLowStock;
            case 'low-stock':
              return isLowStock && hasStock;
            case 'out-of-stock':
              return !hasStock;
          }
        }

        return true;
      });
    },

    // Computed: filtered orders
    get filteredOrders() {
      // Defensive check to prevent errors
      if (!Array.isArray(this.orders)) {
        return [];
      }

      const today = new Date().toISOString().split('T')[0];
      const query = this.orderSearch ? this.orderSearch.toLowerCase() : '';

      return this.orders.filter(o => {
        // Filter by date
        if (this.historyFilter === 'today') {
          if (!o.created_at || !o.created_at.startsWith(today)) return false;
        }

        // Filter by order number
        if (query) {
          if (!o.order_number || !o.order_number.toLowerCase().includes(query)) return false;
        }

        return true;
      });
    },

    // Cart operations
    addToCart(item) {
      if (item.stock_quantity !== null && item.stock_quantity < 1) {
        this.showToast('Item is out of stock!', 'error');
        return;
      }

      const existing = this.cart.find(i => i.id === item.id);
      if (existing) {
        if (item.stock_quantity !== null && existing.quantity >= item.stock_quantity) {
          this.showToast('Cannot add more. Out of Stock.', 'warn');
          return;
        }
        existing.quantity++;
        existing.total = existing.quantity * existing.price;
      } else {
        this.cart.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          total: item.price,
          notes: ''
        });
      }
      this.calculateTotals();
    },

    removeFromCart(itemId) {
      this.cart = this.cart.filter(item => item.id !== itemId);
      this.calculateTotals();
    },

    updateQuantity(itemId, quantity) {
      const item = this.cart.find(i => i.id === itemId);
      if (item) {
        if (quantity <= 0) {
          this.removeFromCart(itemId);
        } else {
          item.quantity = quantity;
          item.total = quantity * item.price;
          this.calculateTotals();
        }
      }
    },

    clearCart() {
      if (this.cart.length > 0 && confirm('Are you sure you want to clear the cart?')) {
        this.cart = [];
        this.discountValue = 0;
        this.orderNotes = '';
        this.calculateTotals();
      }
    },

    // Calculate bill totals
    calculateTotals() {
      this.subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      if (this.discountType === 'percentage') {
        this.discountAmount = this.subtotal * (this.discountValue / 100);
      } else {
        this.discountAmount = this.discountValue;
      }

      const afterDiscount = Math.max(0, this.subtotal - this.discountAmount);
      const taxRate = parseFloat(this.appSettings.tax_rate) || 9; // Default to 9% if not set
      this.taxAmount = afterDiscount * (taxRate / 100);
      this.totalAmount = afterDiscount + this.taxAmount;

      // Ensure all values are valid numbers
      if (isNaN(this.taxAmount)) this.taxAmount = 0;
      if (isNaN(this.totalAmount)) this.totalAmount = 0;
    },

    // Formatting helpers
    formatCurrency(value) {
      const symbol = this.appSettings ? this.appSettings.currency_symbol : '₹';
      return `${symbol}${parseFloat(value).toFixed(2)}`;
    },

    // Format date
    formatDate(dateString) {
      if (!dateString) return '';
      try {
        const date = new Date(dateString);
        const day = date.getDate();
        const month = date.toLocaleString('default', { month: 'short' });
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      } catch (e) {
        console.error('Error formatting date:', e);
        return '';
      }
    },

    // Format time
    formatTime(dateString) {
      if (!dateString) return '';
      try {
        const date = new Date(dateString);
        return date.toLocaleString('default', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      } catch (e) {
        console.error('Error formatting time:', e);
        return '';
      }
    },

    // Format date time
    formatDateTime(dateString) {
      if (!dateString) return '';
      return this.formatDate(dateString) + ' ' + this.formatTime(dateString);
    },

    // PIN handling
    async login() {
      const pin = this.pinString;
      if (pin.length < 4) {
        this.loginError = 'Please enter complete PIN';
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/auth/verify-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });

        const result = await response.json();

        if (result.success) {
          localStorage.setItem('authToken', result.token); // Store token
          localStorage.setItem('user', JSON.stringify(result.user));
          this.isLoggedIn = true;
          this.pinString = '';
          this.loginError = '';
        } else {
          this.loginError = 'Invalid PIN. Use 1234';
          this.pinString = '';
          this.clearPinInputs();
        }
      } catch (error) {
        // Fallback for demo (offline mode maybe?)
        console.error('Login error', error);
        this.loginError = 'Connection failed. Try again.';
        this.clearPinInputs();
      }
    },

    // Unlock
    async unlock() {
      const pin = this.lockPinString;
      if (pin.length < 4) {
        this.lockError = 'Please enter complete PIN';
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/auth/verify-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });

        const result = await response.json();

        if (result.success) {
          // Refresh token if needed or just unlock
          localStorage.setItem('authToken', result.token);
          this.isLocked = false;
          this.lockPinString = '';
          this.lockError = '';
        } else {
          this.lockError = 'Invalid PIN';
          this.lockPinString = '';
          this.clearLockPinInputs();
        }
      } catch (error) {
        this.lockError = 'Connection failed';
        this.clearLockPinInputs();
      }
    },

    // Logout
    logout(force = false) {
      if (force || confirm('Are you sure you want to logout?')) {
        this.isLoggedIn = false;
        this.isLocked = false;
        this.currentUser = null;
        this.authToken = null;
        this.cart = [];
        this.pinString = '';
        this.lockPinString = '';
        this.username = '';
        this.availableUsers = [];
        this.loginError = '';
        this.lockError = '';
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');

        if (force) {
          this.showToast('Session expired. Please login again.', 'info');
        }
      }
    },

    // Clear PIN inputs
    clearPinInputs() {
      this.pinString = '';
      this.$nextTick(() => {
        this.$refs.loginPin?.focus();
      });
    },

    clearLockPinInputs() {
      this.lockPinString = '';
      this.$nextTick(() => {
        this.$refs.lockPin?.focus();
      });
    },

    // Auto-lock setup
    setupAutoLock() {
      let idleTime = 0;
      setInterval(() => {
        idleTime += 1000;
        if (idleTime >= 120000 && this.isLoggedIn) { // 2 minutes
          this.isLocked = true;
          idleTime = 0;
        }
      }, 1000);

      // Reset idle time on user activity
      document.addEventListener('mousemove', () => { if (this.isLoggedIn && !this.isLocked) idleTime = 0; });
      document.addEventListener('keypress', () => { if (this.isLoggedIn && !this.isLocked) idleTime = 0; });
      document.addEventListener('click', () => { if (this.isLoggedIn && !this.isLocked) idleTime = 0; });
    },

    // Checkout
    async checkout() {
      if (this.cart.length === 0) {
        alert('Cart is empty. Please add items first.');
        return;
      }

      try {
        const orderData = {
      order_number: await this.generateOrderNumber(),
      items: this.cart.map(item => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
        total_price: item.price * item.quantity,
        notes: item.notes || ''
      })),
      subtotal: this.subtotal,
      discount_amount: this.discountAmount,
      discount_type: this.discountType,
      tax_amount: this.taxAmount,
      total_amount: this.totalAmount,
      payment_mode: this.paymentMode,
      payment_status: 'unpaid',
      status: 'pending',
      notes: this.orderNotes,
      customer_id: this.selectedCustomer?.id
    };

    const response = await this.apiCall(`${API_BASE}/api/orders`, {
      method: 'POST',
      body: JSON.stringify(orderData)
    });

        const result = await response.json();

    if (result && result.id) {
      this.currentOrder = result;
      this.generateBillHtml(this.currentOrder);
      this.showBill = true;

          // Clear data after success
          this.cart = [];
          this.orderNotes = '';
          // (Optionally keep selected customer)
        } else {
          this.showToast('Failed to create order: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        console.error('Order placement error:', error);
        this.showToast('Failed to place order', 'error');
      }
    },

    // Helper to generate order number (placeholder)
    async generateOrderNumber() {
      // In a real app, this would come from the backend
      return `ORD-${Date.now().toString().slice(-6)}`;
    },

    // Helper to update order (placeholder)
    async updateOrder(order) {
      try {
        await fetch(`${API_BASE}/api/orders/${order.id}`, {
          method: 'PUT',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(order)
        });
      } catch (error) {
        console.error('Update order error:', error);
      }
    },

    // Customer Methods
    async searchCustomers() {
      if (this.customerSearchQuery.length < 2) {
        this.customerSearchResults = [];
        this.showCustomerResults = false;
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/customers/search?q=${this.customerSearchQuery}`);
        if (res.ok) {
          this.customerSearchResults = await res.json();
          this.showCustomerResults = true;
        }
      } catch (e) {
        console.error(e);
      }
    },

    async selectCustomer(cx) {
      // Add null safety check
      if (!cx) {
        console.warn('[DEBUG] selectCustomer called with null/undefined customer');
        this.selectedCustomer = null;
        this.customerSearchQuery = '';
        this.showCustomerResults = false;
        return;
      }

      this.selectedCustomer = cx;
      this.customerSearchQuery = cx.name ? `${cx.name} (${cx.phone})` : cx.phone;
      this.showCustomerResults = false;
    },

    async clearCustomer() {
      this.selectedCustomer = null;
      this.customerSearchQuery = '';
      this.showCustomerResults = false;
    },

    async createCustomer() {
      try {
        console.log('[DEBUG] Creating customer with data:', this.newCustomer);
        const res = await fetch(`${API_BASE}/api/customers`, {
          method: 'POST',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(this.newCustomer)
        });

        console.log('[DEBUG] Customer creation response status:', res.status);

        if (res.ok) {
          const cx = await res.json();
          console.log('[DEBUG] Customer creation response data:', cx);
          
          // Validate that we received a valid customer object
          if (cx && (cx.name || cx.phone)) {
            this.selectCustomer(cx);
            this.showAddCustomerForm = false;
            this.newCustomer = { name: '', phone: '' };
          } else {
            console.warn('[DEBUG] Invalid customer response:', cx);
            this.showToast('Failed to create customer: Invalid response', 'error');
          }
        } else {
          const responseText = await res.text();
          console.log('[DEBUG] Customer creation response text:', responseText);
          try {
            const err = JSON.parse(responseText);
            alert(err.error);
          } catch (parseError) {
            alert('Failed to add customer: ' + responseText);
          }
        }
      } catch (e) {
        console.error('[DEBUG] Error in createCustomer:', e);
        alert('Failed to add customer');
      }
    },

    // Process Payment (inferred method)
    async processPayment() {
      try {
        // Assuming currentOrder is set after checkout and before payment
        if (this.currentOrder.status === 'pending') {
          await this.updateOrder({ ...this.currentOrder, status: 'completed', payment_status: 'paid' });
        }

        this.cart = [];
        this.currentOrder = null;
        this.showBill = false;
        this.selectedCustomer = null;
        this.customerSearchQuery = '';
        this.loadOrders();
      } catch (error) {
        console.error('Process payment error:', error);
      }
    },

    // Send to Kitchen
    async sendToKitchen() {
      if (this.cart.length === 0) {
        alert('Cart is empty. Please add items first.');
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/kot`, {
          method: 'POST',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify({
            items: this.cart,
            subtotal: this.subtotal,
            discountAmount: this.discountAmount,
            discountType: this.discountType,
            taxAmount: this.taxAmount,
            totalAmount: this.totalAmount,
            notes: this.orderNotes
          })
        });

        const result = await response.json();
        alert(`Order ${result.orderNumber} sent to kitchen!`);

        // Clear cart
        this.cart = [];
        this.discountValue = 0;
        this.orderNotes = '';
        this.calculateTotals();

        // Refresh KOT tickets
        this.loadKOTTickets();
      } catch (error) {
        console.error('KOT error:', error);
        alert('Failed to send order to kitchen.');
      }
    },

    // Update KOT status
    async updateKOTStatus(ticketId, status) {
      try {
        await fetch(`${API_BASE}/api/kot/${ticketId}`, {
          method: 'PUT',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify({ status })
        });

        this.loadKOTTickets();
        this.loadOrders();
      } catch (error) {
        console.error('Update KOT status error:', error);
      }
    },

    // Generate bill HTML
    generateBillHtml(order) {
      const header = (this.appSettings.receipt_header || '').replace(/\n/g, '<br>');
      const footer = (this.appSettings.receipt_footer || '').replace(/\n/g, '<br>');
      const showLogo = this.appSettings.receipt_show_logo === 'true';
      const fontSize = this.appSettings.receipt_font_size || '12px';
      const taxRate = order.tax_rate || this.appSettings.tax_rate || 9;

      let itemsHtml = '';
      (order.items || []).forEach(item => {
        itemsHtml += `
          <div class="bill-item">
            <span class="bill-item-name">${item.quantity}x ${item.name}</span>
            <span class="bill-item-price">${this.formatCurrency(item.total_price)}</span>
          </div>
        `;
      });

      const itemNotes = (order.items || []).filter(item => item.notes).map(item =>
        `<div class="bill-item-note">  → ${item.notes}</div>`
      ).join('');

      const orderNotesHtml = order.notes ? `<div class="bill-order-notes"><strong>Note:</strong> ${order.notes}</div>` : '';

      // Ensure order has created_at timestamp
      if (!order.created_at) {
        order.created_at = new Date().toISOString();
      }

      this.billHtml = `
        <div class="bill-content" style="font-size: ${fontSize}">
          <div class="bill-header">
            ${showLogo ? '<div class="bill-logo">☕</div>' : ''}
            <h2>${this.appSettings.business_name}</h2>
            <div class="receipt-custom-header">${header}</div>
            ${this.appSettings.business_address ? `<p>${this.appSettings.business_address}</p>` : ''}
          </div>
          <hr class="bill-divider">
          <div class="bill-items">${itemsHtml}</div>
          ${itemNotes}
          ${orderNotesHtml}
          <hr class="bill-divider">
          <div class="bill-totals">
            <div class="bill-row"><span>Subtotal:</span><span>${this.formatCurrency(order.subtotal)}</span></div>
            <div class="bill-row"><span>Discount:</span><span>-${this.formatCurrency(order.discount_amount || 0)}</span></div>
            <div class="bill-row"><span>Tax (${taxRate}%):</span><span>${this.formatCurrency(order.tax_amount)}</span></div>
            <div class="bill-row bill-total-row"><span>Total:</span><span>${this.formatCurrency(order.total_amount)}</span></div>
          </div>
          <hr class="bill-divider">
          <div class="bill-footer">
            <p>Payment Mode: ${(order.payment_mode || 'cash').toUpperCase()}</p>
            <p>Order No: ${order.order_number}</p>
            <p>Date: ${this.formatDate(order.created_at)} Time: ${this.formatTime(order.created_at)}</p>
            <div class="receipt-custom-footer" style="margin-top: 12px;">${footer}</div>
          </div>
        </div>
      `;
    },

    // Update live preview of receipt
    updateReceiptPreview() {
      const dummyOrder = {
        order_number: 'ORD-PREVIEW',
        subtotal: 500,
        discount_amount: 50,
        tax_amount: 40.5,
        tax_rate: this.appSettings.tax_rate,
        total_amount: 490.5,
        payment_mode: 'cash',
        created_at: new Date().toISOString(),
        items: [
          { name: 'Sample Item 1', quantity: 2, total_price: 300 },
          { name: 'Sample Item 2', quantity: 1, total_price: 200 }
        ]
      };
      this.generateBillHtml(dummyOrder);
    },

    // Print bill
    printBill() {
      const printWindow = window.open('', '_blank');
      const billContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print Bill</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: 'Courier New', monospace; padding: 20px; font-size: 14px; }
              .bill-header { text-align: center; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #000; }
              .bill-header h2 { font-size: 20px; margin-bottom: 4px; }
              .bill-header p { font-size: 11px; color: #666; }
              .bill-divider { border: none; border-top: 1px dashed #000; margin: 8px 0; }
              .bill-item { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
              .bill-item-name { flex: 1; }
              .bill-item-qty { width: 40px; text-align: center; }
              .bill-item-price { width: 80px; text-align: right; }
              .bill-totals { margin-bottom: 16px; }
              .bill-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
              .bill-total-row { font-weight: 700; font-size: 16px; border-top: 2px solid #000; padding-top: 8px; margin-top: 8px; }
              .bill-footer { text-align: center; font-size: 11px; color: #666; }
            </style>
          </head>
          <body>${this.billHtml}</body>
        </html>
      `;
      printWindow.document.open();
      printWindow.document.write(billContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
    },

    // Show order details
    showOrderDetails(order) {
      this.selectedOrder = order;

      let itemsHtml = '';
      (order.items || []).forEach(item => {
        itemsHtml += `
          <div class="bill-item">
            <span class="bill-item-name">${item.quantity}x ${item.name}</span>
            <span class="bill-item-price">${this.formatCurrency(item.total_price)}</span>
          </div>
        `;
      });

      this.orderDetailsHtml = `
        <div class="order-header">
          <h2>${order.order_number}</h2>
          <p class="order-meta">${this.formatDateTime(order.created_at)}</p>
        </div>
        <div class="bill-items">${itemsHtml}</div>
        <hr class="bill-divider">
        <div class="bill-totals">
          <div class="bill-row"><span>Subtotal:</span><span>${this.formatCurrency(order.subtotal)}</span></div>
          <div class="bill-row"><span>Discount:</span><span>-${this.formatCurrency(order.discount_amount || 0)}</span></div>
          <div class="bill-row"><span>Tax (${order.tax_rate || 9}%):</span><span>${this.formatCurrency(order.tax_amount)}</span></div>
          <div class="bill-row bill-total-row"><span>Total:</span><span>${this.formatCurrency(order.total_amount)}</span></div>
          <div class="bill-row" style="margin-top: 8px;"><span>Payment Mode:</span><span>${(order.payment_mode || 'cash').toUpperCase()}</span></div>
          <div class="bill-row"><span>Payment Status:</span><span>${(order.payment_status || 'unpaid').toUpperCase()}</span></div>
        </div>
      `;

      this.showOrderDetailsModal = true;
    },

    // Reprint bill
    reprintBill() {
      if (this.selectedOrder) {
        this.generateBillHtml(this.selectedOrder);
        this.printBill();
      }
    },

    // Menu management
    showCategoryForm(category = null) {
      this.editingCategory = category;
      if (category) {
        this.categoryForm = { name: category.name, display_order: category.display_order, icon: category.icon };
      } else {
        this.categoryForm = { name: '', display_order: this.categories.length + 1, icon: '☕' };
      }
      this.showCategoryFormModal = true;
    },

    showItemForm(item = null) {
      this.editingItem = item;
      if (item) {
        this.itemForm = {
          id: item.id,
          name: item.name,
          category_id: item.category_id,
          price: item.price,
          description: item.description || '',
          is_available: item.is_available,
          stock_quantity: item.stock_quantity || 0
        };
      } else {
        this.itemForm = { name: '', category_id: this.categories[0]?.id || 1, price: 0, description: '', is_available: true, stock_quantity: 0 };
      }
      this.showItemFormModal = true;
    },

    async saveCategory() {
      try {
        const method = this.editingCategory ? 'PUT' : 'POST';
        const url = this.editingCategory
          ? `${API_BASE}/api/categories/${this.editingCategory.id}`
          : `${API_BASE}/api/categories`;

        await fetch(url, {
          method,
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(this.categoryForm)
        });

        this.showCategoryFormModal = false;
        this.loadMenuData();
      } catch (error) {
        console.error('Save category error:', error);
        // Fallback: update local state
        if (this.editingCategory) {
          const index = this.categories.findIndex(c => c.id === this.editingCategory.id);
          if (index !== -1) {
            this.categories[index] = { ...this.categories[index], ...this.categoryForm };
          }
        }
      }
    },

    // User Management Methods
    async loadUsers() {
      try {
        const response = await fetch(`${API_BASE}/api/users`, { headers: this.getAuthHeaders() });
        if (response.ok) {
          this.users = await response.json();
        }
      } catch (error) {
        console.error('Error loading users:', error);
      }
    },

    async loadRoles() {
      try {
        const response = await fetch(`${API_BASE}/api/roles`, { headers: this.getAuthHeaders() });
        if (response.ok) {
          this.roles = await response.json();
        }
      } catch (error) {
        console.error('Error loading roles:', error);
      }
    },

    showUserForm(user = null) {
      if (this.roles.length === 0) this.loadRoles(); // Ensure roles are loaded

      this.editingUser = user;
      if (user) {
        this.userForm = {
          username: user.username,
          pin: '', // Don't show existing PIN
          role_id: user.role_id,
          full_name: user.full_name || ''
        };
      } else {
        this.userForm = { username: '', pin: '', role_id: this.roles[0]?.id || 2, full_name: '' };
      }
      this.showUserFormModal = true;
    },

    async saveUser() {
      try {
        const method = this.editingUser ? 'PUT' : 'POST';
        const url = this.editingUser
          ? `${API_BASE}/api/users/${this.editingUser.id}`
          : `${API_BASE}/api/users`;

        const body = { ...this.userForm };
        if (this.editingUser && !body.pin) delete body.pin; // Don't send empty PIN on update if not changing

        const response = await fetch(url, {
          method,
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(body)
        });

        const result = await response.json();

        if (!response.ok) {
          alert(result.error || 'Failed to save user');
          return;
        }

        this.showUserFormModal = false;
        this.loadUsers();
      } catch (error) {
        console.error('Save user error:', error);
        alert('Error saving user');
      }
    },

    async deleteUser(id) {
      if (!confirm('Are you sure you want to delete this user?')) return;

      try {
        const response = await fetch(`${API_BASE}/api/users/${id}`, {
          method: 'DELETE',
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          this.loadUsers();
        } else {
          const res = await response.json();
          alert(res.error || 'Failed to delete user');
        }
      } catch (error) {
        console.error('Delete user error:', error);
      }
    },

    // --- Backup & Restore ---

    async downloadBackup() {
      try {
        const response = await fetch(`${API_BASE}/api/backup`, {
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `cafe-pos-backup-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          a.remove();
        } else {
          alert('Backup failed');
        }
      } catch (error) {
        console.error('Backup download error:', error);
        alert('Failed to download backup');
      }
    },

    async restoreBackup(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (!confirm('WARNING: Restoring will overwrite ALL current data? This cannot be undone.')) {
        event.target.value = ''; // Reset input
        return;
      }

      const formData = new FormData();
      formData.append('backup_file', file);

      try {
        const response = await fetch(`${API_BASE}/api/restore`, {
          method: 'POST',
          headers: {
            'Authorization': this.getAuthHeaders()['Authorization']
            // No Content-Type, browser sets it for FormData
          },
          body: formData
        });

        const result = await response.json();

        if (response.ok) {
          alert('Restore successful! The application will reload.');
          window.location.reload();
        } else {
          alert('Restore failed: ' + result.error);
        }
      } catch (error) {
        console.error('Restore error:', error);
        alert('Error during restore process');
      } finally {
        event.target.value = ''; // Reset
      }
    },

    // --- Reporting Methods ---

    setReportRange(type) {
      const today = new Date();
      const formatDate = (d) => d.toISOString().split('T')[0];

      if (type === 'today') {
        this.reportDateRange.start = formatDate(today);
        this.reportDateRange.end = formatDate(today);
      } else if (type === 'yesterday') {
        const yest = new Date(today);
        yest.setDate(yest.getDate() - 1);
        this.reportDateRange.start = formatDate(yest);
        this.reportDateRange.end = formatDate(yest);
      } else if (type === 'week') {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        this.reportDateRange.start = formatDate(weekAgo);
        this.reportDateRange.end = formatDate(today);
      } else if (type === 'month') {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        this.reportDateRange.start = formatDate(monthAgo);
        this.reportDateRange.end = formatDate(today);
      }

      this.generateReport();
    },

    async generateReport() {
      if (!this.reportDateRange.start || !this.reportDateRange.end) return;

      try {
        const headers = this.getAuthHeaders();
        const params = new URLSearchParams({
          start_date: this.reportDateRange.start,
          end_date: this.reportDateRange.end
        });

        // Fetch sales report
        const salesRes = await fetch(`${API_BASE}/api/reports/sales?${params}`, { headers });
        if (salesRes.ok) {
          const data = await salesRes.json();
          this.reportData.summary = data.summary;
          this.reportData.paymentBreakdown = data.paymentBreakdown;
        }

        // Fetch top items
        const topRes = await fetch(`${API_BASE}/api/reports/top-items?${params}`, { headers });
        if (topRes.ok) {
          this.reportData.topItems = await topRes.json();
        }

      } catch (error) {
        console.error('Error generating report:', error);
      }
    },

    async saveItem() {
      try {
        const method = this.editingItem ? 'PUT' : 'POST';
        const url = this.editingItem
          ? `${API_BASE}/api/menu-items/${this.editingItem.id}`
          : `${API_BASE}/api/menu-items`;

        await fetch(url, {
          method,
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(this.itemForm)
        });

        this.showItemFormModal = false;
        this.loadMenuData();
      } catch (error) {
        console.error('Save item error:', error);
        // Fallback: update local state
        if (this.editingItem) {
          const index = this.allItems.findIndex(i => i.id === this.editingItem.id);
          if (index !== -1) {
            const cat = this.categories.find(c => c.id === this.itemForm.category_id);
            this.allItems[index] = { ...this.allItems[index], ...this.itemForm, category_name: cat?.name };
          }
        } else {
          const cat = this.categories.find(c => c.id === this.itemForm.category_id);
          this.allItems.push({ id: Date.now(), ...this.itemForm, category_name: cat?.name, category_icon: cat?.icon });
        }
        this.showItemFormModal = false;
      }
    },

    async deleteCategory(id) {
      if (confirm('Are you sure you want to delete this category?')) {
        try {
          await fetch(`${API_BASE}/api/categories/${id}`, {
            method: 'DELETE',
            headers: await this.getAuthHeaders()
          });
          this.loadMenuData();
        } catch (error) {
          console.error('Delete category error:', error);
          this.categories = this.categories.filter(c => c.id !== id);
        }
      }
    },

    // --- Data Management (Export/Import) ---
    async exportData(type) {
      try {
        const response = await fetch(`${API_BASE}/api/export/${type}`, {
          headers: await this.getAuthHeaders()
        });

        if (!response.ok) throw new Error('Export failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (error) {
        console.error('Export error:', error);
        alert('Failed to export data: ' + error.message);
      }
    },

    async importData(event, type) {
      const file = event.target.files[0];
      if (!file) return;

      if (!confirm(`Importing ${file.name}. This may overwrite existing data. Continue?`)) {
        event.target.value = '';
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE}/api/import/${type}`, {
          method: 'POST',
          headers: {
            'Authorization': token ? `Bearer ${token}` : ''
            // Content-Type is set automatically by browser with boundary for FormData
          },
          body: formData
        });

        const result = await response.json();
        if (result.success) {
          alert(result.message);
          this.loadMenuData(); // Refresh data if menu import
        } else {
          alert('Import failed: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Import error:', error);
        alert('Failed to upload file.');
      } finally {
        event.target.value = ''; // Reset input
      }
    },

    async deleteItem(id) {
      if (confirm('Are you sure you want to delete this item?')) {
        try {
          await fetch(`${API_BASE}/api/menu-items/${id}`, { method: 'DELETE' });
          this.loadMenuData();
        } catch (error) {
          console.error('Delete item error:', error);
          this.allItems = this.allItems.filter(i => i.id !== id);
        }
      }
    },

    async toggleItemAvailability(id) {
      try {
        await fetch(`${API_BASE}/api/menu-items/${id}/toggle`, { method: 'PUT' });
        this.loadMenuData();
      } catch (error) {
        console.error('Toggle availability error:', error);
        const item = this.allItems.find(i => i.id === id);
        if (item) {
          item.is_available = !item.is_available;
        }
      }
    },

    // Seed sample data
    async seedSampleData() {
      try {
        const response = await fetch(`${API_BASE}/api/seed`, { method: 'POST' });
        const result = await response.json();

        if (result.success) {
          alert(`Sample data seeded successfully!\n${result.ordersCreated} orders created\n${result.kotTicketsCreated} KOT tickets created`);
          this.loadOrders();
          this.loadKOTTickets();
        } else {
          alert('Error: ' + result.error);
        }
      } catch (error) {
        console.error('Seed data error:', error);
        alert('Failed to seed sample data.');
      }
    },

    // Item Details Modal Methods
    async showItemDetails(item) {
      this.selectedItem = item;
      this.itemWeight = 0;
      this.itemModifiers = [];
      this.selectedModifiers = [];
      this.comboComponents = [];
      this.selectedComboOptions = {};
      this.itemQuantity = 1;
      this.itemNotes = '';
      this.itemPrice = item.price;

      // Load modifiers if item has modifiers
      if (item.has_modifiers) {
        await this.loadItemModifiers(item.id);
      }

      // Load combo components if item is a combo
      if (item.is_combo) {
        await this.loadComboComponents(item.id);
      }

      this.showItemDetailsModal = true;
    },

    async loadItemModifiers(itemId) {
      try {
        const response = await fetch(`${API_BASE}/api/modifiers/item/${itemId}`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.itemModifiers = await response.json();
        }
      } catch (error) {
        console.error('Error loading item modifiers:', error);
        this.itemModifiers = [];
      }
    },

    async loadComboComponents(itemId) {
      try {
        const response = await fetch(`${API_BASE}/api/combo-components/item/${itemId}`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.comboComponents = await response.json();
          // Initialize selected options with first option of each component
          this.comboComponents.forEach(component => {
            if (component.options && component.options.length > 0) {
              this.selectedComboOptions[component.id] = component.options[0].id;
            }
          });
        }
      } catch (error) {
        console.error('Error loading combo components:', error);
        this.comboComponents = [];
      }
    },

    toggleModifier(modifierId, _price) {
      const index = this.selectedModifiers.indexOf(modifierId);
      if (index > -1) {
        this.selectedModifiers.splice(index, 1);
      } else {
        this.selectedModifiers.push(modifierId);
      }
    },

    selectComboOption(componentId, optionId) {
      this.selectedComboOptions[componentId] = optionId;
    },

    async addToCartWithDetails() {
      const itemData = {
        id: this.selectedItem.id,
        name: this.selectedItem.name,
        price: this.finalItemPrice / this.itemQuantity, // Base price per unit
        quantity: this.itemQuantity,
        total: this.finalItemPrice,
        notes: this.itemNotes,
        modifiers: this.selectedModifiers.map(modId => {
          const modifier = this.itemModifiers.find(m => m.options.some(o => o.id === modId));
          const option = modifier.options.find(o => o.id === modId);
          return { id: modId, name: option.name, price: option.price };
        }),
        comboOptions: this.selectedComboOptions
      };

      // Check stock for weighted items
      if (this.selectedItem.is_weighted && this.selectedItem.stock_quantity !== null) {
        const requiredStock = this.itemWeight;
        if (requiredStock > this.selectedItem.stock_quantity) {
          this.showToast('Insufficient stock for this weight', 'error');
          return;
        }
      }

      // Check stock for regular items
      if (!this.selectedItem.is_weighted && this.selectedItem.stock_quantity !== null) {
        if (this.itemQuantity > this.selectedItem.stock_quantity) {
          this.showToast('Insufficient stock', 'error');
          return;
        }
      }

      this.cart.push(itemData);
      this.calculateTotals();
      this.showItemDetailsModal = false;
      this.showToast(`${this.itemQuantity}x ${this.selectedItem.name} added to cart`, 'success');
    },

    // =================== MVP METHODS ===================

    // User Management Methods
    async loadUsers() {
      try {
        const response = await fetch(`${API_BASE}/api/users`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.users = await response.json();
        }
      } catch (error) {
        console.error('Error loading users:', error);
      }
    },

    async loadRoles() {
      try {
        const response = await fetch(`${API_BASE}/api/roles`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.roles = await response.json();
        }
      } catch (error) {
        console.error('Error loading roles:', error);
      }
    },

    showUserForm(user = null) {
      this.editingUser = user;
      if (user) {
        this.userForm = {
          username: user.username,
          pin: '',
          password: '',
          role_id: user.role_id,
          full_name: user.full_name,
          permissions: user.permissions || []
        };
      } else {
        this.userForm = {
          username: '',
          pin: '',
          password: '',
          role_id: this.roles[0]?.id || 1,
          full_name: '',
          permissions: []
        };
      }
    },

    async saveUser() {
      try {
        const method = this.editingUser ? 'PUT' : 'POST';
        const url = this.editingUser
          ? `${API_BASE}/api/users/${this.editingUser.id}`
          : `${API_BASE}/api/users`;

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(await this.getAuthHeaders())
          },
          body: JSON.stringify(this.userForm)
        });

        if (response.ok) {
          await this.loadUsers();
          this.editingUser = null;
          alert(this.editingUser ? 'User updated successfully' : 'User created successfully');
        } else {
          const error = await response.json();
          alert('Error: ' + error.error);
        }
      } catch (error) {
        console.error('Error saving user:', error);
        alert('Failed to save user');
      }
    },

    async deleteUser(userId) {
      if (!confirm('Are you sure you want to delete this user?')) return;

      try {
        const response = await fetch(`${API_BASE}/api/users/${userId}`, {
          method: 'DELETE',
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          await this.loadUsers();
          alert('User deleted successfully');
        } else {
          const error = await response.json();
          alert('Error: ' + error.error);
        }
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user');
      }
    },

    // Customer Management Methods
    async loadCustomers() {
      try {
        const response = await fetch(`${API_BASE}/api/customers`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.customers = await response.json();
        }
      } catch (error) {
        console.error('Error loading customers:', error);
      }
    },

    async searchCustomers(query) {
      if (!query) {
        this.customerSearchResults = [];
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/customers/search?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          this.customerSearchResults = await response.json();
        }
      } catch (error) {
        console.error('Error searching customers:', error);
      }
    },

    async saveCustomer() {
      try {
        const method = this.selectedCustomer ? 'PUT' : 'POST';
        const url = this.selectedCustomer
          ? `${API_BASE}/api/customers/${this.selectedCustomer.id}`
          : `${API_BASE}/api/customers`;

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(await this.getAuthHeaders())
          },
          body: JSON.stringify(this.customerForm)
        });

        if (response.ok) {
          await this.loadCustomers();
          this.selectedCustomer = null;
          this.customerForm = { name: '', phone: '', email: '', notes: '' };
          alert('Customer saved successfully');
        } else {
          const error = await response.json();
          alert('Error: ' + error.error);
        }
      } catch (error) {
        console.error('Error saving customer:', error);
        alert('Failed to save customer');
      }
    },

    // Inventory Management Methods
    async loadLowStockItems() {
      try {
        const response = await fetch(`${API_BASE}/api/inventory/low-stock`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.lowStockItems = await response.json();
        }
      } catch (error) {
        console.error('Error loading low stock items:', error);
      }
    },

    async adjustStock(itemId) {
      try {
        const response = await fetch(`${API_BASE}/api/menu-items/${itemId}/adjust-stock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await this.getAuthHeaders())
          },
          body: JSON.stringify(this.stockAdjustment)
        });

        if (response.ok) {
          await this.loadLowStockItems();
          await this.loadMenuData(); // Refresh menu items
          this.stockAdjustment = { quantity: 0, reason: '' };
          alert('Stock adjusted successfully');
        } else {
          const error = await response.json();
          alert('Error: ' + error.error);
        }
      } catch (error) {
        console.error('Error adjusting stock:', error);
        alert('Failed to adjust stock');
      }
    },

    async loadInventoryHistory(itemId) {
      try {
        const response = await fetch(`${API_BASE}/api/inventory/history/${itemId}`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.inventoryHistory = await response.json();
        }
      } catch (error) {
        console.error('Error loading inventory history:', error);
      }
    },

    // Reporting Methods
    async generateReport() {
      if (!this.reportStartDate || !this.reportEndDate) {
        alert('Please select start and end dates');
        return;
      }

      this.reportLoading = true;
      try {
        let endpoint = '';
        switch (this.reportType) {
          case 'daily':
            endpoint = `/api/reports/daily-summary?date=${this.reportStartDate}`;
            break;
          case 'sales':
            endpoint = `/api/reports/sales?start_date=${this.reportStartDate}&end_date=${this.reportEndDate}`;
            break;
          case 'top-items':
            endpoint = `/api/reports/top-items?start_date=${this.reportStartDate}&end_date=${this.reportEndDate}&limit=10`;
            break;
          case 'tax':
            endpoint = `/api/reports/tax?start_date=${this.reportStartDate}&end_date=${this.reportEndDate}`;
            break;
          case 'payment':
            endpoint = `/api/reports/payment-breakdown?start_date=${this.reportStartDate}&end_date=${this.reportEndDate}`;
            break;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          this.reportData = await response.json();
        } else {
          alert('Failed to generate report');
        }
      } catch (error) {
        console.error('Error generating report:', error);
        alert('Failed to generate report');
      } finally {
        this.reportLoading = false;
      }
    },

    async exportReport(type) {
      try {
        const response = await fetch(`${API_BASE}/api/reports/export/${type}?start_date=${this.reportStartDate}&end_date=${this.reportEndDate}`, {
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${type}-report-${this.reportStartDate}-to-${this.reportEndDate}.csv`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          alert('Failed to export report');
        }
      } catch (error) {
        console.error('Error exporting report:', error);
        alert('Failed to export report');
      }
    },

    // Backup Methods
    async downloadBackup() {
      try {
        const response = await fetch(`${API_BASE}/api/backup`, {
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `cafe-pos-backup-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          alert('Backup downloaded successfully');
        } else {
          alert('Failed to create backup');
        }
      } catch (error) {
        console.error('Error downloading backup:', error);
        alert('Failed to download backup');
      }
    },

    async restoreBackup(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (!confirm('This will replace all current data. Are you sure?')) {
        event.target.value = '';
        return;
      }

      try {
        const text = await file.text();
        const backupData = JSON.parse(text);

        const response = await fetch(`${API_BASE}/api/restore`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await this.getAuthHeaders())
          },
          body: JSON.stringify(backupData)
        });

        if (response.ok) {
          alert('Backup restored successfully. Please refresh the page.');
          location.reload();
        } else {
          const error = await response.json();
          alert('Error: ' + error.error);
        }
      } catch (error) {
        console.error('Error restoring backup:', error);
        alert('Failed to restore backup. Please check the file format.');
      } finally {
        event.target.value = '';
      }
    },

    // Table Management Methods
    async loadTables() {
      try {
        const response = await fetch(`${API_BASE}/api/tables`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.tables = await response.json();
        }
      } catch (error) {
        console.error('Error loading tables:', error);
        this.showToast('Failed to load tables', 'error');
      }
    },

    showTableForm(table = null) {
      this.editingTable = table;
      if (table) {
        this.tableForm = { table_number: table.table_number, name: table.name, status: table.status };
      } else {
        this.tableForm = { table_number: '', name: '', status: 'available' };
      }
      this.showTableFormModal = true;
    },

    async saveTable() {
      try {
        const method = this.editingTable ? 'PUT' : 'POST';
        const url = this.editingTable
          ? `${API_BASE}/api/tables/${this.editingTable.id}`
          : `${API_BASE}/api/tables`;

        const response = await fetch(url, {
          method,
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(this.tableForm)
        });

        if (response.ok) {
          await this.loadTables();
          this.showTableFormModal = false;
          this.editingTable = null;
          this.showToast('Table saved successfully', 'success');
        } else {
          const error = await response.json();
          this.showToast('Error: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Error saving table:', error);
        this.showToast('Failed to save table', 'error');
      }
    },

    async deleteTable(id) {
      if (!confirm('Are you sure you want to delete this table?')) return;

      try {
        const response = await fetch(`${API_BASE}/api/tables/${id}`, {
          method: 'DELETE',
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          await this.loadTables();
          this.showToast('Table deleted successfully', 'success');
        } else {
          const error = await response.json();
          this.showToast('Error: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Error deleting table:', error);
        this.showToast('Failed to delete table', 'error');
      }
    },

    async assignTableToOrder(table) {
      if (this.cart.length === 0) {
        this.showToast('Add items to cart first', 'warn');
        return;
      }

      try {
        // Create order with table assignment
        const orderData = {
          orderNumber: await this.generateOrderNumber(),
          subtotal: this.subtotal,
          discountAmount: this.discountAmount,
          discountType: this.discountType,
          taxAmount: this.taxAmount,
          totalAmount: this.totalAmount,
          paymentMode: this.paymentMode,
          paymentStatus: 'unpaid',
          status: 'pending',
          notes: this.orderNotes,
          tableId: table.id,
          customerId: this.selectedCustomer?.id
        };

        const response = await fetch(`${API_BASE}/api/orders`, {
          method: 'POST',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.success) {
          // Add items
          for (const item of this.cart) {
            await fetch(`${API_BASE}/api/orders/${result.id}/items`, {
              method: 'POST',
              headers: await this.getAuthHeaders(),
              body: JSON.stringify({
                menuItemId: item.id,
                quantity: item.quantity,
                unitPrice: item.price,
                totalPrice: item.price * item.quantity,
                notes: item.notes
              })
            });
          }

          // Update table status
          await fetch(`${API_BASE}/api/tables/${table.id}`, {
            method: 'PUT',
            headers: await this.getAuthHeaders(),
            body: JSON.stringify({ status: 'occupied' })
          });

          this.showToast(`Order assigned to Table ${table.table_number}`, 'success');
          this.clearCart();
          await this.loadTables();
        } else {
          this.showToast('Failed to assign table: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        console.error('Table assignment error:', error);
        this.showToast('Failed to assign table', 'error');
      }
    },

    async transferOrder(_table) {
      // Implementation for transferring existing orders between tables
      this.showToast('Transfer functionality coming soon', 'info');
    },

    async clearTable(table) {
      if (!confirm(`Clear table ${table.table_number}? This will remove any pending orders.`)) return;

      try {
        // Clear any pending orders for this table
        await fetch(`${API_BASE}/api/tables/${table.id}/clear`, {
          method: 'POST',
          headers: await this.getAuthHeaders()
        });

        // Update table status
        await fetch(`${API_BASE}/api/tables/${table.id}`, {
          method: 'PUT',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify({ status: 'available' })
        });

        this.showToast(`Table ${table.table_number} cleared`, 'success');
        await this.loadTables();
      } catch (error) {
        console.error('Clear table error:', error);
        this.showToast('Failed to clear table', 'error');
      }
    },

    // KDS Management Methods
    async loadStations() {
      try {
        const response = await fetch(`${API_BASE}/api/kds/stations`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.stations = await response.json();
        }
      } catch (error) {
        console.error('Error loading stations:', error);
        this.showToast('Failed to load KDS stations', 'error');
      }
    },

    showStationForm(station = null) {
      this.editingStation = station;
      if (station) {
        this.stationForm = { name: station.name, description: station.description, is_active: station.is_active };
      } else {
        this.stationForm = { name: '', description: '', is_active: true };
      }
      this.showStationFormModal = true;
    },

    async saveStation() {
      try {
        const method = this.editingStation ? 'PUT' : 'POST';
        const url = this.editingStation
          ? `${API_BASE}/api/kds/stations/${this.editingStation.id}`
          : `${API_BASE}/api/kds/stations`;

        const response = await fetch(url, {
          method,
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(this.stationForm)
        });

        if (response.ok) {
          await this.loadStations();
          this.showStationFormModal = false;
          this.editingStation = null;
          this.showToast('Station saved successfully', 'success');
        } else {
          const error = await response.json();
          this.showToast('Error: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Error saving station:', error);
        this.showToast('Failed to save station', 'error');
      }
    },

    async deleteStation(id) {
      if (!confirm('Are you sure you want to delete this station?')) return;

      try {
        const response = await fetch(`${API_BASE}/api/kds/stations/${id}`, {
          method: 'DELETE',
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          await this.loadStations();
          this.showToast('Station deleted successfully', 'success');
        } else {
          const error = await response.json();
          this.showToast('Error: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Error deleting station:', error);
        this.showToast('Failed to delete station', 'error');
      }
    },

    async refreshKDS() {
      await this.loadKOTTickets();
      await this.loadStations();
    },

    // Split Billing Methods
    addSplitCustomer() {
      const newCustomer = {
        id: Date.now(),
        number: this.splitCustomers.length + 1,
        items: [],
        amount: 0
      };
      this.splitCustomers.push(newCustomer);
    },

    removeSplitCustomer(customerId) {
      if (this.splitCustomers.length > 1) {
        this.splitCustomers = this.splitCustomers.filter(c => c.id !== customerId);
      }
    },

    toggleSplitItem(customerId, itemId) {
      const customer = this.splitCustomers.find(c => c.id === customerId);
      if (customer) {
        const index = customer.items.indexOf(itemId);
        if (index > -1) {
          customer.items.splice(index, 1);
        } else {
          customer.items.push(itemId);
        }
      }
    },

    getCustomerSplitTotal(customerId) {
      const customer = this.splitCustomers.find(c => c.id === customerId);
      if (!customer) return 0;

      if (this.splitMethod === 'items') {
        return this.cart
          .filter(item => customer.items.includes(item.id))
          .reduce((sum, item) => sum + item.total, 0);
      } else if (this.splitMethod === 'amount') {
        return customer.amount;
      }
      return 0;
    },

    async processSplitBilling() {
      if (this.cart.length === 0) {
        this.showToast('Cart is empty', 'warn');
        return;
      }

      try {
        let splitData = {};

        if (this.splitMethod === 'items') {
          // Validate all items are assigned
          const allItemsAssigned = this.cart.every(item =>
            this.splitCustomers.some(customer => customer.items.includes(item.id))
          );

          if (!allItemsAssigned) {
            this.showToast('Please assign all items to customers', 'warn');
            return;
          }

          splitData = {
            method: 'items',
            customers: this.splitCustomers.map(c => ({
              number: c.number,
              items: c.items,
              total: this.getCustomerSplitTotal(c.id)
            }))
          };
        } else if (this.splitMethod === 'amount') {
          const totalAmount = this.splitCustomers.reduce((sum, c) => sum + c.amount, 0);
          if (Math.abs(totalAmount - this.totalAmount) > 0.01) {
            this.showToast('Amounts must sum to total bill', 'warn');
            return;
          }

          splitData = {
            method: 'amount',
            customers: this.splitCustomers.map(c => ({
              number: c.number,
              amount: c.amount
            }))
          };
        } else if (this.splitMethod === 'equal') {
          const amountPerCustomer = this.totalAmount / this.equalSplitCount;
          splitData = {
            method: 'equal',
            count: this.equalSplitCount,
            amountPerCustomer: amountPerCustomer
          };
        }

        // Process split billing
        const response = await fetch(`${API_BASE}/api/split-billing`, {
          method: 'POST',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify({
            orderId: this.currentOrder?.id,
            splitData: splitData,
            cart: this.cart,
            subtotal: this.subtotal,
            discountAmount: this.discountAmount,
            taxAmount: this.taxAmount,
            totalAmount: this.totalAmount
          })
        });

        const result = await response.json();

        if (result.success) {
          this.showToast('Split billing processed successfully', 'success');
          this.showSplitBilling = false;
          this.clearCart();
        } else {
          this.showToast('Error: ' + result.error, 'error');
        }
      } catch (error) {
        console.error('Split billing error:', error);
        this.showToast('Failed to process split billing', 'error');
      }
    },

    // Cash Drawer Management Methods
    async loadCashDrawerSession() {
      try {
        const response = await fetch(`${API_BASE}/api/cash-drawer/session`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.cashDrawerSession = await response.json();
        }
      } catch (error) {
        console.error('Error loading cash drawer session:', error);
      }
    },

    async loadCashDrawerHistory() {
      try {
        const response = await fetch(`${API_BASE}/api/cash-drawer/history`, {
          headers: await this.getAuthHeaders()
        });
        if (response.ok) {
          this.cashDrawerHistory = await response.json();
        }
      } catch (error) {
        console.error('Error loading cash drawer history:', error);
      }
    },

    async startCashDrawerSession() {
      try {
        const response = await fetch(`${API_BASE}/api/cash-drawer/start`, {
          method: 'POST',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify({ floatAmount: 1000 })
        });

        const result = await response.json();

        if (result.success) {
          await this.loadCashDrawerSession();
          this.showToast('Cash drawer session started', 'success');
        } else {
          this.showToast('Error: ' + result.error, 'error');
        }
      } catch (error) {
        console.error('Start cash drawer error:', error);
        this.showToast('Failed to start cash drawer session', 'error');
      }
    },

    async endCashDrawerSession() {
      try {
        const response = await fetch(`${API_BASE}/api/cash-drawer/end`, {
          method: 'POST',
          headers: await this.getAuthHeaders()
        });

        const result = await response.json();

        if (result.success) {
          await this.loadCashDrawerSession();
          await this.loadCashDrawerHistory();
          this.showToast('Cash drawer session ended', 'success');
        } else {
          this.showToast('Error: ' + result.error, 'error');
        }
      } catch (error) {
        console.error('End cash drawer error:', error);
        this.showToast('Failed to end cash drawer session', 'error');
      }
    },

    async reconcileCashDrawer() {
      try {
        const response = await fetch(`${API_BASE}/api/cash-drawer/reconcile`, {
          method: 'POST',
          headers: await this.getAuthHeaders()
        });

        const result = await response.json();

        if (result.success) {
          this.showToast('Cash drawer reconciled successfully', 'success');
        } else {
          this.showToast('Reconciliation needed: ' + result.message, 'warn');
        }
      } catch (error) {
        console.error('Reconcile cash drawer error:', error);
        this.showToast('Failed to reconcile cash drawer', 'error');
      }
    },

    // Void/Refund Methods
    async processVoidRefund() {
      if (!this.voidRefundOrderNumber || !this.voidRefundReason || !this.managerPin) {
        this.showToast('Please fill all required fields', 'warn');
        return;
      }

      if (this.voidRefundReason === 'other' && !this.voidRefundOtherReason) {
        this.showToast('Please specify other reason', 'warn');
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/void-refund`, {
          method: 'POST',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify({
            orderNumber: this.voidRefundOrderNumber,
            reason: this.voidRefundReason === 'other' ? this.voidRefundOtherReason : this.voidRefundReason,
            managerPin: this.managerPin,
            amount: this.voidRefundAmount || this.totalAmount
          })
        });

        const result = await response.json();

        if (result.success) {
          this.showToast('Void/Refund processed successfully', 'success');
          this.showVoidRefund = false;
          this.clearFormFields();
        } else {
          this.showToast('Error: ' + result.error, 'error');
        }
      } catch (error) {
        console.error('Void/Refund error:', error);
        this.showToast('Failed to process void/refund', 'error');
      }
    },

    clearFormFields() {
      this.voidRefundOrderNumber = '';
      this.voidRefundReason = '';
      this.voidRefundOtherReason = '';
      this.managerPin = '';
      this.voidRefundAmount = 0;
    },

    // Utility Methods
    hasPermission(permission) {
      if (!this.currentUser) return false;
      return this.currentUser.role === 'admin' ||
        (this.currentUser.permissions && this.currentUser.permissions.includes(permission)) ||
        (this.currentUser.permissions && this.currentUser.permissions.includes('manage_all'));
    },

    formatDateTime(dateString) {
      if (!dateString) return '';
      return new Date(dateString).toLocaleString();
    },

    formatNumber(number) {
      return new Intl.NumberFormat().format(number);
    },

    // =================== ENHANCED INVENTORY MANAGEMENT ===================

    // Inventory Management State
    inventoryTab: 'overview',
    inventorySearch: '',
    inventoryCategoryFilter: '',
    inventoryStatusFilter: '',
    inventoryCategories: [],
    inventorySuppliers: [],
    inventoryForm: {
      name: '',
      category_id: '',
      stock_quantity: 0,
      low_stock_threshold: 5,
      cost_price: 0,
      selling_price: 0,
      unit: 'piece',
      supplier_id: '',
      description: ''
    },
    inventoryStats: {
      totalItems: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      totalValue: 0
    },
    selectedInventoryItem: null,
    stockAdjustment: {
      type: 'add',
      quantity: 0,
      reason: ''
    },
    importFileName: '',
    importOptions: {
      updateExisting: false,
      validateOnly: false
    },
    importPreview: [],
    importResults: { summary: { created: 0, updated: 0, errors: 0 }, errors: [] },
    showCategoryFormModal: false,
    showSupplierFormModal: false,
    showStockAdjustmentModal: false,
    editingCategory: null,
    editingSupplier: null,
    categoryForm: { name: '', description: '' },
    supplierForm: {
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      address: '',
      notes: ''
    },

    // Computed: Filtered inventory items
    get filteredInventoryItems() {
      // Defensive check to prevent errors
      if (!Array.isArray(this.allItems)) {
        return [];
      }

      return this.allItems.filter(item => {
        // Filter by search
        if (this.inventorySearch) {
          const query = this.inventorySearch.toLowerCase();
          if (!item.name.toLowerCase().includes(query) &&
            !item.category_name?.toLowerCase().includes(query)) {
            return false;
          }
        }

        // Filter by category
        if (this.inventoryCategoryFilter && item.category_id != this.inventoryCategoryFilter) {
          return false;
        }

        // Filter by status
        if (this.inventoryStatusFilter) {
          const hasStock = item.stock_quantity > 0;
          const isLowStock = item.stock_quantity <= (item.low_stock_threshold || 0);

          switch (this.inventoryStatusFilter) {
            case 'in-stock':
              return hasStock && !isLowStock;
            case 'low-stock':
              return isLowStock && hasStock;
            case 'out-of-stock':
              return !hasStock;
          }
        }

        return true;
      });
    },

    // Load inventory data
    async loadInventoryData() {
      try {
        // Load categories (use existing categories endpoint)
        const categoriesRes = await fetch(`${API_BASE}/api/categories`, {
          headers: await this.getAuthHeaders()
        });
        if (categoriesRes.ok) {
          this.inventoryCategories = await categoriesRes.json();
        }

        // Load suppliers (if available)
        try {
          const suppliersRes = await fetch(`${API_BASE}/api/suppliers`, {
            headers: await this.getAuthHeaders()
          });
          if (suppliersRes.ok) {
            this.inventorySuppliers = await suppliersRes.json();
          }
        } catch (error) {
          console.log('Suppliers endpoint not available, continuing without suppliers');
          this.inventorySuppliers = [];
        }

        // Load low stock items
        await this.loadLowStockItems();

        // Calculate stats
        await this.calculateInventoryStats();
      } catch (error) {
        console.error('Error loading inventory data:', error);
        this.showToast('Failed to load inventory data', 'error');
      }
    },

    // Calculate inventory statistics
    async calculateInventoryStats() {
      try {
        // Try to get stats from API first
        const response = await fetch(`${API_BASE}/api/inventory/stats`, {
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          this.inventoryStats = await response.json();
        } else {
          // Fallback calculation using menu items
          const items = this.allItems.filter(item => item.stock_quantity !== null);
          this.inventoryStats.totalItems = items.length;
          this.inventoryStats.lowStockCount = items.filter(item =>
            item.stock_quantity <= (item.low_stock_threshold || 0)
          ).length;
          this.inventoryStats.outOfStockCount = items.filter(item =>
            item.stock_quantity === 0
          ).length;
          this.inventoryStats.totalValue = items.reduce((sum, item) =>
            sum + (item.price || 0) * (item.stock_quantity || 0), 0
          );
        }
      } catch (error) {
        console.error('Error calculating inventory stats:', error);
        // Fallback calculation using menu items
        const items = this.allItems.filter(item => item.stock_quantity !== null);
        this.inventoryStats.totalItems = items.length;
        this.inventoryStats.lowStockCount = items.filter(item =>
          item.stock_quantity <= (item.low_stock_threshold || 0)
        ).length;
        this.inventoryStats.outOfStockCount = items.filter(item =>
          item.stock_quantity === 0
        ).length;
        this.inventoryStats.totalValue = items.reduce((sum, item) =>
          sum + (item.price || 0) * (item.stock_quantity || 0), 0
        );
      }
    },

    // Save inventory item
    async saveInventoryItem() {
      try {
        const method = this.editingInventoryItem ? 'PUT' : 'POST';
        const url = this.editingInventoryItem
          ? `${API_BASE}/api/menu-items/${this.editingInventoryItem.id}`
          : `${API_BASE}/api/menu-items`;

        // Prepare form data, converting empty supplier_id to null and mapping to menu item fields
        const formData = {
          category_id: this.inventoryForm.category_id,
          name: this.inventoryForm.name,
          price: this.inventoryForm.selling_price || 0,
          description: this.inventoryForm.description,
          is_available: 1,
          stock_quantity: this.inventoryForm.stock_quantity,
          low_stock_threshold: this.inventoryForm.low_stock_threshold
        };

        const response = await fetch(url, {
          method,
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(formData)
        });

        if (response.ok) {
          await this.loadInventoryData();
          await this.loadMenuData(); // Refresh menu items
          this.resetInventoryForm();
          this.showToast('Inventory item saved successfully', 'success');
        } else {
          const error = await response.json();
          this.showToast('Error: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Error saving inventory item:', error);
        this.showToast('Failed to save inventory item', 'error');
      }
    },

    // Initialize stock quantities for all menu items
    async initializeStockQuantities() {
      try {
        const response = await fetch(`${API_BASE}/api/initialize-stock`, {
          method: 'POST',
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          const result = await response.json();
          await this.loadMenuData(); // Refresh menu items
          await this.loadInventoryData(); // Refresh inventory data
          this.showToast(result.message, 'success');
        } else {
          const error = await response.json();
          this.showToast('Error: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Error initializing stock quantities:', error);
        this.showToast('Failed to initialize stock quantities', 'error');
      }
    },

    // Edit inventory item
    editInventoryItem(item) {
      this.editingInventoryItem = item;
      this.inventoryForm = {
        name: item.name,
        category_id: item.category_id,
        stock_quantity: item.stock_quantity || 0,
        low_stock_threshold: item.low_stock_threshold || 5,
        cost_price: item.cost_price || 0,
        selling_price: item.price || 0, // Use price field from menu_items
        unit: item.unit || 'piece',
        supplier_id: item.supplier_id || '',
        description: item.description || ''
      };
      this.inventoryTab = 'add-item';
    },

    // Delete inventory item
    async deleteInventoryItem(itemId) {
      if (!confirm('Are you sure you want to delete this inventory item?')) return;

      try {
        const response = await fetch(`${API_BASE}/api/menu-items/${itemId}`, {
          method: 'DELETE',
          headers: await this.getAuthHeaders()
        });

        if (response.ok) {
          await this.loadInventoryData();
          await this.loadMenuData();
          this.showToast('Inventory item deleted successfully', 'success');
        } else {
          const error = await response.json();
          this.showToast('Error: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Error deleting inventory item:', error);
        this.showToast('Failed to delete inventory item', 'error');
      }
    },

    // Reset inventory form
    resetInventoryForm() {
      this.editingInventoryItem = null;
      this.inventoryForm = {
        name: '',
        category_id: '',
        stock_quantity: 0,
        low_stock_threshold: 5,
        cost_price: 0,
        selling_price: 0,
        unit: 'piece',
        supplier_id: '',
        description: ''
      };
    },

    // Stock adjustment modal
    adjustStockModal(item) {
      this.selectedInventoryItem = item;
      this.stockAdjustment = {
        type: 'add',
        quantity: 0,
        reason: ''
      };
      this.showStockAdjustmentModal = true;
    },

    // Save stock adjustment
    async saveStockAdjustment() {
      if (!this.stockAdjustment.reason || this.stockAdjustment.quantity <= 0) {
        this.showToast('Please provide reason and valid quantity', 'error');
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/menu-items/${this.selectedInventoryItem.id}/adjust-stock`, {
          method: 'POST',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(this.stockAdjustment)
        });

        if (response.ok) {
          await this.loadInventoryData();
          await this.loadMenuData();
          this.showStockAdjustmentModal = false;
          this.showToast('Stock adjusted successfully', 'success');
        } else {
          const error = await response.json();
          this.showToast('Error: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Error adjusting stock:', error);
        this.showToast('Failed to adjust stock', 'error');
      }
    },

    // Reorder item
    async reorderItem(item) {
      const reorderQuantity = Math.max(10, (item.low_stock_threshold || 5) * 2);
      this.selectedInventoryItem = item;
      this.stockAdjustment = {
        type: 'add',
        quantity: reorderQuantity,
        reason: 'Reorder: ' + item.name
      };
      this.showStockAdjustmentModal = true;
    },

    // Category management
    showCategoryForm(category = null) {
      this.editingCategory = category;
      if (category) {
        this.categoryForm = { name: category.name, description: category.description };
      } else {
        this.categoryForm = { name: '', description: '' };
      }
      this.showCategoryFormModal = true;
    },

    async saveCategory() {
      this.showToast('Category management is handled through menu categories', 'info');
      this.showCategoryFormModal = false;
      this.editingCategory = null;
    },

    async deleteCategory(categoryId) {
      if (!confirm('Are you sure you want to delete this category?')) return;

      try {
        const response = await fetch(`${API_BASE}/api/inventory/categories/${categoryId}`, {
          method: 'DELETE',
          headers: this.getAuthHeaders()
        });

        if (response.ok) {
          await this.loadInventoryData();
          this.showToast('Category deleted successfully', 'success');
        } else {
          const error = await response.json();
          this.showToast('Error: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Error deleting category:', error);
        this.showToast('Failed to delete category', 'error');
      }
    },

    // Supplier management
    showSupplierForm(supplier = null) {
      this.editingSupplier = supplier;
      if (supplier) {
        this.supplierForm = { ...supplier };
      } else {
        this.supplierForm = {
          name: '',
          contact_person: '',
          phone: '',
          email: '',
          address: '',
          notes: ''
        };
      }
      this.showSupplierFormModal = true;
    },

    async saveSupplier() {
      this.showToast('Supplier management requires advanced inventory setup', 'info');
      this.showSupplierFormModal = false;
      this.editingSupplier = null;
    },

    async deleteSupplier(supplierId) {
      if (!confirm('Are you sure you want to delete this supplier?')) return;

      try {
        const response = await fetch(`${API_BASE}/api/inventory/suppliers/${supplierId}`, {
          method: 'DELETE',
          headers: this.getAuthHeaders()
        });

        if (response.ok) {
          await this.loadInventoryData();
          this.showToast('Supplier deleted successfully', 'success');
        } else {
          const error = await response.json();
          this.showToast('Error: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Error deleting supplier:', error);
        this.showToast('Failed to delete supplier', 'error');
      }
    },

    // Import/Export functionality
    exportInventoryData(type) {
      try {
        let endpoint = '';
        let filename = '';

        switch (type) {
          case 'all':
            endpoint = '/api/inventory/export/all';
            filename = 'inventory-all';
            break;
          case 'low-stock':
            endpoint = '/api/inventory/export/low-stock';
            filename = 'inventory-low-stock';
            break;
          case 'out-of-stock':
            endpoint = '/api/inventory/export/out-of-stock';
            filename = 'inventory-out-of-stock';
            break;
        }

        fetch(`${API_BASE}${endpoint}`, {
          headers: this.getAuthHeaders()
        })
          .then(response => response.blob())
          .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            this.showToast('Export completed successfully', 'success');
          })
          .catch(error => {
            console.error('Export error:', error);
            this.showToast('Failed to export data', 'error');
          });
      } catch (error) {
        console.error('Export error:', error);
        this.showToast('Failed to export data', 'error');
      }
    },

    exportInventoryTemplate() {
      const headers = [
        'name,category_name,stock_quantity,low_stock_threshold,cost_price,selling_price,unit,supplier_name,description'
      ];
      const csvContent = headers.join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventory-template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },

    handleInventoryImport(event) {
      const file = event.target.files[0];
      if (file) {
        this.importFileName = file.name;
        this.importPreview = [];
        this.importResults = { summary: { created: 0, updated: 0, errors: 0 }, errors: [] };
      }
    },

    async processInventoryImport() {
      if (!this.importFileName) {
        this.showToast('Please select a file to import', 'error');
        return;
      }

      const fileInput = document.getElementById('inventory-import-file');
      const file = fileInput.files[0];

      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('update_existing', this.importOptions.updateExisting);
      formData.append('validate_only', this.importOptions.validateOnly);

      try {
        const response = await fetch(`${API_BASE}/api/inventory/import`, {
          method: 'POST',
          headers: {
            'Authorization': this.getAuthHeaders()['Authorization']
          },
          body: formData
        });

        if (response.ok) {
          const result = await response.json();

          if (this.importOptions.validateOnly) {
            this.importPreview = result.preview || [];
            this.showToast('Validation completed', 'success');
          } else {
            this.importResults = result;
            this.showToast('Import completed successfully', 'success');
            await this.loadInventoryData();
            await this.loadMenuData();
          }
        } else {
          const error = await response.json();
          this.showToast('Import failed: ' + error.error, 'error');
        }
      } catch (error) {
        console.error('Import error:', error);
        this.showToast('Failed to import data', 'error');
      } finally {
        fileInput.value = '';
        this.importFileName = '';
      }
    }
  };
}
