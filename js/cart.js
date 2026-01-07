// Cart management module for Cafe POS

const Cart = {
  items: [],
  discountType: 'fixed',
  discountValue: 0,
  
  // Add item to cart
  addItem: (itemId, itemName, itemPrice) => {
    const existingIndex = Cart.items.findIndex(item => item.id === itemId);
    
    if (existingIndex > -1) {
      Cart.items[existingIndex].quantity += 1;
      Cart.items[existingIndex].total = Cart.items[existingIndex].quantity * itemPrice;
    } else {
      Cart.items.push({
        id: itemId,
        name: itemName,
        price: itemPrice,
        quantity: 1,
        total: itemPrice
      });
    }
    
    Cart.render();
    Billing.calculate();
  },
  
  // Remove item from cart
  removeItem: (itemId) => {
    Cart.items = Cart.items.filter(item => item.id !== itemId);
    Cart.render();
    Billing.calculate();
  },
  
  // Update item quantity
  updateQuantity: (itemId, quantity) => {
    const item = Cart.items.find(i => i.id === itemId);
    if (!item) return;
    
    if (quantity <= 0) {
      Cart.removeItem(itemId);
      return;
    }
    
    item.quantity = quantity;
    item.total = quantity * item.price;
    Cart.render();
    Billing.calculate();
  },
  
  // Increment quantity
  incrementQuantity: (itemId) => {
    const item = Cart.items.find(i => i.id === itemId);
    if (item) {
      Cart.updateQuantity(itemId, item.quantity + 1);
    }
  },
  
  // Decrement quantity
  decrementQuantity: (itemId) => {
    const item = Cart.items.find(i => i.id === itemId);
    if (item) {
      Cart.updateQuantity(itemId, item.quantity - 1);
    }
  },
  
  // Clear cart
  clear: () => {
    Cart.items = [];
    Cart.discountValue = 0;
    Cart.render();
    Billing.calculate();
  },
  
  // Set discount
  setDiscount: (value, type) => {
    Cart.discountValue = parseFloat(value) || 0;
    Cart.discountType = type || 'fixed';
    Cart.render();
    Billing.calculate();
  },
  
  // Get subtotal
  getSubtotal: () => {
    return Cart.items.reduce((sum, item) => sum + item.total, 0);
  },
  
  // Get discount amount
  getDiscountAmount: () => {
    const subtotal = Cart.getSubtotal();
    return Utils.calculateDiscount(subtotal, Cart.discountValue, Cart.discountType);
  },
  
  // Get taxable amount
  getTaxableAmount: () => {
    const subtotal = Cart.getSubtotal();
    const discount = Cart.getDiscountAmount();
    return Math.max(0, subtotal - discount);
  },
  
  // Render cart
  render: () => {
    const container = document.getElementById('cart-items');
    if (!container) return;
    
    if (Cart.items.length === 0) {
      container.innerHTML = `
        <div class="empty-cart">
          <span>🛒</span>
          <p>Cart is empty</p>
          <p class="hint">Add items from the menu</p>
        </div>
      `;
      return;
    }
    
    let html = '';
    Cart.items.forEach(item => {
      html += `
        <div class="cart-item" data-id="${item.id}">
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">${Utils.formatCurrency(item.price)} each</div>
          </div>
          <div class="cart-item-qty">
            <button class="qty-btn" onclick="Cart.decrementQuantity(${item.id})">−</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn" onclick="Cart.incrementQuantity(${item.id})">+</button>
          </div>
          <div class="cart-item-total">${Utils.formatCurrency(item.total)}</div>
          <button class="cart-item-remove" onclick="Cart.removeItem(${item.id})">×</button>
        </div>
      `;
    });
    
    container.innerHTML = html;
  },
  
  // Setup event listeners
  setupEventListeners: () => {
    // Clear cart button
    const clearCartBtn = document.getElementById('clear-cart-btn');
    if (clearCartBtn) {
      clearCartBtn.addEventListener('click', () => {
        if (Cart.items.length > 0 && confirm('Are you sure you want to clear the cart?')) {
          Cart.clear();
        }
      });
    }
    
    // Discount amount input
    const discountInput = document.getElementById('discount-amount');
    if (discountInput) {
      discountInput.addEventListener('input', (e) => {
        Cart.setDiscount(e.target.value, Cart.discountType);
      });
    }
    
    // Discount type select
    const discountTypeSelect = document.getElementById('discount-type');
    if (discountTypeSelect) {
      discountTypeSelect.addEventListener('change', (e) => {
        Cart.setDiscount(Cart.discountValue, e.target.value);
      });
    }
  },
  
  // Get cart items for order
  getOrderItems: () => {
    return Cart.items.map(item => ({
      menuItemId: item.id,
      quantity: item.quantity,
      unitPrice: item.price,
      totalPrice: item.total,
      notes: ''
    }));
  },
  
  // Check if cart is empty
  isEmpty: () => {
    return Cart.items.length === 0;
  }
};

// Export cart module
window.Cart = Cart;
