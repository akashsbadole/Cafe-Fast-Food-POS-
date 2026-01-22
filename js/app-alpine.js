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

    // Get authentication headers
    getAuthHeaders() {
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return headers;
    },

    // Initialize application
    init() {
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
        this.loadUsers().catch(err => console.warn('Users load failed:', err));
        this.loadRoles().catch(err => console.warn('Roles load failed:', err));
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
      window.onerror = (msg, url, lineNo, columnNo, error) => {
        console.error('Global Error:', error);
        this.showToast('An unexpected error occurred', 'error');
        return false;
      };
    },

    // --- Settings Methods ---
    async loadSettings() {
      try {
        const res = await fetch(`${API_BASE}/api/settings`, {
          headers: this.getAuthHeaders()
        });
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
        const res = await fetch(`${API_BASE}/api/settings`, {
          method: 'PUT',
          headers: this.getAuthHeaders(),
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
          headers: this.getAuthHeaders(),
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
          headers: this.getAuthHeaders(),
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
        const response = await fetch(`${API_BASE}/api/orders`, {
          headers: this.getAuthHeaders()
        });
        if (response.status === 401) { return; } // Token expired or invalid
        this.orders = await response.json();
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
          headers: this.getAuthHeaders()
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

    // Computed: filtered orders
    get filteredOrders() {
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
      const taxRate = parseFloat(this.appSettings.tax_rate) || 0;
      this.taxAmount = afterDiscount * (taxRate / 100);
      this.totalAmount = afterDiscount + this.taxAmount;
    },

    // Formatting helpers
    formatCurrency(value) {
      const symbol = this.appSettings ? this.appSettings.currency_symbol : '₹';
      return `${symbol}${parseFloat(value).toFixed(2)}`;
    },

    // Format date
    formatDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      const day = date.getDate();
      const month = date.toLocaleString('default', { month: 'short' });
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    },

    // Format time
    formatTime(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleString('default', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
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
    logout() {
      if (confirm('Are you sure you want to logout?')) {
        this.isLoggedIn = false;
        this.isLocked = false;
        this.cart = [];
        this.pinString = '';
        this.lockPinString = '';
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
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
      const idleInterval = setInterval(() => {
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
          customerId: this.selectedCustomer?.id
        };

        const response = await fetch(`${API_BASE}/api/orders`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.success) {
          // Add items
          for (const item of this.cart) {
            await fetch(`${API_BASE}/api/orders/${result.id}/items`, {
              method: 'POST',
              headers: this.getAuthHeaders(),
              body: JSON.stringify({
                menuItemId: item.id,
                quantity: item.quantity,
                unitPrice: item.price,
                totalPrice: item.price * item.quantity,
                notes: item.notes
              })
            });
          }

          this.currentOrder = { ...orderData, id: result.id, items: this.cart };
          this.generateBillHtml(this.currentOrder);
          this.showBill = true;
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
          headers: this.getAuthHeaders(),
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

    selectCustomer(cx) {
      this.selectedCustomer = cx;
      this.customerSearchQuery = cx.name ? `${cx.name} (${cx.phone})` : cx.phone;
      this.showCustomerResults = false;
    },

    clearCustomer() {
      this.selectedCustomer = null;
      this.customerSearchQuery = '';
      this.showCustomerResults = false;
    },

    async createCustomer() {
      try {
        const res = await fetch(`${API_BASE}/api/customers`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(this.newCustomer)
        });

        if (res.ok) {
          const cx = await res.json();
          this.selectCustomer(cx);
          this.showAddCustomerForm = false;
          this.newCustomer = { name: '', phone: '' };
        } else {
          const err = await res.json();
          alert(err.error);
        }
      } catch (e) {
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
          headers: this.getAuthHeaders(),
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
          headers: this.getAuthHeaders(),
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
      printWindow.document.write(`
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
      `);
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
          headers: this.getAuthHeaders(),
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
          headers: this.getAuthHeaders(),
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders(),
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
            headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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

    toggleModifier(modifierId, price) {
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
            ...this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
            ...this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
        const response = await fetch(`${API_BASE}/api/inventory/${itemId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
            ...this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders(),
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders(),
          body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.success) {
          // Add items
          for (const item of this.cart) {
            await fetch(`${API_BASE}/api/orders/${result.id}/items`, {
              method: 'POST',
              headers: this.getAuthHeaders(),
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
            headers: this.getAuthHeaders(),
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

    async transferOrder(table) {
      // Implementation for transferring existing orders between tables
      this.showToast('Transfer functionality coming soon', 'info');
    },

    async clearTable(table) {
      if (!confirm(`Clear table ${table.table_number}? This will remove any pending orders.`)) return;

      try {
        // Clear any pending orders for this table
        await fetch(`${API_BASE}/api/tables/${table.id}/clear`, {
          method: 'POST',
          headers: this.getAuthHeaders()
        });

        // Update table status
        await fetch(`${API_BASE}/api/tables/${table.id}`, {
          method: 'PUT',
          headers: this.getAuthHeaders(),
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders(),
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders(),
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders(),
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders()
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
          headers: this.getAuthHeaders(),
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
    }
  };
}
