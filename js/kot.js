// Kitchen Order Ticket (KOT) module for Cafe POS
// Now integrated with KDS (Kitchen Display System) and ESC/POS Printers

const KOT = {
  tickets: [],
  hardwareManager: null,
  defaultPrinterId: null,
  
  // Load all active KOTs
  loadTickets: () => {
    KOT.tickets = kot.getAll();
  },
  
  // Render KOT tickets
  render: () => {
    const container = document.getElementById('kot-grid');
    if (!container) return;
    
    KOT.loadTickets();
    
    if (KOT.tickets.length === 0) {
      container.innerHTML = `
        <div class="empty-kot">
          <span>👨‍🍳</span>
          <p>No active kitchen orders</p>
          <p class="hint">Orders will appear here when sent to kitchen</p>
        </div>
      `;
      return;
    }
    
    let html = '';
    KOT.tickets.forEach(async ticket => {
      const statusClass = ticket.status;
      const statusText = ticket.status.toUpperCase();
      
      // Get order items for this ticket
      const order = order.getWithItems(ticket.order_id);
      const items = order?.items || [];
      
      let itemsHtml = '';
      
      // Check if this is a split bill order
      const isSplitBill = order?.split_status === 'split';
      
      // Check if order is voided
      const isVoided = order?.void_status !== 'ACTIVE';
      
      // Group items by combo for KOT display
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
      
      // Render non-combo items
      nonComboItems.forEach(item => {
        let itemName = `${item.quantity}x ${item.name}`;
        
        // Add weight information if available
        if (item.item_weight) {
          itemName += ` (${item.item_weight} ${item.weight_unit || 'g'})`;
        }
        
        // Add split number if this is a split bill
        if (isSplitBill && item.split_number) {
          itemName += ` [Split ${item.split_number}]`;
        }
        
        // Add void indicator if item is voided
        if (item.item_void_status !== 'ACTIVE') {
          itemName = `VOID ${itemName}`;
        }
        
        itemsHtml += `
          <div class="kot-item ${item.item_void_status !== 'ACTIVE' ? 'kot-item-voided' : ''}">
            <span>${itemName}</span>
          </div>
        `;
      });
      
      // Render combo items together
      Object.values(comboGroups).forEach(comboGroup => {
        itemsHtml += `<div class="kot-combo-header">[COMBO]</div>`;
        comboGroup.items.forEach(item => {
          let itemName = `${item.quantity}x ${item.name}`;
          
          // Add weight information if available
          if (item.item_weight) {
            itemName += ` (${item.item_weight} ${item.weight_unit || 'g'})`;
          }
          
          // Add split number if this is a split bill
          if (isSplitBill && item.split_number) {
            itemName += ` [Split ${item.split_number}]`;
          }
          
          // Add void indicator if item is voided
          if (item.item_void_status !== 'ACTIVE') {
            itemName = `VOID ${itemName}`;
          }
          
          itemsHtml += `
            <div class="kot-item ${item.item_void_status !== 'ACTIVE' ? 'kot-item-voided' : ''}">
              <span>${itemName}</span>
            </div>
          `;
        });
      });
      
      const notes = ticket.notes || order?.notes || '';
      const tableBuzzerInfo = await KOT.getOrderTableBuzzerInfo(ticket.order_id);
      const loyaltyInfo = await KOT.getOrderLoyaltyInfo(ticket.order_id);
      
      // Add split bill indicator
      let splitInfo = '';
      if (isSplitBill) {
        splitInfo = `<div class="kot-split-info">[SPLIT BILL]</div>`;
      }
      
      // Add void indicator
      let voidInfo = '';
      if (isVoided) {
        voidInfo = `<div class="kot-void-info">[VOIDED]</div>`;
      }
      
      // Add loyalty info
      let loyaltyInfoHtml = '';
      if (loyaltyInfo) {
        loyaltyInfoHtml = `<div class="kot-loyalty">${loyaltyInfo}</div>`;
      }
      
      html += `
        <div class="kot-ticket ${statusClass} ${isVoided ? 'kot-ticket-voided' : ''}">
          <div class="kot-header">
            <span class="kot-number">#${ticket.ticket_number}</span>
            <span class="kot-status ${statusClass}">${statusText}</span>
          </div>
          ${tableBuzzerInfo ? `<div class="kot-table-buzzer">${tableBuzzerInfo}</div>` : ''}
          ${loyaltyInfoHtml}
          ${splitInfo}
          ${voidInfo}
          <div class="kot-items">
            ${itemsHtml}
          </div>
          ${notes ? `<div class="kot-notes">Note: ${notes}</div>` : ''}
          <div class="kot-time">${Utils.formatTime(ticket.created_at)}</div>
          <div class="kot-actions">
            ${KOT.getActionButtons(ticket, isVoided)}
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  },
  
  // Get action buttons based on current status
  getActionButtons: (ticket, isVoided = false) => {
    const status = ticket.status;
    let buttons = '';
    
    if (isVoided) {
      buttons = `<span class="kot-voided-label">Order Voided</span>`;
    } else if (status === 'pending') {
      buttons = `<button class="btn btn-small btn-primary" onclick="KOT.updateStatus(${ticket.id}, 'preparing')">Start Preparing</button>`;
    } else if (status === 'preparing') {
      buttons = `<button class="btn btn-small btn-success" onclick="KOT.updateStatus(${ticket.id}, 'ready')">Mark Ready</button>`;
    } else if (status === 'ready') {
      buttons = `<button class="btn btn-small btn-secondary" onclick="KOT.updateStatus(${ticket.id}, 'served')">Served</button>`;
    }
    
    return buttons;
  },
  
  // Update KOT status
  updateStatus: (ticketId, newStatus) => {
    kot.updateStatus(ticketId, newStatus);
    KOT.render();
    
    // If served, refresh order history to show updated status
    if (typeof History !== 'undefined') {
      History.render();
    }
  },
  
  // Create new KOT from order
  createFromOrder: async (orderId, notes = '') => {
    const result = kot.create(orderId, notes);
    KOT.render();
    return result;
  },
  
  // Get table/buzzer info for order
  getOrderTableBuzzerInfo: async (orderId) => {
    try {
      const tables = await TableManager.getByOrderId(orderId);
      const buzzers = await BuzzerManager.getByOrderId(orderId);
      
      let info = '';
      if (tables.length > 0) {
        info += tables.map(t => `Table: ${t.table_number}`).join(', ');
      }
      if (buzzers.length > 0) {
        if (info) info += ' | ';
        info += buzzers.map(b => `Buzzer: ${b.buzzer_number}`).join(', ');
      }
      
      return info;
    } catch (error) {
      console.error('Error fetching table/buzzer info:', error);
      return '';
    }
  },
  
  // Get loyalty info for order
  getOrderLoyaltyInfo: async (orderId) => {
    try {
      const order = order.getWithItems(orderId);
      if (!order) return '';
      
      // Check if order has loyalty information
      if (!order.loyalty_program_id) return '';
      
      const LoyaltyManager = require('./loyalty-manager');
      const loyaltyManager = new LoyaltyManager(database);
      
      const program = await loyaltyManager.getProgram(order.loyalty_program_id);
      
      if (!program) return '';
      
      let info = `Loyalty: ${program.name}`;
      
      if (order.loyalty_points_earned > 0) {
        info += ` | Earned: ${order.loyalty_points_earned} pts`;
      }
      
      if (order.loyalty_points_redeemed > 0) {
        info += ` | Redeemed: ${order.loyalty_points_redeemed} pts`;
      }
      
      return info;
    } catch (error) {
      console.error('Error fetching loyalty info:', error);
      return '';
    }
  },
  
  // Send order to kitchen (via KDS)
  sendToKitchen: async () => {
    if (Cart.isEmpty()) {
      alert('Cart is empty. Please add items first.');
      return;
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
      taxType: totals.taxType || 'exclusive',
      totalAmount: totals.total,
      paymentMode: 'pending',
      paymentStatus: 'unpaid',
      status: 'pending',
      notes: ''
    };
    
    // Create order (without payment for KOT)
    const orderId = order.create(orderData);
    
    // Add order items
    const orderItems = Cart.getOrderItems();
    orderItems.forEach(item => {
      order.addItem(orderId, item);
    });
    
    try {
      // Submit order to KDS instead of just creating KOT
      const kdsOrder = await fetch('/api/kds/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          items: orderItems,
          priority: Cart.priority || false,
          notes: orderData.notes
        })
      });
      
      if (kdsOrder.ok) {
        const result = await kdsOrder.json();
        
        // Create KOT ticket
        KOT.createFromOrder(orderId);
        
        // Clear cart
        Cart.clear();
        
        // Show success message
        alert(`Order ${orderNumber} sent to KDS!`);
        
        // Refresh KOT display
        KOT.render();
        
        return { orderId, orderNumber, kdsOrderId: result.kds_order_id };
      } else {
        const error = await kdsOrder.json();
        alert(`Failed to send to KDS: ${error.message || 'Unknown error'}`);
        
        // Fallback to traditional KOT
        KOT.createFromOrder(orderId);
        alert(`Order ${orderNumber} sent to kitchen (KDS unavailable)`);
        
        return { orderId, orderNumber };
      }
    } catch (error) {
      console.error('Error sending to KDS:', error);
      alert(`Failed to send to KDS: ${error.message}`);
      
      // Fallback to traditional KOT
      KOT.createFromOrder(orderId);
      alert(`Order ${orderNumber} sent to kitchen (KDS unavailable)`);
      
      return { orderId, orderNumber };
    }
  },
  
  // Initialize hardware manager
  initHardware: async () => {
    try {
      // Load hardware manager
      const hardwareManager = require('./hardware-manager');
      await hardwareManager.initialize();
      KOT.hardwareManager = hardwareManager;
      
      // Get default printer for KOT
      const printers = await KOT.hardwareManager.database.query(
        'SELECT id FROM hardware_devices WHERE device_type = "escpos_printer" AND is_active = 1 LIMIT 1'
      );
      
      if (printers.length > 0) {
        KOT.defaultPrinterId = printers[0].id;
        console.log('KOT: Default printer configured');
      }
    } catch (error) {
      console.error('KOT: Failed to initialize hardware manager:', error);
    }
  },
  
  // Print KOT to ESC/POS printer
  printKOT: async (orderId) => {
    if (!KOT.hardwareManager || !KOT.defaultPrinterId) {
      console.log('KOT: No printer configured, skipping print');
      return;
    }
    
    try {
      const order = order.getWithItems(orderId);
      if (!order) {
        console.error('KOT: Order not found');
        return;
      }
      
      const kotData = {
        orderNumber: order.order_number || 'N/A',
        tableNumber: order.table_number || 'N/A',
        time: new Date(order.created_at).toLocaleTimeString(),
        items: order.items.map(item => ({
          quantity: item.quantity,
          name: item.name,
          specialInstructions: item.special_instructions || ''
        }))
      };
      
      await KOT.hardwareManager.printKOT(KOT.defaultPrinterId, kotData);
      console.log('KOT: Printed successfully');
    } catch (error) {
      console.error('KOT: Failed to print:', error);
    }
  },
  
  // Setup event listeners
  setupEventListeners: () => {
    // Initialize hardware on page load
    if (typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        KOT.initHardware();
      });
    }
    
    // KOT button
    const kotBtn = document.getElementById('kot-btn');
    if (kotBtn) {
      kotBtn.addEventListener('click', () => {
        KOT.sendToKitchen();
      });
    }
    
    // KOT view button
    const kotViewBtn = document.getElementById('kot-view-btn');
    if (kotViewBtn) {
      kotViewBtn.addEventListener('click', () => {
        KOT.render();
        document.getElementById('kot-modal').classList.add('active');
      });
    }
  },
  
  // Refresh KOT display
  refresh: () => {
    KOT.render();
  }
};

// Export KOT module
window.KOT = KOT;
