// Billing and calculation module for Cafe POS

const Billing = {
  taxRate: 9, // Default backup
  taxType: 'exclusive', // Default tax type
  taxEngine: null,
  voidRefundManager: null,

  // Initialize Billing
  init: async () => {
    try {
      // Initialize tax engine
      const TaxEngine = require('./tax-engine');
      Billing.taxEngine = TaxEngine;
      
      // Initialize hardware manager for CFD
      try {
        const hardwareManager = require('./hardware-manager');
        await hardwareManager.initialize();
        Billing.hardwareManager = hardwareManager;
        
        // Get default CFD for payment display
        const cfds = await Billing.hardwareManager.database.query(
          'SELECT id FROM hardware_devices WHERE device_type = "cfd_display" AND is_active = 1 LIMIT 1'
        );
        
        if (cfds.length > 0) {
          Billing.defaultCFDId = cfds[0].id;
          console.log('Billing: Default CFD configured');
        }
      } catch (error) {
        console.error('Billing: Failed to initialize hardware manager:', error);
      }
      
      // Fetch tax configuration
      const config = await TaxEngine.getTaxConfiguration();
      Billing.taxType = config.default_tax_type || 'exclusive';
      
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
    const comboDiscountAmount = Cart.getComboDiscountAmount ? Cart.getComboDiscountAmount() : 0;
    const discountAmount = Cart.getDiscountAmount();
    const taxableAmount = Cart.getTaxableAmount();
    
    // Use tax engine for calculation
    let taxAmount = 0;
    if (Billing.taxEngine) {
      taxAmount = Billing.taxEngine.calculateTax(taxableAmount, Billing.taxRate / 100, Billing.taxType);
    } else {
      taxAmount = Utils.calculateTax(taxableAmount, Billing.taxRate);
    }
    
    const total = taxableAmount + taxAmount;
    
    // Update UI
    Billing.updateDisplay(subtotal, comboDiscountAmount + discountAmount, taxAmount, total);
    
    return {
      subtotal,
      comboDiscountAmount,
      discountAmount,
      taxableAmount,
      taxAmount,
      taxRate: Billing.taxRate,
      taxType: Billing.taxType,
      total
    };
  },
  
  // Update display elements
  updateDisplay: (subtotal, discountAmount, taxAmount, total) => {
    const subtotalEl = document.getElementById('bill-subtotal');
    const discountEl = document.getElementById('bill-discount');
    const taxEl = document.getElementById('bill-tax');
    const totalEl = document.getElementById('bill-total');
    const taxTypeEl = document.getElementById('bill-tax-type');
    const taxBreakdownEl = document.getElementById('bill-tax-breakdown');
    
    if (subtotalEl) subtotalEl.textContent = Utils.formatCurrency(subtotal);
    if (discountEl) discountEl.textContent = '-' + Utils.formatCurrency(discountAmount);
    if (taxEl) taxEl.textContent = Utils.formatCurrency(taxAmount);
    if (totalEl) totalEl.textContent = Utils.formatCurrency(total);
    
    // Show tax type
    if (taxTypeEl) {
      const taxTypeText = Billing.taxType === 'inclusive' ? ' (Inclusive)' : ' (Exclusive)';
      taxTypeEl.textContent = taxTypeText;
    }
    
    // Show tax breakdown if available
    if (taxBreakdownEl && Billing.taxEngine) {
      const totals = Billing.getTotals();
      const breakdown = Billing.taxEngine.getTaxBreakdown(
        totals.subtotal,
        totals.taxAmount,
        totals.taxRate / 100,
        totals.taxType,
        totals.discountAmount
      );
      
      taxBreakdownEl.innerHTML = `
        <div class="bill-breakdown">
          <div>Subtotal: ${Utils.formatCurrency(breakdown.subtotal)}</div>
          ${breakdown.discount > 0 ? `<div>Discount: -${Utils.formatCurrency(breakdown.discount)}</div>` : ''}
          <div>Taxable Amount: ${Utils.formatCurrency(breakdown.taxable_amount)}</div>
          <div>Tax (${totals.taxRate}%): ${Utils.formatCurrency(breakdown.tax_amount)}</div>
          <div>Total: ${Utils.formatCurrency(breakdown.total)}</div>
        </div>
      `;
    }
  },
  
  // Get current calculations
  getTotals: () => {
    return Billing.calculate();
  },
  
  // Set tax rate
  setTaxRate: (rate, type = 'exclusive') => {
    Billing.taxRate = rate;
    Billing.taxType = type;
    Billing.calculate();
  },
  
  // Set tax type
  setTaxType: (type) => {
    Billing.taxType = type;
    Billing.calculate();
  },
  
  // Display payment information on CFD
  displayPaymentOnCFD: async (orderNumber, amount, paymentMethod, change = 0, loyaltyPoints = 0, discount = 0) => {
    if (!Billing.hardwareManager || !Billing.defaultCFDId) {
      console.log('Billing: No CFD configured, skipping display');
      return;
    }
    
    try {
      const paymentData = {
        orderNumber: orderNumber,
        amount: amount,
        paymentMethod: paymentMethod,
        change: change,
        loyaltyPoints: loyaltyPoints,
        discount: discount
      };
      
      await Billing.hardwareManager.displayOnCFD(Billing.defaultCFDId, paymentData);
      console.log('Billing: Payment information displayed on CFD');
    } catch (error) {
      console.error('Billing: Failed to display payment on CFD:', error);
    }
  },
  
  // Process checkout (with KDS integration and loyalty points)
  processCheckout: async (paymentMode, cashDrawer = {}, loyaltyData = {}, isOnlineOrder = false, onlineOrderData = {}) => {
    if (Cart.isEmpty()) {
      alert('Cart is empty. Please add items first.');
      return null;
    }
    
    const totals = Billing.getTotals();
    const orderNumber = order.generateOrderNumber();
    
    // Handle loyalty points redemption
    let pointsRedeemed = 0;
    let loyaltyDiscount = 0;
    
    if (loyaltyData && loyaltyData.pointsToRedeem && loyaltyData.customerId && loyaltyData.programId) {
      try {
        const LoyaltyManager = require('./loyalty-manager');
        const loyaltyManager = new LoyaltyManager(database);
        
        // Check if customer has enough points
        const customerStatus = await loyaltyManager.getCustomerLoyaltyStatus(loyaltyData.customerId, loyaltyData.programId);
        
        if (!customerStatus) {
          alert('Customer is not enrolled in a loyalty program.');
          return null;
        }
        
        if (customerStatus.points_balance < loyaltyData.pointsToRedeem) {
          alert(`Insufficient points. Customer has ${customerStatus.points_balance} points, ${loyaltyData.pointsToRedeem} required.`);
          return null;
        }
        
        // Calculate discount value (assuming 1 point = 1 currency unit for simplicity)
        loyaltyDiscount = loyaltyData.pointsToRedeem;
        pointsRedeemed = loyaltyData.pointsToRedeem;
        
        // Update totals with loyalty discount
        const finalTotal = totals.total - loyaltyDiscount;
        
        // Update order data with loyalty information
        orderData.loyalty_points_redeemed = pointsRedeemed;
        orderData.loyalty_discount = loyaltyDiscount;
        orderData.final_total = finalTotal;
      } catch (error) {
        console.error('Error processing loyalty points:', error);
        alert('Error processing loyalty points: ' + error.message);
        return null;
      }
    }
    
    const orderData = {
      orderNumber,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      discountType: Cart.discountType,
      taxAmount: totals.taxAmount,
      taxRate: totals.taxRate,
      totalAmount: totals.total,
      loyalty_points_redeemed: pointsRedeemed,
      loyalty_discount: loyaltyDiscount,
      final_total: totals.total - loyaltyDiscount,
      paymentMode,
      paymentStatus: 'paid',
      status: 'pending',
      notes: '',
      // Online order fields
      online_order_provider_id: isOnlineOrder ? onlineOrderData.providerId : null,
      online_order_external_id: isOnlineOrder ? onlineOrderData.externalOrderId : null,
      online_order_customer_name: isOnlineOrder ? onlineOrderData.customerName : null,
      online_order_customer_phone: isOnlineOrder ? onlineOrderData.customerPhone : null,
      online_order_customer_email: isOnlineOrder ? onlineOrderData.customerEmail : null,
      online_order_delivery_address: isOnlineOrder ? onlineOrderData.deliveryAddress : null,
      online_order_instructions: isOnlineOrder ? onlineOrderData.instructions : null,
      online_order_payment_method: isOnlineOrder ? paymentMode : null,
      online_order_expected_delivery_time: isOnlineOrder ? onlineOrderData.expectedDeliveryTime : null
    };
    
    // Create order in database
    const orderId = order.create(orderData);
    
    // Process loyalty points redemption if applicable
    if (pointsRedeemed > 0 && loyaltyData.customerId && loyaltyData.programId) {
      try {
        const LoyaltyManager = require('./loyalty-manager');
        const loyaltyManager = new LoyaltyManager(database);
        
        await loyaltyManager.redeemPoints(
          loyaltyData.customerId,
          loyaltyData.programId,
          orderId,
          pointsRedeemed,
          `Redeemed for order ${orderNumber}`
        );
      } catch (error) {
        console.error('Error redeeming loyalty points:', error);
        // Don't fail the order if points redemption fails
      }
    }
    
    // Add order items
    const orderItems = Cart.getOrderItems();
    
    // Process recipe-based items first to check inventory
    for (const item of orderItems) {
      if (item.recipe_id) {
        try {
          // Check if recipe has sufficient ingredients
          const RecipeManager = require('./recipe-manager');
          const recipeManager = new RecipeManager(database, null);
          const availability = await recipeManager.checkIngredientAvailability(item.recipe_id, item.quantity);
          
          if (!availability.is_available) {
            alert(`Cannot complete order. Insufficient ingredients for ${item.name}.\n\n${availability.availability_details.map(d => `${d.ingredient_name}: ${d.available_quantity} ${d.unit} available, ${d.required_quantity} ${d.unit} needed`).join('\n')}`);
            return null;
          }
        } catch (error) {
          console.error('Error checking recipe availability:', error);
          alert(`Error checking ingredients for ${item.name}: ${error.message}`);
          return null;
        }
      }
    }
    
    const createdOrderItems = [];
    orderItems.forEach(item => {
      const orderItemId = order.addItem(orderId, item);
      createdOrderItems.push({
        id: orderItemId,
        ...item
      });
    });
    
    // Deduct recipe ingredients from inventory
    try {
      const RecipeManager = require('./recipe-manager');
      const InventoryManager = require('./inventory-manager');
      const inventoryManager = new InventoryManager(database);
      const recipeManager = new RecipeManager(database, inventoryManager);
      
      for (const item of createdOrderItems) {
        if (item.recipe_id) {
          await recipeManager.deductIngredientsFromInventory(
            item.recipe_id,
            item.quantity,
            orderId,
            item.id
          );
        }
      }
    } catch (error) {
      console.error('Error deducting recipe ingredients:', error);
      // Don't fail the order, just log the error
    }
    
    try {
      // Submit order to KDS for kitchen display
      const kdsResponse = await fetch('/api/kds/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          items: orderItems,
          priority: false, // Not priority by default for paid orders
          notes: orderData.notes
        })
      });
      
      if (kdsResponse.ok) {
        const kdsResult = await kdsResponse.json();
        orderData.kdsOrderId = kdsResult.kds_order_id;
      }
    } catch (error) {
      console.error('Failed to submit to KDS (order will be processed without KDS):', error);
    }
    
    // Process payment with cash drawer if applicable
    if (paymentMode === 'cash' && cashDrawer.sessionId) {
      await Billing.processCashPayment(orderId, totals.total, cashDrawer);
    }
    
    // Process loyalty points earning after successful payment
    if (loyaltyData && loyaltyData.customerId && loyaltyData.programId) {
      try {
        const LoyaltyManager = require('./loyalty-manager');
        const loyaltyManager = new LoyaltyManager(database);
        
        // Calculate points to earn (excluding loyalty discount from total)
        const amountForPoints = totals.total - loyaltyDiscount;
        const pointsCalculation = await loyaltyManager.calculatePointsToEarn(
          loyaltyData.programId,
          amountForPoints,
          loyaltyData.customerId
        );
        
        if (pointsCalculation.points > 0) {
          await loyaltyManager.earnPoints(
            loyaltyData.customerId,
            loyaltyData.programId,
            orderId,
            pointsCalculation.points,
            `Earned for order ${orderNumber}`
          );
          
          // Update order with points earned
          await database.run(
            'UPDATE orders SET loyalty_points_earned = ?, loyalty_program_id = ? WHERE id = ?',
            [pointsCalculation.points, loyaltyData.programId, orderId]
          );
          
          // Update orderData for return
          orderData.loyalty_points_earned = pointsCalculation.points;
        }
      } catch (error) {
        console.error('Error earning loyalty points:', error);
        // Don't fail the order if points earning fails
      }
    }
    
    // Clear cart after successful order
    Cart.clear();
    
    // Display payment information on CFD
    try {
      const finalAmount = orderData.final_total;
      const finalLoyaltyDiscount = orderData.loyalty_discount || 0;
      
      await Billing.displayPaymentOnCFD(
        orderNumber,
        finalAmount,
        paymentMode,
        0, // Change will be calculated separately for cash
        pointsEarned,
        finalLoyaltyDiscount
      );
    } catch (error) {
      console.error('Error displaying payment on CFD:', error);
      // Don't fail the order if CFD display fails
    }
    
    // Send digital receipts if enabled
    try {
      const DigitalReceiptManager = require('./digital-receipt-manager');
      const digitalReceiptManager = new DigitalReceiptManager();
      
      // Check if digital receipts should be sent automatically
      const shouldSendDigitalReceipts = await Billing.shouldSendDigitalReceipts();
      
      if (shouldSendDigitalReceipts) {
        await digitalReceiptManager.sendAllDigitalReceipts(orderId);
      }
    } catch (error) {
      console.error('Error sending digital receipts:', error);
      // Don't fail the order if digital receipt sending fails
    }
    
    return {
      orderId,
      orderNumber,
      ...orderData,
      items: orderItems
    };
  },
  
  // Check if digital receipts should be sent automatically
  shouldSendDigitalReceipts: async () => {
    try {
      // Check system settings for digital receipt preference
      const response = await fetch('http://localhost:3000/api/settings/digital_receipts');
      if (response.ok) {
        const settings = await response.json();
        return settings.auto_send || false;
      }
      return false;
    } catch (error) {
      console.error('Error checking digital receipt settings:', error);
      return false;
    }
  },
  
  // Send digital receipt for an order
  sendDigitalReceipt: async (orderId, receiptType = 'all', templateId = null) => {
    try {
      const DigitalReceiptManager = require('./digital-receipt-manager');
      const digitalReceiptManager = new DigitalReceiptManager();
      
      if (receiptType === 'all') {
        return await digitalReceiptManager.sendAllDigitalReceipts(orderId, true);
      } else {
        return await digitalReceiptManager.sendDigitalReceipt(orderId, receiptType, templateId, true);
      }
    } catch (error) {
      console.error('Error sending digital receipt:', error);
      throw error;
    }
  },
  
  // Process cash payment and record in cash drawer
  processCashPayment: async (orderId, amount, cashDrawer) => {
    try {
      const { sessionId, cashDrawerId } = cashDrawer;
      
      // Create payment record
      const paymentResult = await database.run(
        'INSERT INTO payments (order_id, amount, payment_method, status, created_at, cash_drawer_id, session_id) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)',
        [orderId, amount, 'cash', 'completed', cashDrawerId, sessionId]
      );
      
      const paymentId = paymentResult.lastID;
      
      // Record transaction in cash drawer
      const CashDrawerManager = require('./cash-drawer-manager');
      const cashDrawerManager = new CashDrawerManager(database, console);
      
      await cashDrawerManager.recordTransaction({
        session_id: sessionId,
        transaction_type: 'PAYMENT',
        amount: amount,
        reference_id: paymentId,
        reference_type: 'payment',
        description: `Order #${order.generateOrderNumber()}`
      });
      
      return { success: true, paymentId };
    } catch (error) {
      console.error('Error processing cash payment:', error);
      throw error;
    }
  },
  
  // Generate bill HTML
  generateBill: (orderData) => {
    const order = order.getWithItems(orderData.orderId || orderData.id);
    if (!order) return '';
    
    const items = order.items || [];
    const tables = order.table_id ? TableManager.getByOrderId(order.id) : [];
    const buzzers = order.buzzer_id ? BuzzerManager.getByOrderId(order.id) : [];
    
    // Group items by combo
    const comboGroups = {};
    const nonComboItems = [];
    
    items.forEach(item => {
      if (item.combo_id) {
        if (!comboGroups[item.combo_id]) {
          comboGroups[item.combo_id] = {
            combo_id: item.combo_id,
            items: []
          };
        }
        comboGroups[item.combo_id].items.push(item);
      } else {
        nonComboItems.push(item);
      }
    });
    
    let itemsHtml = '';
    
    // Render non-combo items first
    nonComboItems.forEach(item => {
      let itemName = `${item.quantity}x ${item.name}`;
      
      // Add weight information if available
      if (item.item_weight) {
        itemName += ` (${item.item_weight} ${item.weight_unit || 'g'})`;
      }
      
      itemsHtml += `
        <div class="bill-item">
          <span class="bill-item-name">${itemName}</span>
          <span class="bill-item-price">${Utils.formatCurrency(item.total_price)}</span>
        </div>
      `;
      
      if (item.modifiers && item.modifiers.length > 0) {
        item.modifiers.forEach(modifier => {
          const modifierTotal = modifier.price * modifier.quantity;
          itemsHtml += `
            <div class="bill-item">
              <span class="bill-item-name">&nbsp;&nbsp;${modifier.quantity}x ${modifier.name}</span>
              <span class="bill-item-price">${Utils.formatCurrency(modifierTotal)}</span>
            </div>
          `;
        });
      }
    });
    
    // Render combo items
    Object.values(comboGroups).forEach(comboGroup => {
      itemsHtml += `<div class="bill-combo-header">Combo Items</div>`;
      comboGroup.items.forEach(item => {
        let itemName = `${item.quantity}x ${item.name}`;
        
        // Add weight information if available
        if (item.item_weight) {
          itemName += ` (${item.item_weight} ${item.weight_unit || 'g'})`;
        }
        
        itemsHtml += `
          <div class="bill-item">
            <span class="bill-item-name">${itemName}</span>
            <span class="bill-item-price">${Utils.formatCurrency(item.total_price)}</span>
          </div>
        `;
        
        if (item.modifiers && item.modifiers.length > 0) {
          item.modifiers.forEach(modifier => {
            const modifierTotal = modifier.price * modifier.quantity;
            itemsHtml += `
              <div class="bill-item">
                <span class="bill-item-name">&nbsp;&nbsp;${modifier.quantity}x ${modifier.name}</span>
                <span class="bill-item-price">${Utils.formatCurrency(modifierTotal)}</span>
              </div>
            `;
          });
        }
      });
    });
    
    // Generate table/buzzer info
    let tableBuzzerInfo = '';
    if (tables.length > 0) {
      tableBuzzerInfo += tables.map(t => `Table: ${t.table_number}`).join(', ');
    }
    if (buzzers.length > 0) {
      if (tableBuzzerInfo) tableBuzzerInfo += ' | ';
      tableBuzzerInfo += buzzers.map(b => `Buzzer: ${b.buzzer_number}`).join(', ');
    }
    
    return `
      <div class="bill-header">
        <h2>☕ COFFEE CAFE</h2>
        <p>Taste the Difference</p>
        <p>GST No: 27AABCD1234D1Z5</p>
      </div>
      ${tableBuzzerInfo ? `<div class="bill-table-buzzer">${tableBuzzerInfo}</div>` : ''}
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
        ${order.combo_discount_amount > 0 ? `
        <div class="bill-row">
          <span>Combo Discount:</span>
          <span>-${Utils.formatCurrency(order.combo_discount_amount)}</span>
        </div>
        ` : ''}
        ${order.discount_amount > 0 ? `
        <div class="bill-row">
          <span>Discount:</span>
          <span>-${Utils.formatCurrency(order.discount_amount)}</span>
        </div>
        ` : ''}
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

  // Generate split bill HTML for a specific split
  generateSplitBill: (orderData, splitNumber, splitItems, splitTotal, customerInfo = null) => {
    const order = order.getWithItems(orderData.orderId || orderData.id);
    if (!order) return '';
    
    const tables = order.table_id ? TableManager.getByOrderId(order.id) : [];
    const buzzers = order.buzzer_id ? BuzzerManager.getByOrderId(order.id) : [];
    
    let itemsHtml = '';
    
    splitItems.forEach(item => {
      let itemName = `${item.quantity}x ${item.product_name}`;
      
      // Add weight information if available
      if (item.item_weight) {
        itemName += ` (${item.item_weight} ${item.weight_unit || 'g'})`;
      }
      
      itemsHtml += `
        <div class="bill-item">
          <span class="bill-item-name">${itemName}</span>
          <span class="bill-item-price">${Utils.formatCurrency(item.total_amount)}</span>
        </div>
      `;
      
      if (item.modifiers && item.modifiers.length > 0) {
        item.modifiers.forEach(modifier => {
          const modifierTotal = modifier.price * modifier.quantity;
          itemsHtml += `
            <div class="bill-item">
              <span class="bill-item-name">&nbsp;&nbsp;${modifier.quantity}x ${modifier.name}</span>
              <span class="bill-item-price">${Utils.formatCurrency(modifierTotal)}</span>
            </div>
          `;
        });
      }
    });
    
    // Generate table/buzzer info
    let tableBuzzerInfo = '';
    if (tables.length > 0) {
      tableBuzzerInfo += tables.map(t => `Table: ${t.table_number}`).join(', ');
    }
    if (buzzers.length > 0) {
      if (tableBuzzerInfo) tableBuzzerInfo += ' | ';
      tableBuzzerInfo += buzzers.map(b => `Buzzer: ${b.buzzer_number}`).join(', ');
    }
    
    // Customer info if available
    let customerInfoHtml = '';
    if (customerInfo) {
      customerInfoHtml = `
        <div class="bill-customer">
          <p>Customer: ${customerInfo.customer_name || 'N/A'}</p>
          ${customerInfo.customer_contact ? `<p>Contact: ${customerInfo.customer_contact}</p>` : ''}
        </div>
      `;
    }
    
    return `
      <div class="bill-header">
        <h2>☕ COFFEE CAFE</h2>
        <p>Taste the Difference</p>
        <p>GST No: 27AABCD1234D1Z5</p>
      </div>
      ${tableBuzzerInfo ? `<div class="bill-table-buzzer">${tableBuzzerInfo}</div>` : ''}
      <div class="bill-split-info">
        <p><strong>Split Bill #${splitNumber}</strong></p>
      </div>
      ${customerInfoHtml}
      <hr class="bill-divider">
      <div class="bill-items">
        ${itemsHtml}
      </div>
      <hr class="bill-divider">
      <div class="bill-totals">
        <div class="bill-row">
          <span>Subtotal:</span>
          <span>${Utils.formatCurrency(splitTotal)}</span>
        </div>
        <div class="bill-row bill-total-row">
          <span>Total:</span>
          <span>${Utils.formatCurrency(splitTotal)}</span>
        </div>
      </div>
      <hr class="bill-divider">
      <div class="bill-footer">
        <p>Order No: ${order.order_number}</p>
        <p>Split No: ${splitNumber}</p>
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
  },

  // Request void/refund for an order
  requestVoidRefund: async (params) => {
    try {
      if (!Billing.voidRefundManager) {
        throw new Error('Void/Refund manager not initialized');
      }
      
      return await Billing.voidRefundManager.requestVoidRefund(params);
    } catch (error) {
      console.error('Error requesting void/refund:', error);
      throw error;
    }
  },

  // Approve void/refund request
  approveVoidRefund: async (params) => {
    try {
      if (!Billing.voidRefundManager) {
        throw new Error('Void/Refund manager not initialized');
      }
      
      return await Billing.voidRefundManager.approveVoidRefund(params);
    } catch (error) {
      console.error('Error approving void/refund:', error);
      throw error;
    }
  },

  // Process void/refund request
  processVoidRefund: async (params) => {
    try {
      if (!Billing.voidRefundManager) {
        throw new Error('Void/Refund manager not initialized');
      }
      
      return await Billing.voidRefundManager.processVoidRefund(params);
    } catch (error) {
      console.error('Error processing void/refund:', error);
      throw error;
    }
  },

  // Get void/refund reasons
  getVoidRefundReasons: async () => {
    try {
      if (!Billing.voidRefundManager) {
        throw new Error('Void/Refund manager not initialized');
      }
      
      return await Billing.voidRefundManager.getVoidRefundReasons();
    } catch (error) {
      console.error('Error getting void/refund reasons:', error);
      throw error;
    }
  },

  // Get void/refund history for an order
  getVoidRefundHistory: async (orderId) => {
    try {
      if (!Billing.voidRefundManager) {
        throw new Error('Void/Refund manager not initialized');
      }
      
      return await Billing.voidRefundManager.getVoidRefundHistory(orderId);
    } catch (error) {
      console.error('Error getting void/refund history:', error);
      throw error;
    }
  },

  // Generate void/refund receipt
  generateVoidRefundReceipt: (orderData, voidRefundData) => {
    const order = order.getWithItems(orderData.orderId || orderData.id);
    if (!order) return '';
    
    const items = order.items || [];
    const voidedItems = items.filter(item => item.item_void_status !== 'ACTIVE');
    
    let itemsHtml = '';
    
    voidedItems.forEach(item => {
      let itemName = `${item.quantity}x ${item.name}`;
      
      if (item.item_weight) {
        itemName += ` (${item.item_weight} ${item.weight_unit || 'g'})`;
      }
      
      itemsHtml += `
        <div class="bill-item">
          <span class="bill-item-name">VOID ${itemName}</span>
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
          <span>Reason:</span>
          <span>${voidRefundData.reason_code} - ${voidRefundData.reason_description}</span>
        </div>
        <div class="bill-row">
          <span>Requested By:</span>
          <span>${voidRefundData.requested_by_name}</span>
        </div>
        ${voidRefundData.approved_by_name ? `
        <div class="bill-row">
          <span>Approved By:</span>
          <span>${voidRefundData.approved_by_name}</span>
        </div>
        ` : ''}
        <div class="bill-row">
          <span>Date:</span>
          <span>${Utils.formatDate(voidRefundData.processed_at || voidRefundData.requested_at)}</span>
        </div>
        <div class="bill-row">
          <span>Time:</span>
          <span>${Utils.formatTime(voidRefundData.processed_at || voidRefundData.requested_at)}</span>
        </div>
      </div>
      <hr class="bill-divider">
      <div class="bill-footer">
        <p><strong>VOID/REFUND RECEIPT</strong></p>
        <p>Order No: ${order.order_number}</p>
        <p style="margin-top: 12px;">Thank you!</p>
      </div>
    `;
  },

  // Print void/refund receipt
  printVoidRefundReceipt: (orderData, voidRefundData) => {
    const receiptHtml = Billing.generateVoidRefundReceipt(orderData, voidRefundData);
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Void/Refund Receipt - ${orderData.orderNumber}</title>
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
          ${receiptHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }
};

// Export billing module
window.Billing = Billing;
