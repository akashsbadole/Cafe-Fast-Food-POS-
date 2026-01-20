# UI Documentation

## Overview

The Cafe POS system features a modern, responsive user interface built with HTML, CSS, and Alpine.js. The UI is designed for ease of use in a fast-paced cafe environment with intuitive controls and clear visual feedback.

## UI Structure

### Core Files

- **index.html**: Main application HTML structure
  - Page layout
  - Component structure
  - Alpine.js initialization

- **styles/main.css**: Core styling
  - Responsive design
  - Theme support (dark/light)
  - Component styles
  - Animations

- **app.js**: Main application initialization
  - UI setup
  - Event listeners
  - State management

- **app-alpine.js**: Alpine.js-based UI logic
  - Reactive components
  - Data binding
  - Event handling

- **ui.js**: UI component management
  - Component rendering
  - Event delegation
  - DOM manipulation

### Localization Files

- **client/src/locales/en/**: English translations
- **client/src/locales/es/**: Spanish translations
- **client/src/locales/hi/**: Hindi translations

## UI Components

### Login Screen
- **Purpose**: User authentication
- **Features**:
  - PIN input field
  - Login button
  - Error messages
  - Language selection
  - Theme toggle

**Structure**:
```html
<div id="login-screen" x-data="loginStore">
  <div class="login-form">
    <input type="password" x-model="pin" placeholder="Enter PIN">
    <button @click="login">Login</button>
    <div x-show="error" class="error-message">{{ error }}</div>
  </div>
</div>
```

### Main POS Screen
- **Purpose**: Order processing interface
- **Features**:
  - Menu grid
  - Cart panel
  - Order summary
  - Payment controls
  - Customer information

**Structure**:
```html
<div id="pos-screen" x-data="posStore">
  <div class="menu-grid">
    <div class="menu-item" @click="addToCart(item)">
      <img :src="item.image">
      <span>{{ item.name }}</span>
      <span>{{ formatCurrency(item.price) }}</span>
    </div>
  </div>
  
  <div class="cart-panel">
    <div class="cart-item" x-for="item in cart">
      <span>{{ item.name }}</span>
      <span>{{ item.quantity }} × {{ formatCurrency(item.price) }}</span>
      <button @click="removeFromCart(item.id)">×</button>
    </div>
    <div class="cart-total">
      Total: {{ formatCurrency(total) }}
    </div>
  </div>
</div>
```

### Menu Grid
- **Purpose**: Display menu items
- **Features**:
  - Category filtering
  - Search functionality
  - Item images
  - Pricing display
  - Quick add to cart

**Usage**:
```javascript
// In app-alpine.js
const posStore = {
  menu: [],
  filteredMenu: [],
  selectedCategory: null,
  searchQuery: '',
  
  init() {
    this.loadMenu();
  },
  
  loadMenu() {
    fetch('/api/menu')
      .then(r => r.json())
      .then(menu => {
        this.menu = menu;
        this.filteredMenu = menu;
      });
  },
  
  filterByCategory(category) {
    this.selectedCategory = category;
    this.filteredMenu = this.selectedCategory
      ? this.menu.filter(item => item.category_id === this.selectedCategory)
      : this.menu;
  },
  
  searchItems() {
    this.filteredMenu = this.menu.filter(item =>
      item.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
  }
};
```

### Cart Panel
- **Purpose**: Order management
- **Features**:
  - Item list
  - Quantity adjustments
  - Discount application
  - Tax calculation
  - Order summary

**Usage**:
```javascript
const cartStore = {
  cart: [],
  discount: null,
  
  addToCart(item) {
    const existing = this.cart.find(cartItem => cartItem.id === item.id);
    if (existing) {
      existing.quantity++;
    } else {
      this.cart.push({ ...item, quantity: 1 });
    }
  },
  
  removeFromCart(itemId) {
    this.cart = this.cart.filter(item => item.id !== itemId);
  },
  
  updateQuantity(itemId, quantity) {
    const item = this.cart.find(item => item.id === itemId);
    if (item) {
      item.quantity = quantity;
    }
  },
  
  applyDiscount(discount) {
    this.discount = discount;
  },
  
  getSubtotal() {
    return this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  },
  
  getTax() {
    const subtotal = this.getSubtotal();
    return subtotal * 0.18; // 18% GST
  },
  
  getTotal() {
    const subtotal = this.getSubtotal();
    const tax = this.getTax();
    let total = subtotal + tax;
    
    if (this.discount) {
      if (this.discount.type === 'percentage') {
        total = total * (1 - this.discount.value / 100);
      } else {
        total = total - this.discount.value;
      }
    }
    
    return total;
  }
};
```

### Kitchen Order Ticket (KOT) Display
- **Purpose**: Order tracking for kitchen staff
- **Features**:
  - Active order display
  - Order status updates
  - Preparation time tracking
  - Completion confirmation

**Structure**:
```html
<div id="kot-display" x-data="kotStore">
  <div class="kot-ticket" x-for="ticket in activeTickets" :class="ticket.status">
    <div class="ticket-header">
      <span>Order #{{ ticket.orderId }}</span>
      <span>{{ ticket.status }}</span>
    </div>
    <div class="ticket-items">
      <div x-for="item in ticket.items">
        {{ item.quantity }} × {{ item.name }}
      </div>
    </div>
    <div class="ticket-actions">
      <button @click="markReady(ticket.id)" x-show="ticket.status === 'preparing'">
        Mark Ready
      </button>
    </div>
  </div>
</div>
```

### Order History
- **Purpose**: View past orders
- **Features**:
  - Search by date
  - Filter by status
  - Order details
  - Reprint receipt
  - Customer information

**Usage**:
```javascript
const historyStore = {
  orders: [],
  filteredOrders: [],
  dateFilter: null,
  statusFilter: null,
  
  loadOrders() {
    fetch('/api/orders')
      .then(r => r.json())
      .then(orders => {
        this.orders = orders;
        this.filteredOrders = orders;
      });
  },
  
  filterOrders() {
    this.filteredOrders = this.orders.filter(order => {
      const dateMatch = !this.dateFilter || 
        new Date(order.created_at).toDateString() === this.dateFilter;
      const statusMatch = !this.statusFilter || order.status === this.statusFilter;
      return dateMatch && statusMatch;
    });
  },
  
  reprintReceipt(orderId) {
    window.api.printReceipt(orderId);
  }
};
```

### User Management Interface
- **Purpose**: Manage users and permissions
- **Features**:
  - Add/edit/delete users
  - Role assignment
  - PIN management
  - Activity logging

**Structure**:
```html
<div id="user-management" x-data="userStore">
  <div class="user-list">
    <div class="user-item" x-for="user in users">
      <span>{{ user.name }}</span>
      <span>{{ user.role }}</span>
      <span>{{ user.last_login }}</span>
      <button @click="editUser(user)">Edit</button>
      <button @click="resetPin(user.id)">Reset PIN</button>
    </div>
  </div>
  
  <div class="user-form" x-show="editingUser">
    <input x-model="editingUser.name" placeholder="Name">
    <select x-model="editingUser.role">
      <option value="admin">Admin</option>
      <option value="cashier">Cashier</option>
    </select>
    <button @click="saveUser">Save</button>
    <button @click="cancelEdit">Cancel</button>
  </div>
</div>
```

### Inventory Management Interface
- **Purpose**: Manage inventory
- **Features**:
  - Stock level display
  - Low stock alerts
  - Supplier management
  - Purchase orders
  - Inventory transfers

**Usage**:
```javascript
const inventoryStore = {
  inventory: [],
  suppliers: [],
  selectedItem: null,
  
  loadInventory() {
    fetch('/api/inventory')
      .then(r => r.json())
      .then(inventory => {
        this.inventory = inventory;
      });
  },
  
  updateStock(itemId, quantity) {
    fetch('/api/inventory/' + itemId + '/stock', {
      method: 'POST',
      body: JSON.stringify({ quantity })
    });
  },
  
  createPurchaseOrder(items) {
    fetch('/api/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({ items })
    });
  }
};
```

### Reporting Dashboard
- **Purpose**: View sales and business metrics
- **Features**:
  - Sales charts
  - Top selling items
  - Payment breakdown
  - Tax reports
  - Inventory turnover
  - Custom reports

**Structure**:
```html
<div id="reporting-dashboard" x-data="reportingStore">
  <div class="report-section">
    <h3>Daily Sales</h3>
    <canvas x-ref="salesChart"></canvas>
  </div>
  
  <div class="report-section">
    <h3>Top Selling Items</h3>
    <table>
      <tr x-for="item in topItems">
        <td>{{ item.name }}</td>
        <td>{{ item.quantity }}</td>
        <td>{{ formatCurrency(item.revenue) }}</td>
      </tr>
    </table>
  </div>
  
  <div class="report-section">
    <h3>Payment Breakdown</h3>
    <div class="chart-container">
      <!-- Chart visualization -->
    </div>
  </div>
</div>
```

### Token Queue Management
- **Purpose**: Manage customer ordering queue
- **Features**:
  - Token generation
  - Queue status display
  - Customer lookup
  - Queue statistics
  - Queue reset

**Usage**:
```javascript
const tokenQueueStore = {
  queue: [],
  history: [],
  newToken: '',
  
  generateToken() {
    fetch('/api/tokens', { method: 'POST' })
      .then(r => r.json())
      .then(token => {
        this.newToken = token;
        this.loadQueue();
      });
  },
  
  loadQueue() {
    fetch('/api/tokens/active')
      .then(r => r.json())
      .then(queue => {
        this.queue = queue;
      });
  },
  
  updateStatus(token, status) {
    fetch('/api/tokens/' + token + '/status', {
      method: 'POST',
      body: JSON.stringify({ status })
    });
  },
  
  resetQueue() {
    if (confirm('Reset queue? All active tokens will be cleared.')) {
      fetch('/api/tokens/reset', { method: 'POST' });
    }
  }
};
```

## UI Themes

The application supports dark and light themes:

```css
/* Light theme */
:root {
  --bg-color: #ffffff;
  --text-color: #333333;
  --primary-color: #4a6fa5;
  --secondary-color: #6b8cae;
  --accent-color: #ff6b6b;
  --success-color: #51cf66;
  --warning-color: #ffd43b;
}

