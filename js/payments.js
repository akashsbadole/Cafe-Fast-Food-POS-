// Payment handling module for Cafe POS

const Payments = {
  currentMode: 'cash',
  
  // Set payment mode
  setMode: (mode) => {
    Payments.currentMode = mode;
    
    // Update UI
    document.querySelectorAll('.payment-mode').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`.payment-mode[data-mode="${mode}"]`)?.classList.add('active');
  },
  
  // Get current payment mode
  getMode: () => {
    return Payments.currentMode;
  },
  
  // Process checkout
  checkout: () => {
    if (Cart.isEmpty()) {
      alert('Cart is empty. Please add items first.');
      return null;
    }
    
    const mode = Payments.getMode();
    const orderData = Billing.processCheckout(mode);
    
    if (orderData) {
      // Show bill preview
      Billing.showBillPreview(orderData);
      
      // Print bill automatically (optional, can be disabled)
      // Billing.printBill(orderData);
      
      return orderData;
    }
    
    return null;
  },
  
  // Setup event listeners
  setupEventListeners: () => {
    // Payment mode buttons
    document.querySelectorAll('.payment-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        Payments.setMode(btn.dataset.mode);
      });
    });
    
    // Checkout button
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        const orderData = Payments.checkout();
        if (orderData) {
          // Refresh KOT if needed
          KOT.refresh();
          History.refresh();
        }
      });
    }
  }
};

// Export payments module
window.Payments = Payments;
