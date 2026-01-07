// Order History module for Cafe POS

const History = {
  orders: [],
  currentFilter: 'today',
  searchQuery: '',
  
  // Load orders based on filter
  loadOrders: () => {
    if (History.currentFilter === 'today') {
      History.orders = order.getTodayOrders();
    } else {
      History.orders = order.getAllOrders();
    }
    
    // Apply search filter
    if (History.searchQuery) {
      const query = History.searchQuery.toLowerCase();
      History.orders = History.orders.filter(o => 
        o.order_number.toLowerCase().includes(query)
      );
    }
  },
  
  // Render order history
  render: () => {
    const container = document.getElementById('history-list');
    if (!container) return;
    
    History.loadOrders();
    
    if (History.orders.length === 0) {
      container.innerHTML = `
        <div class="empty-history">
          <span>📋</span>
          <p>No orders found</p>
        </div>
      `;
      return;
    }
    
    let html = '';
    History.orders.forEach(orderItem => {
      const statusClass = orderItem.payment_status === 'paid' ? 'paid' : 'unpaid';
      const statusText = orderItem.payment_status === 'paid' ? 'PAID' : 'UNPAID';
      
      html += `
        <div class="history-item" onclick="History.showOrderDetails(${orderItem.id})">
          <div class="history-info">
            <h4>${orderItem.order_number}</h4>
            <p>${Utils.formatDateTime(orderItem.created_at)}</p>
            <p>${orderItem.items_count || 'View details'}</p>
          </div>
          <div class="history-amount">
            <div class="total">${Utils.formatCurrency(orderItem.total_amount)}</div>
            <span class="status ${statusClass}">${statusText}</span>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  },
  
  // Show order details
  showOrderDetails: (orderId) => {
    const order = order.getWithItems(orderId);
    if (!order) return;
    
    const container = document.getElementById('order-details');
    if (!container) return;
    
    let itemsHtml = '';
    order.items.forEach(item => {
      itemsHtml += `
        <div class="bill-item">
          <span class="bill-item-name">${item.quantity}x ${item.name}</span>
          <span class="bill-item-price">${Utils.formatCurrency(item.total_price)}</span>
        </div>
      `;
    });
    
    container.innerHTML = `
      <div class="order-header">
        <h2>${order.order_number}</h2>
        <p class="order-meta">
          ${Utils.formatDateTime(order.created_at)}
        </p>
      </div>
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
          <span>Tax (${order.tax_rate}%):</span>
          <span>${Utils.formatCurrency(order.tax_amount)}</span>
        </div>
        <div class="bill-row bill-total-row">
          <span>Total:</span>
          <span>${Utils.formatCurrency(order.total_amount)}</span>
        </div>
        <div class="bill-row" style="margin-top: 8px;">
          <span>Payment Mode:</span>
          <span>${order.payment_mode.toUpperCase()}</span>
        </div>
        <div class="bill-row">
          <span>Payment Status:</span>
          <span>${order.payment_status.toUpperCase()}</span>
        </div>
      </div>
    `;
    
    // Store order ID for reprint
    document.getElementById('reprint-bill-btn').dataset.orderId = orderId;
    
    document.getElementById('order-details-modal').classList.add('active');
  },
  
  // Reprint bill
  reprintBill: () => {
    const btn = document.getElementById('reprint-bill-btn');
    const orderId = parseInt(btn.dataset.orderId);
    
    if (orderId) {
      const orderData = order.getWithItems(orderId);
      if (orderData) {
        Billing.printBill(orderData);
      }
    }
  },
  
  // Setup event listeners
  setupEventListeners: () => {
    // History button
    const historyBtn = document.getElementById('history-btn');
    if (historyBtn) {
      historyBtn.addEventListener('click', () => {
        History.render();
        document.getElementById('history-modal').classList.add('active');
      });
    }
    
    // Filter buttons
    const filterContainer = document.querySelector('.history-filters');
    if (filterContainer) {
      filterContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-small')) {
          document.querySelectorAll('.history-filters .btn-small').forEach(btn => {
            btn.classList.remove('active');
          });
          e.target.classList.add('active');
          
          History.currentFilter = e.target.dataset.filter;
          History.render();
        }
      });
    }
    
    // Search input
    const orderSearch = document.getElementById('order-search');
    if (orderSearch) {
      orderSearch.addEventListener('input', (e) => {
        History.searchQuery = e.target.value;
        History.render();
      });
    }
    
    // Reprint button
    const reprintBtn = document.getElementById('reprint-bill-btn');
    if (reprintBtn) {
      reprintBtn.addEventListener('click', () => {
        History.reprintBill();
      });
    }
  },
  
  // Refresh history
  refresh: () => {
    History.render();
  }
};

// Export history module
window.History = History;