/* Dark theme */
.dark-theme {
  --bg-color: #1a1a1a;
  --text-color: #f0f0f0;
  --primary-color: #6b8cae;
  --secondary-color: #4a6fa5;
  --accent-color: #ff6b6b;
  --success-color: #51cf66;
  --warning-color: #ffd43b;
}
```

## Localization

The application supports multiple languages through i18n:

```javascript
// In client/src/locales/en/translations.json
{
  "login": {
    "title": "Login",
    "pin": "Enter PIN",
    "button": "Login"
  },
  "menu": {
    "title": "Menu",
    "search": "Search items..."
  },
  "cart": {
    "title": "Your Cart",
    "total": "Total",
    "checkout": "Checkout"
  }
}
```

## Responsive Design

The UI is fully responsive with breakpoints for:
- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

```css
/* Mobile styles */
@media (max-width: 767px) {
  .menu-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .cart-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
  }
}

/* Tablet styles */
@media (min-width: 768px) and (max-width: 1023px) {
  .menu-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .cart-panel {
    width: 300px;
  }
}

/* Desktop styles */
@media (min-width: 1024px) {
  .menu-grid {
    grid-template-columns: repeat(4, 1fr);
  }
  .cart-panel {
    width: 350px;
  }
}
```

## Accessibility

The UI implements accessibility features:
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode
- Focus indicators
- ARIA labels
- Semantic HTML

```html
<button @click="checkout" aria-label="Checkout and pay for order">
  <span>Checkout</span>
  <span class="sr-only">and pay for order</span>
