// Cart management module for Cafe POS

const offlineManager = require('./offline-manager');
const databaseManager = require('./database-manager');
const SplitBillManager = require('./split-bill-manager');

const Cart = {
  items: [],
  discountType: 'fixed',
  discountValue: 0,
  selectedTableId: null,
  selectedBuzzerId: null,
  appliedCombos: [],
  isOffline: false,
  splitBillSessionId: null,
  
  // Add item to cart
  addItem: (itemId, itemName, itemPrice, modifiers = [], comboId = null, weight = null, weightUnit = null) => {
    const existingIndex = Cart.items.findIndex(item => item.id === itemId && item.weight === weight);
    
    if (existingIndex > -1) {
      Cart.items[existingIndex].quantity += 1;
      const modifierSubtotal = ModifierManager.calculateModifierSubtotal(Cart.items[existingIndex].modifiers || []);
      Cart.items[existingIndex].total = Cart.items[existingIndex].quantity * (itemPrice + modifierSubtotal);
      
      // Update combo ID if provided
      if (comboId) {
        Cart.items[existingIndex].combo_id = comboId;
      }
    } else {
      const modifierSubtotal = ModifierManager.calculateModifierSubtotal(modifiers);
      const totalWithModifiers = itemPrice + modifierSubtotal;
      
      Cart.items.push({
        id: itemId,
        name: itemName,
        price: itemPrice,
        quantity: 1,
        total: totalWithModifiers,
        modifiers: modifiers,
        combo_id: comboId,
        weight: weight,
        weight_unit: weightUnit
      });
    }
    
    // Check for applicable combos after adding item
    Cart.checkForCombos();
    
    Cart.render();
    Billing.calculate();
  },
  
  // Remove item from cart
  removeItem: (itemId, weight = null) => {
    if (weight !== null && weight !== undefined) {
      Cart.items = Cart.items.filter(item => !(item.id === itemId && item.weight === weight));
    } else {
      Cart.items = Cart.items.filter(item => item.id !== itemId);
    }
    Cart.render();
    Billing.calculate();
  },
  
  // Update item quantity
  updateQuantity: (itemId, quantity, weight = null) => {
    let item;
    if (weight !== null && weight !== undefined) {
      item = Cart.items.find(i => i.id === itemId && i.weight === weight);
    } else {
      item = Cart.items.find(i => i.id === itemId);
    }
    
    if (!item) return;
    
    if (quantity <= 0) {
      Cart.removeItem(itemId, weight);
      return;
    }
    
    item.quantity = quantity;
    const modifierSubtotal = ModifierManager.calculateModifierSubtotal(item.modifiers || []);
    item.total = quantity * (item.price + modifierSubtotal);
    Cart.render();
    Billing.calculate();
  },
  
  // Increment quantity
  incrementQuantity: (itemId, weight = null) => {
    let item;
    if (weight !== null && weight !== undefined) {
      item = Cart.items.find(i => i.id === itemId && i.weight === weight);
    } else {
      item = Cart.items.find(i => i.id === itemId);
    }
    if (item) {
      Cart.updateQuantity(itemId, item.quantity + 1, weight);
    }
  },
  
  // Decrement quantity
  decrementQuantity: (itemId, weight = null) => {
    let item;
    if (weight !== null && weight !== undefined) {
      item = Cart.items.find(i => i.id === itemId && i.weight === weight);
    } else {
      item = Cart.items.find(i => i.id === itemId);
    }
    if (item) {
      Cart.updateQuantity(itemId, item.quantity - 1, weight);
    }
  },
  
  // Clear cart
  clear: () => {
    Cart.items = [];
    Cart.discountValue = 0;
    Cart.selectedTableId = null;
    Cart.selectedBuzzerId = null;
    Cart.appliedCombos = [];
    Cart.splitBillSessionId = null;
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
  
  // Add modifier to cart item
  addModifierToItem: (itemId, modifierId, quantity = 1) => {
    const item = Cart.items.find(i => i.id === itemId);
    if (!item) return false;
    
    // Check if modifier already exists
    const existingModifierIndex = item.modifiers ?
      item.modifiers.findIndex(m => m.id === modifierId) : -1;
    
    if (existingModifierIndex >= 0) {
      // Update existing modifier quantity
      item.modifiers[existingModifierIndex].quantity += quantity;
    } else {
      // Add new modifier
      const modifier = {
        id: modifierId,
        quantity: quantity,
        price: 0 // Will be set after fetching modifier details
      };
      
      if (!item.modifiers) {
        item.modifiers = [];
      }
      
      item.modifiers.push(modifier);
    }
    
    // Recalculate item total
    const modifierSubtotal = ModifierManager.calculateModifierSubtotal(item.modifiers);
    item.total = item.quantity * (item.price + modifierSubtotal);
    
    Cart.render();
    Billing.calculate();
    return true;
  },
  
  // Update modifier on cart item
  updateModifierOnItem: (itemId, modifierId, quantity) => {
    const item = Cart.items.find(i => i.id === itemId);
    if (!item || !item.modifiers) return false;
    
    const modifierIndex = item.modifiers.findIndex(m => m.id === modifierId);
    if (modifierIndex === -1) return false;
    
    if (quantity <= 0) {
      Cart.removeModifierFromItem(itemId, modifierId);
      return true;
    }
    
    item.modifiers[modifierIndex].quantity = quantity;
    
    // Recalculate item total
    const modifierSubtotal = ModifierManager.calculateModifierSubtotal(item.modifiers);
    item.total = item.quantity * (item.price + modifierSubtotal);
    
    Cart.render();
    Billing.calculate();
    return true;
  },
  
  // Remove modifier from cart item
  removeModifierFromItem: (itemId, modifierId) => {
    const item = Cart.items.find(i => i.id === itemId);
    if (!item || !item.modifiers) return false;
    
    item.modifiers = item.modifiers.filter(m => m.id !== modifierId);
    
    // Recalculate item total
    const modifierSubtotal = ModifierManager.calculateModifierSubtotal(item.modifiers);
    item.total = item.quantity * (item.price + modifierSubtotal);
    
    Cart.render();
    Billing.calculate();
    return true;
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
  
  // Get tax type
  getTaxType: () => {
    return Billing.taxType || 'exclusive';
  },
  
  // Get tax rate
  getTaxRate: () => {
    return Billing.taxRate || 9;
  },
  
  // Render cart
  render: () => {
    const container = document.getElementById('cart-items');
    const loyaltyInfoContainer = document.getElementById('cart-loyalty-info');
    if (!container) return;
    
    if (Cart.items.length === 0) {
      container.innerHTML = `
        <div class="empty-cart">
          <span>🛒</span>
          <p>Cart is empty</p>
          <p class="hint">Add items from the menu</p>
        </div>
      `;
      if (loyaltyInfoContainer) {
        loyaltyInfoContainer.innerHTML = '';
      }
      return;
    }
    
    let html = '';
    Cart.items.forEach(item => {
      // Render modifiers if they exist
      let modifiersHtml = '';
      if (item.modifiers && item.modifiers.length > 0) {
        modifiersHtml = '<div class="cart-item-modifiers">';
        item.modifiers.forEach(modifier => {
          modifiersHtml += `
            <div class="cart-item-modifier">
              <span class="modifier-name">${modifier.name || 'Modifier'}</span>
              <span class="modifier-qty">×${modifier.quantity}</span>
              <span class="modifier-price">${Utils.formatCurrency(modifier.price * modifier.quantity)}</span>
            </div>
          `;
        });
        modifiersHtml += '</div>';
      }
      
      // Render weight information if available
      let weightInfo = '';
      if (item.weight) {
        weightInfo = `<div class="cart-item-weight">${item.weight} ${item.weight_unit || 'g'}</div>`;
      }
      
      html += `
        <div class="cart-item" data-id="${item.id}" data-weight="${item.weight || ''}">
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">${Utils.formatCurrency(item.price)} each</div>
            ${weightInfo}
            ${modifiersHtml}
          </div>
          <div class="cart-item-qty">
            <button class="qty-btn" onclick="Cart.decrementQuantity(${item.id}, ${item.weight || 0})">−</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn" onclick="Cart.incrementQuantity(${item.id}, ${item.weight || 0})">+</button>
          </div>
          <div class="cart-item-total">${Utils.formatCurrency(item.total)}</div>
          <button class="cart-item-remove" onclick="Cart.removeItem(${item.id}, ${item.weight || 0})">×</button>
        </div>
      `;
    });
    
    container.innerHTML = html;
    
    // Update loyalty information display
    Cart.updateLoyaltyInfoDisplay();
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
    
    // Listen for offline manager events
    offlineManager.on('network-status-changed', (isOffline) => {
      Cart.isOffline = isOffline;
      Cart.render();
    });
  },
  
  // Get cart items for order (with KDS support)
  getOrderItems: () => {
    return Cart.items.map(item => ({
      menuItemId: item.id,
      quantity: item.quantity,
      unitPrice: item.price,
      totalPrice: item.total,
      notes: '',
      modifiers: item.modifiers || [],
      itemWeight: item.weight,
      weightUnit: item.weight_unit,
      // KDS-specific fields
      stationId: null, // Will be determined by KDS manager
      productId: item.id,
      productName: item.name
    }));
  },
  
  // Check if cart is empty
  isEmpty: () => {
    return Cart.items.length === 0;
  },
  
  // Set selected table
  setSelectedTable: (tableId) => {
    Cart.selectedTableId = tableId;
    Cart.render();
  },
  
  // Set selected buzzer
  setSelectedBuzzer: (buzzerId) => {
    Cart.selectedBuzzerId = buzzerId;
    Cart.render();
  },
  
  // Get selected table
  getSelectedTable: () => {
    return Cart.selectedTableId;
  },
  
  // Get selected buzzer
  getSelectedBuzzer: () => {
    return Cart.selectedBuzzerId;
  },
  
  // Check if table or buzzer is selected
  hasTableOrBuzzerSelected: () => {
    return Cart.selectedTableId !== null || Cart.selectedBuzzerId !== null;
  },
  
  // Show weight input modal for weighted items
  showWeightInputModal: async (itemId, itemName, basePrice) => {
    try {
      const WeightManager = require('./weight-manager');
      const weightManager = new WeightManager(database);
      
      // Get weighted item details
      const weightedItem = await weightManager.getWeightedItemByMenuItemId(itemId);
      if (!weightedItem) {
        alert('This item is not configured for weight-based pricing');
        return;
      }
      
      // Get pricing tiers
      const tiers = await weightManager.getPricingTiersForWeightedItem(weightedItem.id);
      
      // Create modal HTML
      let modalHtml = `
        <div id="weight-input-modal" class="modal active">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Enter Weight for ${itemName}</h3>
              <button class="modal-close" onclick="Cart.hideWeightInputModal()">×</button>
            </div>
            <div class="modal-body">
              <div class="weight-input-form">
                <div class="form-group">
                  <label>Weight (${weightedItem.weight_unit})</label>
                  <input type="number" id="weight-value" min="${weightedItem.min_weight}" max="${weightedItem.max_weight}" step="0.01" value="${weightedItem.min_weight}">
                </div>
                <div class="form-group">
                  <label>Price</label>
                  <div id="calculated-price">${Utils.formatCurrency(basePrice)}</div>
                </div>
                <div class="form-group">
                  <label>Pricing Tiers</label>
                  <div class="pricing-tiers">
      `;
      
      // Add pricing tiers
      if (tiers.length > 0) {
        tiers.forEach(tier => {
          modalHtml += `
            <div class="tier-row">
              <span>${tier.min_weight} - ${tier.max_weight} ${weightedItem.weight_unit}: ${Utils.formatCurrency(tier.price)}</span>
            </div>
          `;
        });
      } else {
        modalHtml += `<div class="tier-row">No pricing tiers configured. Using base price.</div>`;
      }
      
      modalHtml += `
                  </div>
                </div>
                <div class="form-group">
                  <button class="btn btn-primary" onclick="Cart.addWeightedItem(${itemId}, '${itemName.replace(/'/g, "\\'")}', ${basePrice})">Add to Cart</button>
                  <button class="btn btn-secondary" onclick="Cart.hideWeightInputModal()">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Add modal to body
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      // Setup weight input event listener
      const weightInput = document.getElementById('weight-value');
      if (weightInput) {
        weightInput.addEventListener('input', async (e) => {
          const weight = parseFloat(e.target.value);
          if (!isNaN(weight)) {
            try {
              const result = await weightManager.calculatePriceByWeight(itemId, weight, weightedItem.weight_unit);
              document.getElementById('calculated-price').textContent = Utils.formatCurrency(result.price);
            } catch (error) {
              document.getElementById('calculated-price').textContent = 'Invalid weight: ' + error.message;
            }
          }
        });
      }
      
      // Focus on weight input
      if (weightInput) {
        weightInput.focus();
      }
      
    } catch (error) {
      console.error('Error showing weight input modal:', error);
      alert('Error loading weight configuration: ' + error.message);
    }
  },
  
  // Add weighted item to cart
  addWeightedItem: async (itemId, itemName, basePrice) => {
    try {
      const weightValue = parseFloat(document.getElementById('weight-value').value);
      const WeightManager = require('./weight-manager');
      const weightManager = new WeightManager(database);
      
      if (isNaN(weightValue) || weightValue <= 0) {
        alert('Please enter a valid weight');
        return;
      }
      
      // Calculate price based on weight
      const result = await weightManager.calculatePriceByWeight(itemId, weightValue);
      
      // Add to cart
      Cart.addItem(itemId, itemName, result.price, [], null, weightValue, result.weightUnit);
      
      // Hide modal
      Cart.hideWeightInputModal();
      
    } catch (error) {
      alert('Error: ' + error.message);
    }
  },
  
  // Hide weight input modal
  hideWeightInputModal: () => {
    const modal = document.getElementById('weight-input-modal');
    if (modal) {
      modal.remove();
    }
  },
  
  // Clear table/buzzer selection
  clearTableBuzzerSelection: () => {
    Cart.selectedTableId = null;
    Cart.selectedBuzzerId = null;
    Cart.render();
  },
  
  // Check for applicable combos in cart
  checkForCombos: async () => {
    try {
      const ComboManager = require('./combo-manager');
      const applicableCombos = await ComboManager.findApplicableCombos(Cart.items);
      
      if (applicableCombos.length > 0) {
        // Auto-apply the best combo (highest discount)
        const bestCombo = applicableCombos[0];
        Cart.applyCombo(bestCombo.id);
      }
    } catch (error) {
      console.error('Error checking for combos:', error);
    }
  },
  
  // Apply combo to cart items
  applyCombo: async (comboId) => {
    try {
      const ComboManager = require('./combo-manager');
      const combo = await ComboManager.getById(comboId);
      
      if (!combo) {
        console.error('Combo not found');
        return false;
      }
      
      // Validate combo
      const validation = await ComboManager.validateCombo(comboId, Cart.items);
      if (!validation.valid) {
        console.error('Combo validation failed:', validation.message);
        return false;
      }
      
      // Apply combo discount to items
      const updatedItems = ComboManager.applyComboToCart(Cart.items, combo);
      Cart.items = updatedItems;
      
      // Track applied combo
      if (!Cart.appliedCombos.some(c => c.id === comboId)) {
        Cart.appliedCombos.push(combo);
      }
      
      Cart.render();
      Billing.calculate();
      
      return true;
    } catch (error) {
      console.error('Error applying combo:', error);
      return false;
    }
  },
  
  // Remove combo from cart
  removeCombo: (comboId) => {
    // Remove combo ID from items
    Cart.items = Cart.items.map(item => {
      if (item.combo_id === comboId) {
        return { ...item, combo_id: null };
      }
      return item;
    });
    
    // Remove from applied combos
    Cart.appliedCombos = Cart.appliedCombos.filter(c => c.id !== comboId);
    
    Cart.render();
    Billing.calculate();
    
    return true;
  },
  
  // Get combo discount amount
  getComboDiscountAmount: () => {
    return Cart.appliedCombos.reduce((total, combo) => {
      const discount = ComboManager.calculateComboDiscount(combo, Cart.items);
      return total + discount;
    }, 0);
  },
  
  // Get cart items with combo information for order
  getOrderItems: () => {
    return Cart.items.map(item => ({
      menuItemId: item.id,
      quantity: item.quantity,
      unitPrice: item.price,
      totalPrice: item.total,
      notes: '',
      modifiers: item.modifiers || [],
      comboId: item.combo_id,
      comboDiscount: item.combo_discount || 0,
      stationId: null,
      productId: item.id,
      productName: item.name
    }));
  },

  // Start split billing session
  startSplitBill: async (orderId, totalSplits, splitMethod, notes = '') => {
    try {
      const splitBillManager = new SplitBillManager(database);
      const session = await splitBillManager.createSplitBillSession({
        orderId,
        totalSplits,
        splitMethod,
        notes
      });

      Cart.splitBillSessionId = session.id;
      
      // Distribute items based on method
      if (splitMethod === 'item_count') {
        await splitBillManager.splitByItemCount(session.id, totalSplits);
      } else if (splitMethod === 'amount') {
        // For amount-based splitting, this will be handled via API
        console.log('Split by amount - use API to specify amounts');
      } else if (splitMethod === 'customer') {
        // For customer-based splitting, this will be handled via API
        console.log('Split by customer - use API to assign customers');
      }

      return session;
    } catch (error) {
      console.error('Error starting split bill:', error);
      throw error;
    }
  },

  // Get current split bill session
  getSplitBillSession: () => {
    return Cart.splitBillSessionId;
  },

  // Clear split bill session
  clearSplitBillSession: () => {
    Cart.splitBillSessionId = null;
  },
  
  // Check if split billing is active
  isSplitBillActive: () => {
    return Cart.splitBillSessionId !== null;
  },
  
  // Update loyalty information display
  updateLoyaltyInfoDisplay: async () => {
    const loyaltyInfoContainer = document.getElementById('cart-loyalty-info');
    if (!loyaltyInfoContainer) return;
    
    // Get current customer and program from session or UI
    const customerId = sessionStorage.getItem('currentCustomerId');
    const programId = sessionStorage.getItem('currentLoyaltyProgramId');
    
    if (!customerId || !programId) {
      loyaltyInfoContainer.innerHTML = '';
      return;
    }
    
    try {
      const LoyaltyManager = require('./loyalty-manager');
      const loyaltyManager = new LoyaltyManager(database);
      
      const status = await loyaltyManager.getCustomerLoyaltyStatus(customerId, programId);
      const totals = Billing.getTotals();
      
      if (!status) {
        loyaltyInfoContainer.innerHTML = '';
        return;
      }
      
      // Calculate points to earn
      const pointsCalculation = await loyaltyManager.calculatePointsToEarn(
        programId,
        totals.total,
        customerId
      );
      
      // Get available rewards
      const rewards = await loyaltyManager.getAvailableRewards(customerId, programId);
      
      let html = `
        <div class="cart-loyalty-section">
          <h3>🎁 Loyalty Program</h3>
          <div class="loyalty-program-name">${status.program_name}</div>
          <div class="loyalty-tier">
            ${status.tier_name ? `Tier: ${status.tier_name}` : 'No tier yet'}
          </div>
          <div class="loyalty-balance">
            <strong>Points Balance:</strong> ${status.points_balance}
          </div>
          <div class="loyalty-points-to-earn">
            <strong>Points to Earn:</strong> ${pointsCalculation.points}
          </div>
      `;
      
      // Add rewards section if rewards are available
      if (rewards.length > 0) {
        html += '<div class="loyalty-rewards"><strong>Available Rewards:</strong></div>';
        html += '<div class="rewards-list">';
        rewards.slice(0, 3).forEach(reward => {
          html += `
            <div class="reward-item">
              <span class="reward-name">${reward.name}</span>
              <span class="reward-points">${reward.points_required} pts</span>
            </div>
          `;
        });
        if (rewards.length > 3) {
          html += `<div class="reward-item">+${rewards.length - 3} more rewards</div>`;
        }
        html += '</div>';
      }
      
      html += '</div>';
      
      loyaltyInfoContainer.innerHTML = html;
    } catch (error) {
      console.error('Error updating loyalty info:', error);
      loyaltyInfoContainer.innerHTML = '';
    }
  },
  
  // Set current customer for loyalty tracking
  setCurrentCustomer: (customerId) => {
    sessionStorage.setItem('currentCustomerId', customerId);
    Cart.updateLoyaltyInfoDisplay();
  },
  
  // Set current loyalty program
  setCurrentLoyaltyProgram: (programId) => {
    sessionStorage.setItem('currentLoyaltyProgramId', programId);
    Cart.updateLoyaltyInfoDisplay();
  },
  
  // Clear current customer
  clearCurrentCustomer: () => {
    sessionStorage.removeItem('currentCustomerId');
    sessionStorage.removeItem('currentLoyaltyProgramId');
    const loyaltyInfoContainer = document.getElementById('cart-loyalty-info');
    if (loyaltyInfoContainer) {
      loyaltyInfoContainer.innerHTML = '';
    }
  }
};

// Export cart module
window.Cart = Cart;
