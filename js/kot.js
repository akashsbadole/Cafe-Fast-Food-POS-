// Kitchen Order Ticket (KOT) module for Cafe POS

const KOT = {
  tickets: [],
  
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
    KOT.tickets.forEach(ticket => {
      const statusClass = ticket.status;
      const statusText = ticket.status.toUpperCase();
      
      // Get order items for this ticket
      const order = order.getWithItems(ticket.order_id);
      const items = order?.items || [];
      
      let itemsHtml = '';
      items.forEach(item => {
        itemsHtml += `
          <div class="kot-item">
            <span>${item.quantity}x ${item.name}</span>
          </div>
        `;
      });
      
      const notes = ticket.notes || order?.notes || '';
      
      html += `
        <div class="kot-ticket ${statusClass}">
          <div class="kot-header">
            <span class="kot-number">#${ticket.ticket_number}</span>
            <span class="kot-status ${statusClass}">${statusText}</span>
          </div>
          <div class="kot-items">
            ${itemsHtml}
          </div>
          ${notes ? `<div class="kot-notes">Note: ${notes}</div>` : ''}
          <div class="kot-time">${Utils.formatTime(ticket.created_at)}</div>
          <div class="kot-actions">
            ${KOT.getActionButtons(ticket)}
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  },
  
  // Get action buttons based on current status
  getActionButtons: (ticket) => {
    const status = ticket.status;
    let buttons = '';
    
    if (status === 'pending') {
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
  createFromOrder: (orderId, notes = '') => {
    const result = kot.create(orderId, notes);
    KOT.render();
    return result;
  },
  
  // Send order to kitchen
  sendToKitchen: () => {
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
    
    // Create KOT ticket
    KOT.createFromOrder(orderId);
    
    // Clear cart
    Cart.clear();
    
    // Show success message
    alert(`Order ${orderNumber} sent to kitchen!`);
    
    // Refresh KOT display
    KOT.render();
    
    return { orderId, orderNumber };
  },
  
  // Setup event listeners
  setupEventListeners: () => {
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
