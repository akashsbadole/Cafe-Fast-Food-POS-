// Alpine.js Application for Cafe POS - Reactive UI State Management

// API Base URL - Absolute path needed for Electron (file://) support
const API_BASE = 'http://localhost:3000';

function posApp() {
  return {
    // Authentication state
    isLoggedIn: false,
    currentUser: null, // Stores { id, username, role }
    token: localStorage.getItem('jwt_token') || null,
    isLocked: false,
    pin: ['', '', '', ''],
    lockPin: ['', '', '', ''],
    loginError: '',
    lockError: '',

    // UI state
    theme: 'light',
    currentTime: '',
    timeInterval: null,

    // Menu state
    categories: [],
    allItems: [],
    taxes: [], // New taxes array
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

    // Bill state
    showBill: false,
    billHtml: '',
    showOrderDetailsModal: false,
    orderDetailsHtml: '',

    // MVP Features State
    showSettings: false,
    showUserManagement: false,
    showUserFormModal: false,
    showReports: false,
    users: [],
    roles: [],
    editingUser: null,
    userForm: { username: '', full_name: '', role_id: '', pin: '' },
    appSettings: {
      business_name: 'Cafe POS',
      business_address: '123 Main St, City',
      tax_rate: '9.00',
      currency_symbol: '₹',
      currency_code: 'INR'
    },

    // Customer Management
    selectedCustomer: null,
    customerSearchQuery: '',
    customerSearchResults: [],
    showCustomerResults: false,
    showAddCustomerForm: false,
    newCustomer: { name: '', phone: '' },

    // Reports
    reportData: {
      summary: { total_sales: 0, total_orders: 0, total_tax: 0, total_discount: 0 },
      paymentBreakdown: [],
      topItems: []
    },
    reportDateRange: {
      start: new Date().toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    },

    // Toast notifications
    toasts: [],
    toastId: 0,

    // Initialize application
    init() {
      this.loadTheme();
      this.startClock();
      this.loadMenuData();
      this.loadTaxes(); // Fetch taxes
      this.loadOrders();
      this.setupAutoLock();
      this.setupKeyboardShortcuts();
    },

    setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // Global shortcuts
        if (e.key === 'F2') {
          e.preventDefault();
          this.$refs.searchInput.focus();
        }
        if (e.key === 'F4') {
          e.preventDefault();
          if (this.cart.length > 0) this.checkout();
        }
        if (e.key === 'Escape') {
          // Close top-most modal
          if (this.showBill) this.showBill = false;
          else if (this.showOrderDetailsModal) this.showOrderDetailsModal = false;
          else if (this.showCategoryFormModal) this.showCategoryFormModal = false;
          else if (this.showItemFormModal) this.showItemFormModal = false;
          else if (this.showMenuManagement) this.showMenuManagement = false;
          else if (this.showHistory) this.showHistory = false;
          else if (this.showKOT) this.showKOT = false;
        }
      });
    },

    // Load theme from localStorage
    loadTheme() {
      this.theme = localStorage.getItem('theme') || 'light';
      document.documentElement.setAttribute('data-theme', this.theme);
    },

    // Toggle theme
    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', this.theme);
      document.documentElement.setAttribute('data-theme', this.theme);
    },

    // Toggle language
    toggleLang() {
      const newLang = this.lang === 'en' ? 'hi' : 'en';
      i18n.setLang(newLang);
      this.lang = newLang;
    },

    // Translation helper
    t(key) {
      return i18n.t(key);
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
        // Fallback to default data not needed if server works
      }
    },

    // Load taxes
    async loadTaxes() {
      try {
        const response = await fetch(`${API_BASE}/api/tax`);
        this.taxes = await response.json();
      } catch (error) {
        console.error('Error loading taxes:', error);
      }
    },

    // Load orders
    async loadOrders() {
      try {
        const response = await fetch(`${API_BASE}/api/orders`);
        this.orders = await response.json();
      } catch (error) {
        console.error('Error loading orders:', error);
        this.orders = [];
      }
    },

    // Load KOT tickets
    async loadKOTTickets() {
      try {
        const response = await fetch(`${API_BASE}/api/kot`);
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
        this.kotTickets = [];
      }
    },

    // Computed: filtered items
    get filteredItems() {
      let items = this.allItems;

      // Filter by category
      if (this.selectedCategory !== 'all') {
        items = items.filter(item => item.category_id == this.selectedCategory);
      }

      // Filter by search
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        items = items.filter(item =>
          item.name.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query))
        );
      }

      // Only show available
      items = items.filter(item => item.is_available);

      return items;
    },

    // Computed: filtered orders
    get filteredOrders() {
      let orders = this.orders || [];

      // Filter by date
      if (this.historyFilter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        orders = orders.filter(o => o.created_at && o.created_at.startsWith(today));
      }

      // Filter by search
      if (this.orderSearch) {
        const query = this.orderSearch.toLowerCase();
        orders = orders.filter(o => o.order_number && o.order_number.toLowerCase().includes(query));
      }

      return orders;
    },

    // Cart operations
    addToCart(item) {
      const existing = this.cart.find(i => i.id === item.id);
      if (existing) {
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

    // Calculate totals
    calculateTotals() {
      this.subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);

      // Calculate discount
      if (this.discountType === 'percentage') {
        this.discountAmount = (this.subtotal * this.discountValue) / 100;
      } else {
        this.discountAmount = Math.min(this.discountValue, this.subtotal);
      }

      const taxableAmount = Math.max(0, this.subtotal - this.discountAmount);

      // Dynamic Tax Calculation
      this.taxAmount = 0;
      this.taxes.forEach(tax => {
        if (tax.is_active) {
          this.taxAmount += (taxableAmount * tax.rate) / 100;
        }
      });

      this.totalAmount = taxableAmount + this.taxAmount;
    },

    // Format currency
    formatCurrency(amount) {
      if (amount === undefined || amount === null) return '₹0.00';
      return '₹' + parseFloat(amount).toFixed(2);
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
    handlePinInput(event, index) {
      const input = event.target;
      const value = input.value;

      // Only allow numbers
      if (!/^\d*$/.test(value)) {
        this.pin[index] = '';
        input.value = '';
        return;
      }

      // Move to next input
      if (value && index < 3) {
        const inputs = document.querySelectorAll('#login-form .pin-digit');
        if (inputs[index + 1]) {
          inputs[index + 1].focus();
        }
      }
    },

    handleLockPinInput(event, index) {
      const input = event.target;
      const value = input.value;

      if (!/^\d*$/.test(value)) {
        this.lockPin[index] = '';
        input.value = '';
        return;
      }

      if (value && index < 3) {
        const inputs = document.querySelectorAll('#lock-form .pin-digit');
        if (inputs[index + 1]) {
          inputs[index + 1].focus();
        }
      }
    },

    handlePinKeydown(event, index) {
      if (event.key === 'Backspace' && !event.target.value && index > 0) {
        const inputs = document.querySelectorAll('#lock-form .pin-digit');
        inputs[index - 1].focus();
      }
    },

    // Login
    async login() {
      const pin = this.pin.join('');
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
          this.isLoggedIn = true;
          this.currentUser = result.user; // Store user details (role)
          this.pin = ['', '', '', ''];
          this.loginError = '';
        } else {
          this.loginError = 'Invalid PIN. Use 1234';
          this.pin = ['', '', '', ''];
          this.clearPinInputs();
        }
      } catch (error) {
        console.error('Login error', error);
        this.loginError = 'Server error';
        this.clearPinInputs();
      }
    },

    // Unlock
    async unlock() {
      const pin = this.lockPin.join('');
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
          this.isLocked = false;
          this.lockPin = ['', '', '', ''];
          this.lockError = '';
        } else {
          this.lockError = 'Invalid PIN';
          this.lockPin = ['', '', '', ''];
          this.clearLockPinInputs();
        }
      } catch (error) {
        this.lockError = 'Server error';
      }
    },

    // Logout
    logout() {
      if (confirm('Are you sure you want to logout?')) {
        this.isLoggedIn = false;
        this.currentUser = null;
        this.isLocked = false;
        this.cart = [];
        this.clearPinInputs();
      }
    },

    // Clear PIN inputs
    clearPinInputs() {
      const inputs = document.querySelectorAll('#login-form .pin-digit');
      inputs.forEach(input => input.value = '');
      this.pin = ['', '', '', ''];
      if (inputs[0]) inputs[0].focus();
    },

    clearLockPinInputs() {
      const inputs = document.querySelectorAll('#lock-form .pin-digit');
      inputs.forEach(input => input.value = '');
      this.lockPin = ['', '', '', ''];
      if (inputs[0]) inputs[0].focus();
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
        const response = await fetch(`${API_BASE}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: this.cart,
            subtotal: this.subtotal,
            discountAmount: this.discountAmount,
            discountType: this.discountType,
            taxAmount: this.taxAmount,
            totalAmount: this.totalAmount,
            paymentMode: this.paymentMode,
            paymentStatus: 'paid',
            notes: this.orderNotes
          })
        });

        const order = await response.json();

        // Generate bill
        this.generateBillHtml(order);
        this.showBill = true;

        // Clear cart
        this.cart = [];
        this.discountValue = 0;
        this.orderNotes = '';
        this.calculateTotals();

        // Refresh orders
        this.loadOrders();
      } catch (error) {
        console.error('Checkout error:', error);
        alert('Checkout failed. Please try again.');
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
          headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
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
      let itemsHtml = '';
      (order.items || []).forEach(item => {
        itemsHtml += `
          <div class="bill-item">
            <span class="bill-item-name">${item.quantity}x ${item.name}</span>
            <span class="bill-item-qty"></span>
            <span class="bill-item-price">${this.formatCurrency(item.total_price)}</span>
          </div>
        `;
      });

      // Display item notes if any
      const itemNotes = (order.items || []).filter(item => item.notes).map(item =>
        `<div class="bill-item-note">  → ${item.notes}</div>`
      ).join('');

      // Display order notes
      const orderNotesHtml = order.notes ? `<div class="bill-order-notes"><strong>Note:</strong> ${order.notes}</div>` : '';

      this.billHtml = `
        <div class="bill-header">
          <div class="bill-logo">☕</div>
          <h2>COFFEE CAFE</h2>
          <p>Taste the Difference</p>
          <p>GST No: 27AABCD1234D1Z5</p>
        </div>
        <hr class="bill-divider">
        <div class="bill-items">${itemsHtml}</div>
        ${itemNotes}
        ${orderNotesHtml}
        <hr class="bill-divider">
        <div class="bill-totals">
          <div class="bill-row"><span>Subtotal:</span><span>${this.formatCurrency(order.subtotal)}</span></div>
          <div class="bill-row"><span>Discount:</span><span>-${this.formatCurrency(order.discount_amount || 0)}</span></div>
          <div class="bill-row"><span>Tax:</span><span>${this.formatCurrency(order.tax_amount)}</span></div>
          <div class="bill-row bill-total-row"><span>Total:</span><span>${this.formatCurrency(order.total_amount)}</span></div>
        </div>
        <hr class="bill-divider">
        <div class="bill-footer">
          <p>Payment Mode: ${(order.payment_mode || 'cash').toUpperCase()}</p>
          <p>Order No: ${order.order_number}</p>
          <p>Date: ${this.formatDate(order.created_at)} Time: ${this.formatTime(order.created_at)}</p>
          <p style="margin-top: 12px;">Thank you! Visit Again!</p>
        </div>
      `;
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
          is_available: item.is_available
        };
      } else {
        this.itemForm = { name: '', category_id: this.categories[0]?.id || 1, price: 0, description: '', is_available: true };
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
          headers: {
            'Content-Type': 'application/json',
            'X-User-Role': this.currentUser?.role || '' // Send role for RBAC
          },
          body: JSON.stringify(this.categoryForm)
        });

        this.showCategoryFormModal = false;
        this.loadMenuData();
      } catch (error) {
        console.error('Save category error:', error);
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
          headers: {
            'Content-Type': 'application/json',
            'X-User-Role': this.currentUser?.role || ''
          },
          body: JSON.stringify(this.itemForm)
        });

        this.showItemFormModal = false;
        this.loadMenuData();
      } catch (error) {
        console.error('Save item error:', error);
      }
    },

    editCategory(category) {
      this.showCategoryForm(category);
    },

    editItem(item) {
      this.showItemForm(item);
    },

    async deleteCategory(id) {
      if (confirm('Are you sure you want to delete this category?')) {
        try {
          await fetch(`${API_BASE}/api/categories/${id}`, {
            method: 'DELETE',
            headers: { 'X-User-Role': this.currentUser?.role || '' }
          });
          this.loadMenuData();
        } catch (error) {
          console.error('Delete category error:', error);
        }
      }
    },

    async deleteItem(id) {
      if (confirm('Are you sure you want to delete this item?')) {
        try {
          await fetch(`${API_BASE}/api/menu-items/${id}`, {
            method: 'DELETE',
            headers: { 'X-User-Role': this.currentUser?.role || '' }
          });
          this.loadMenuData();
        } catch (error) {
          console.error('Delete item error:', error);
        }
      }
    },

    async toggleItemAvailability(id) {
      try {
        await fetch(`${API_BASE}/api/menu-items/${id}/toggle`, {
          method: 'PUT',
          headers: { 'X-User-Role': this.currentUser?.role || '' }
        });
        this.loadMenuData();
      } catch (error) {
        console.error('Toggle availability error:', error);
      }
    },

    // Seed Sample Data
    async seedSampleData() {
      if (confirm('Seed sample data? This will create dummy orders.')) {
        try {
          await fetch(`${API_BASE}/api/seed`, { method: 'POST' });
          this.loadOrders();
          this.loadKOTTickets();
        } catch (error) {
          console.error('Seed error', error);
        }
      }
    },

    // MVP Features Methods

    // Settings Management
    async loadSettings() {
      try {
        const response = await fetch(`${API_BASE}/api/settings`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (response.ok) {
          this.appSettings = await response.json();
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    },

    async updateSettings() {
      try {
        const response = await fetch(`${API_BASE}/api/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify(this.appSettings)
        });
        if (response.ok) {
          this.showToast('Settings updated successfully', 'success');
        }
      } catch (error) {
        console.error('Error updating settings:', error);
        this.showToast('Failed to update settings', 'error');
      }
    },

    // User Management
    async loadUsers() {
      try {
        const response = await fetch(`${API_BASE}/api/users`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
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
          headers: { 'Authorization': `Bearer ${this.token}` }
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
          full_name: user.full_name || '',
          role_id: user.role_id,
          pin: ''
        };
      } else {
        this.userForm = { username: '', full_name: '', role_id: '', pin: '' };
      }
      this.showUserFormModal = true;
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
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify(this.userForm)
        });

        if (response.ok) {
          this.showUserFormModal = false;
          this.loadUsers();
          this.showToast('User saved successfully', 'success');
        } else {
          const error = await response.json();
          this.showToast(error.error || 'Failed to save user', 'error');
        }
      } catch (error) {
        console.error('Save user error:', error);
        this.showToast('Failed to save user', 'error');
      }
    },

    async deleteUser(id) {
      if (confirm('Are you sure you want to delete this user?')) {
        try {
          const response = await fetch(`${API_BASE}/api/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${this.token}` }
          });
          if (response.ok) {
            this.loadUsers();
            this.showToast('User deleted successfully', 'success');
          }
        } catch (error) {
          console.error('Delete user error:', error);
          this.showToast('Failed to delete user', 'error');
        }
      }
    },

    // Customer Management
    async searchCustomers() {
      if (!this.customerSearchQuery) {
        this.customerSearchResults = [];
        this.showCustomerResults = false;
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/customers/search?q=${encodeURIComponent(this.customerSearchQuery)}`);
        if (response.ok) {
          this.customerSearchResults = await response.json();
          this.showCustomerResults = this.customerSearchResults.length > 0;
        }
      } catch (error) {
        console.error('Error searching customers:', error);
      }
    },

    selectCustomer(customer) {
      this.selectedCustomer = customer;
      this.customerSearchQuery = '';
      this.customerSearchResults = [];
      this.showCustomerResults = false;
    },

    clearCustomer() {
      this.selectedCustomer = null;
      this.customerSearchQuery = '';
    },

    async createCustomer() {
      if (!this.newCustomer.phone) {
        this.showToast('Phone number is required', 'error');
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/customers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.newCustomer)
        });

        if (response.ok) {
          const customer = await response.json();
          this.selectCustomer(customer);
          this.showAddCustomerForm = false;
          this.newCustomer = { name: '', phone: '' };
          this.showToast('Customer created successfully', 'success');
        } else {
          const error = await response.json();
          if (error.customer) {
            // Customer already exists, select them
            this.selectCustomer(error.customer);
            this.showAddCustomerForm = false;
            this.newCustomer = { name: '', phone: '' };
          } else {
            this.showToast(error.error || 'Failed to create customer', 'error');
          }
        }
      } catch (error) {
        console.error('Create customer error:', error);
        this.showToast('Failed to create customer', 'error');
      }
    },

    // Reports
    async generateReport() {
      try {
        const { start, end } = this.reportDateRange;

        // Get sales summary
        const salesResponse = await fetch(`${API_BASE}/api/reports/sales?start_date=${start}&end_date=${end}`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (salesResponse.ok) {
          const salesData = await salesResponse.json();
          this.reportData.summary = salesData.summary;
          this.reportData.paymentBreakdown = salesData.paymentBreakdown;
        }

        // Get top items
        const itemsResponse = await fetch(`${API_BASE}/api/reports/top-items?start_date=${start}&end_date=${end}&limit=5`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (itemsResponse.ok) {
          this.reportData.topItems = await itemsResponse.json();
        }

      } catch (error) {
        console.error('Error generating report:', error);
        this.showToast('Failed to generate report', 'error');
      }
    },

    setReportRange(range) {
      const today = new Date();
      let start, end;

      switch (range) {
        case 'today':
          start = end = today.toISOString().split('T')[0];
          break;
        case 'yesterday':
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          start = end = yesterday.toISOString().split('T')[0];
          break;
        case 'week':
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          start = weekAgo.toISOString().split('T')[0];
          end = today.toISOString().split('T')[0];
          break;
        case 'month':
          const monthAgo = new Date(today);
          monthAgo.setDate(monthAgo.getDate() - 30);
          start = monthAgo.toISOString().split('T')[0];
          end = today.toISOString().split('T')[0];
          break;
      }

      this.reportDateRange = { start, end };
      this.generateReport();
    },

    // Data Export/Import
    async exportData(type) {
      try {
        const response = await fetch(`${API_BASE}/api/export/${type}`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${type}-export.csv`;
          a.click();
          window.URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error('Export error:', error);
        this.showToast('Export failed', 'error');
      }
    },

    async importData(event, type) {
      const file = event.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${API_BASE}/api/import/${type}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.token}` },
          body: formData
        });

        if (response.ok) {
          const result = await response.json();
          this.showToast(result.message || 'Import successful', 'success');
          this.loadMenuData();
        } else {
          const error = await response.json();
          this.showToast(error.error || 'Import failed', 'error');
        }
      } catch (error) {
        console.error('Import error:', error);
        this.showToast('Import failed', 'error');
      }

      // Clear file input
      event.target.value = '';
    },

    // Backup/Restore
    async downloadBackup() {
      try {
        const response = await fetch(`${API_BASE}/api/backup`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          window.URL.revokeObjectURL(url);
          this.showToast('Backup downloaded successfully', 'success');
        }
      } catch (error) {
        console.error('Backup error:', error);
        this.showToast('Backup failed', 'error');
      }
    },

    async restoreBackup(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (!confirm('This will replace all current data. Are you sure?')) {
        event.target.value = '';
        return;
      }

      const formData = new FormData();
      formData.append('backup_file', file);

      try {
        const response = await fetch(`${API_BASE}/api/restore`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.token}` },
          body: formData
        });

        if (response.ok) {
          this.showToast('Database restored successfully', 'success');
          // Reload all data
          this.loadMenuData();
          this.loadOrders();
        } else {
          const error = await response.json();
          this.showToast(error.error || 'Restore failed', 'error');
        }
      } catch (error) {
        console.error('Restore error:', error);
        this.showToast('Restore failed', 'error');
      }

      // Clear file input
      event.target.value = '';
    },

    // Toast Notifications
    showToast(message, type = 'info') {
      const toast = {
        id: ++this.toastId,
        message,
        type,
        visible: true
      };

      this.toasts.push(toast);

      // Auto remove after 5 seconds
      setTimeout(() => {
        this.removeToast(toast.id);
      }, 300);
    },

    removeToast(id) {
      const index = this.toasts.findIndex(t => t.id === id);
      if (index > -1) {
        this.toasts[index].visible = false;
        setTimeout(() => {
          this.toasts.splice(index, 1);
        }, 300);
      }
    },

    // Enhanced checkout with customer
    async checkout() {
      if (this.cart.length === 0) {
        alert('Cart is empty. Please add items first.');
        return;
      }

      try {
        const orderData = {
          items: this.cart,
          subtotal: this.subtotal,
          discountAmount: this.discountAmount,
          discountType: this.discountType,
          taxAmount: this.taxAmount,
          totalAmount: this.totalAmount,
          paymentMode: this.paymentMode,
          paymentStatus: 'paid',
          notes: this.orderNotes,
          customerId: this.selectedCustomer?.id || null
        };

        const response = await fetch(`${API_BASE}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData)
        });

        const order = await response.json();

        // Generate bill
        this.generateBillHtml(order);
        this.showBill = true;

        // Clear cart and customer
        this.cart = [];
        this.discountValue = 0;
        this.orderNotes = '';
        this.selectedCustomer = null;
        this.calculateTotals();

        // Refresh orders
        this.loadOrders();
        this.showToast('Order completed successfully', 'success');
      } catch (error) {
        console.error('Checkout error:', error);
        this.showToast('Checkout failed. Please try again.', 'error');
      }
    }
  };
}