</button>
```

## Best Practices

### UI Design

1. **Keep it simple**: Minimize clutter
2. **Use consistent patterns**: Maintain visual consistency
3. **Provide feedback**: Show loading states and confirmations
4. **Make it responsive**: Work on all screen sizes
5. **Accessible**: Support keyboard and screen readers

### Performance

1. **Optimize assets**: Compress images
2. **Use efficient selectors**: In CSS
3. **Minimize reflows**: Batch DOM updates
4. **Lazy load**: Non-critical content
5. **Cache data**: Where appropriate

### User Experience

1. **Clear navigation**: Intuitive menu structure
2. **Helpful errors**: Descriptive error messages
3. **Progress indicators**: Show loading states
4. **Confirm actions**: For destructive operations
5. **Keyboard shortcuts**: For power users

## Troubleshooting

### Common UI Issues

#### Layout Broken
- Check CSS file loading
- Verify responsive breakpoints
- Test on different screen sizes

#### Buttons Not Working
- Check event listeners
- Verify Alpine.js initialization
- Test click handlers

#### Data Not Updating
- Check reactive bindings
- Verify data flow
- Test API calls

#### Theme Not Applying
- Check theme class application
- Verify CSS variables
- Test theme toggle

## See Also

- [Core Features Documentation](../CORE-FEATURES/README.md)
- [Business Logic Documentation](../BUSINESS-LOGIC/README.md)
- [Testing Documentation](../TESTING/README.md)

## Additional Resources

- [UI Screen Layouts](../plans/architecture.md#uiux-design) - Detailed UI screen designs and layouts
- [Localization Guide](../client/src/locales/) - Multi-language support documentation
