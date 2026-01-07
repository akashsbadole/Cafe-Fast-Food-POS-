// Billing and calculation module for Cafe POS

const Billing = {
  taxRate: 9, // Default backup

  // Initialize Billing
  init: async () => {
    try {
      // Fetch taxes from API (optional location param can be added later)
      const response = await fetch('http://localhost:3000/api/tax'); 
      if (response.ok) {
        const taxes = await response.json();
        // Sum up all active tax rates
        const totalRate = taxes.reduce((sum, tax) => sum + parseFloat(tax.rate), 0);
        Billing.taxRate = totalRate;
        console.log('Tax rate updated from API:', Billing.taxRate);
        Billing.calculate(); // Recalculate if items exist
      }
    } catch (e) {
      console.error('Failed to fetch tax rates:', e);
    }
  },

  // Calculate all amounts
  calculate: () => {
    const subtotal = Cart.getSubtotal();
    const discountAmount = Cart.getDiscountAmount();
    const taxableAmount = Cart.getTaxableAmount();
    const taxAmount = Utils.calculateTax(taxableAmount, Billing.taxRate);
    const total = taxableAmount + taxAmount;
    
    // Update UI
    Billing.updateDisplay(subtotal, discountAmount, taxAmount, total);
    
    return {
      subtotal,
      discountAmount,
      taxableAmount,
      taxAmount,
      taxRate: Billing.taxRate,
      total
    };
  },
  
  // Update display elements
  updateDisplay: (subtotal, discountAmount, taxAmount, total) => {
    const subtotalEl = document.getElementById('bill-subtotal');
    const discountEl = document.getElementById('bill-discount');
    const taxEl = document.getElementById('bill-tax');
    const totalEl = document.getElementById('bill-total');
    
    if (subtotalEl) subtotalEl.textContent = Utils.formatCurrency(subtotal);
    if (discountEl) discountEl.textContent = '-' + Utils.formatCurrency(discountAmount);
    if (taxEl) taxEl.textContent = Utils.formatCurrency(taxAmount);
    if (totalEl) totalEl.textContent = Utils.formatCurrency(total);
  },
  
  // Get current calculations
  getTotals: () => {
    return Billing.calculate();
  },
  
  // Set tax rate
  setTaxRate: (rate) => {
    Billing.taxRate = rate;
    Billing.calculate();
  },
  
  // Process checkout
  processCheckout: (paymentMode) => {
    if (Cart.isEmpty()) {
      alert('Cart is empty. Please add items first.');
      return null;
    }
    
    const totals = Billing.getTotals();
    const orderNumber = order.generateOrderNumber();
    
    const orderData = {
      orderNumber,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      discountType: Cart.discountType,
      taxAmount: totals.taxAmount,
      taxRate: totals.taxRate,
      totalAmount: totals.total,
      paymentMode,
      paymentStatus: 'paid',
      status: 'pending',
      notes: ''
    };
    
    // Create order in database
    const orderId = order.create(orderData);
    
    // Add order items
    const orderItems = Cart.getOrderItems();
    orderItems.forEach(item => {
      order.addItem(orderId, item);
    });
    
    // Clear cart after successful order
    Cart.clear();
    
    return {
      orderId,
      orderNumber,
      ...orderData,
      items: orderItems
    };
  },
  
  // Generate bill HTML
  generateBill: (orderData) => {
    const order = order.getWithItems(orderData.orderId || orderData.id);
    if (!order) return '';
    
    const items = order.items || [];
    
    let itemsHtml = '';
    items.forEach(item => {
      itemsHtml += `
        <div class="bill-item">
          <span class="bill-item-name">${item.name}</span>
          <span class="bill-item-qty">${item.quantity}</span>
          <span class="bill-item-price">${Utils.formatCurrency(item.total_price)}</span>
        </div>
      `;
    });
    
    return `
      <div class="bill-header">
        <h2>☕ COFFEE CAFE</h2>
        <p>Taste the Difference</p>
        <p>GST No: 27AABCD1234D1Z5</p>
      </div>
      <hr class="bill-divider">
      <div class="bill-items">
        ${itemsHtml}
      </div>
      <hr class="bill-divider">
      <div class="bill-totals">
        <div class="bill-row">
          <span>Subtotal:</span>
          <span>${Utils.formatCurrency(order.subtotal)}</span>
        </div>
        <div class="bill-row">
          <span>Discount:</span>
          <span>-${Utils.formatCurrency(order.discount_amount)}</span>
        </div>
        <div class="bill-row">
          <span>GST (${order.tax_rate}%):</span>
          <span>${Utils.formatCurrency(order.tax_amount)}</span>
        </div>
        <div class="bill-row bill-total-row">
          <span>Total:</span>
          <span>${Utils.formatCurrency(order.total_amount)}</span>
        </div>
      </div>
      <hr class="bill-divider">
      <div class="bill-footer">
        <p>Payment Mode: ${order.payment_mode.toUpperCase()}</p>
        <p>Order No: ${order.order_number}</p>
        <p>Date: ${Utils.formatDate(order.created_at)} Time: ${Utils.formatTime(order.created_at)}</p>
        <p style="margin-top: 12px;">Thank you! Visit Again!</p>
      </div>
    `;
  },
  
  // Print bill
  printBill: (orderData) => {
    const billHtml = Billing.generateBill(orderData);
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bill - ${orderData.orderNumber}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              padding: 20px;
              font-size: 14px;
              line-height: 1.4;
              color: #000;
            }
            .bill-header {
              text-align: center;
              margin-bottom: 16px;
              padding-bottom: 16px;
              border-bottom: 1px dashed #000;
            }
            .bill-header h2 {
              font-size: 20px;
              margin-bottom: 4px;
            }
            .bill-header p {
              font-size: 11px;
              color: #666;
            }
            .bill-divider {
              border: none;
              border-top: 1px dashed #000;
              margin: 8px 0;
            }
            .bill-items {
              margin-bottom: 16px;
            }
            .bill-item {
              display: flex;
              justify-content: space-between;
              padding: 4px 0;
              font-size: 12px;
            }
            .bill-item-name {
              flex: 1;
            }
            .bill-item-qty {
              width: 40px;
              text-align: center;
            }
            .bill-item-price {
              width: 80px;
              text-align: right;
            }
            .bill-totals {
              margin-bottom: 16px;
            }
            .bill-row {
              display: flex;
              justify-content: space-between;
              padding: 4px 0;
              font-size: 12px;
            }
            .bill-total-row {
              font-weight: 700;
              font-size: 16px;
              border-top: 2px solid #000;
              padding-top: 8px;
              margin-top: 8px;
            }
            .bill-footer {
              text-align: center;
              font-size: 11px;
              color: #666;
            }
            @media print {
              body {
                padding: 10px;
              }
            }
          </style>
        </head>
        <body>
          ${billHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  },
  
  // Show bill preview
  showBillPreview: (orderData) => {
    const billHtml = Billing.generateBill(orderData);
    const previewContainer = document.getElementById('bill-preview');
    if (previewContainer) {
      previewContainer.innerHTML = billHtml;
      document.getElementById('bill-modal').classList.add('active');
    }
  }
};

// Export billing module
window.Billing = Billing;
