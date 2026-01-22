// Payment handling module for Cafe POS

const Payments = {
  currentMode: 'cash',
  currentSplitNumber: 1,
  currentCashDrawerId: null,
  currentSessionId: null,
  
  // Set payment mode
  setMode: (mode) => {
    Payments.currentMode = mode;
    
    // Update UI
    document.querySelectorAll('.payment-mode').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`.payment-mode[data-mode="${mode}"]`)?.classList.add('active');
  },
  
  // Set current cash drawer
  setCashDrawer: (cashDrawerId, sessionId) => {
    Payments.currentCashDrawerId = cashDrawerId;
    Payments.currentSessionId = sessionId;
  },
  
  // Get current cash drawer
  getCashDrawer: () => {
    return {
      cashDrawerId: Payments.currentCashDrawerId,
      sessionId: Payments.currentSessionId
    };
  },
  
  // Clear current cash drawer
  clearCashDrawer: () => {
    Payments.currentCashDrawerId = null;
    Payments.currentSessionId = null;
  },
  
  // Get current payment mode
  getMode: () => {
    return Payments.currentMode;
  },
  
  // Set current split number
  setSplitNumber: (splitNumber) => {
    Payments.currentSplitNumber = splitNumber;
  },
  
  // Get current split number
  getSplitNumber: () => {
    return Payments.currentSplitNumber;
  },
  
  // Process checkout
  checkout: () => {
    if (Cart.isEmpty()) {
      alert('Cart is empty. Please add items first.');
      return null;
    }
    
    const mode = Payments.getMode();
    const cashDrawer = Payments.getCashDrawer();
    const orderData = Billing.processCheckout(mode, cashDrawer);
    
    if (orderData) {
      // Show bill preview
      Billing.showBillPreview(orderData);
      
      // Print bill automatically (optional, can be disabled)
      // Billing.printBill(orderData);
      
      return orderData;
    }
    
    return null;
  },
  
  // Process split bill payment
  processSplitPayment: async (sessionId, splitNumber, amount, paymentMethod, transactionId = null) => {
    try {
      const SplitBillManager = require('./split-bill-manager');
      const splitBillManager = new SplitBillManager(database);
      
      const result = await splitBillManager.processSplitPayment({
        sessionId,
        splitNumber,
        amount,
        paymentMethod,
        transactionId,
        userId: currentUser ? currentUser.id : null
      });
      
      // Record cash drawer transaction if using cash
      if (paymentMethod === 'cash' && Payments.currentSessionId) {
        const CashDrawerManager = require('./cash-drawer-manager');
        const cashDrawerManager = new CashDrawerManager(database, console);
        
        await cashDrawerManager.recordTransaction({
          session_id: Payments.currentSessionId,
          transaction_type: 'PAYMENT',
          amount: amount,
          reference_id: result.paymentId,
          reference_type: 'payment',
          description: `Split payment #${splitNumber}`
        });
      }
      
      return result;
    } catch (error) {
      console.error('Error processing split payment:', error);
      throw error;
    }
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
  },
  
  // Process refund for a payment
  processRefund: async (paymentId, amount, reasonCode, userId, notes = '') => {
    try {
      if (!Billing.voidRefundManager) {
        throw new Error('Void/Refund manager not initialized');
      }
      
      // Create refund request
      const requestParams = {
        requestType: 'REFUND',
        orderId: null, // Will be set from payment
        paymentId: paymentId,
        reasonCode: reasonCode,
        reasonDetails: notes,
        requestedBy: userId,
        amount: amount
      };
      
      // Get payment details to get order ID
      const payment = await database.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      requestParams.orderId = payment.order_id;
      
      // Request refund
      const result = await Billing.voidRefundManager.requestVoidRefund(requestParams);
      
      return result;
    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  },
  
  // Process partial refund for a payment
  processPartialRefund: async (paymentId, amount, reasonCode, userId, notes = '') => {
    try {
      if (!Billing.voidRefundManager) {
        throw new Error('Void/Refund manager not initialized');
      }
      
      // Create partial refund request
      const requestParams = {
        requestType: 'REFUND',
        paymentId: paymentId,
        reasonCode: reasonCode,
        reasonDetails: notes,
        requestedBy: userId,
        amount: amount,
        isPartial: true
      };
      
      // Get payment details to get order ID
      const payment = await database.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      requestParams.orderId = payment.order_id;
      
      // Request partial refund
      const result = await Billing.voidRefundManager.requestVoidRefund(requestParams);
      
      return result;
    } catch (error) {
      console.error('Error processing partial refund:', error);
      throw error;
    }
  },
  
  // Check if payment can be refunded
  canRefundPayment: async (paymentId) => {
    try {
      const payment = await database.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
      if (!payment) {
        return { canRefund: false, reason: 'Payment not found' };
      }
      
      if (payment.refund_status === 'FULLY_REFUNDED') {
        return { canRefund: false, reason: 'Payment already fully refunded' };
      }
      
      // Check if order is voided
      const order = await database.get('SELECT void_status FROM orders WHERE id = ?', [payment.order_id]);
      if (order && order.void_status === 'VOIDED') {
        return { canRefund: false, reason: 'Order is voided' };
      }
      
      return { canRefund: true, reason: 'Payment can be refunded' };
    } catch (error) {
      console.error('Error checking refund eligibility:', error);
      return { canRefund: false, reason: 'Error checking refund eligibility' };
    }
  }
};

// Export payments module
window.Payments = Payments;
