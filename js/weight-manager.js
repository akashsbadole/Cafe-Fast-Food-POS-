// Weight Manager for Cafe POS
// Handles weight-based pricing, validation, and inventory tracking

class WeightManager {
  constructor(db) {
    this.db = db;
  }

  // Initialize weight management system
  async init() {
    try {
      // Ensure required tables exist
      this.db.run(`
        CREATE TABLE IF NOT EXISTS weighted_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          menu_item_id INTEGER UNIQUE NOT NULL,
          unit_weight REAL NOT NULL DEFAULT 1.0,
          min_weight REAL NOT NULL DEFAULT 1.0,
          max_weight REAL NOT NULL DEFAULT 1000.0,
          weight_unit TEXT DEFAULT 'gram' CHECK (weight_unit IN ('gram', 'kilogram', 'ounce', 'pound')),
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS weight_pricing_tiers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          weighted_item_id INTEGER NOT NULL,
          min_weight REAL NOT NULL,
          max_weight REAL NOT NULL,
          price REAL NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (weighted_item_id) REFERENCES weighted_items(id) ON DELETE CASCADE,
          UNIQUE (weighted_item_id, min_weight, max_weight)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_weight_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          menu_item_id INTEGER NOT NULL,
          order_id INTEGER,
          order_item_id INTEGER,
          weight_used REAL NOT NULL,
          weight_unit TEXT DEFAULT 'gram',
          current_stock REAL,
          transaction_type TEXT DEFAULT 'sale',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
          FOREIGN KEY (order_id) REFERENCES orders(id)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          menu_item_id INTEGER UNIQUE NOT NULL,
          current_weight REAL DEFAULT 0.0,
          max_weight REAL DEFAULT 0.0,
          weight_unit TEXT DEFAULT 'gram',
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
        )
      `);

      console.log('Weight Manager initialized successfully');
    } catch (error) {
      console.error('Error initializing Weight Manager:', error);
      throw error;
    }
  }

  // Helper to convert result to objects
  _resultToObjects(result) {
    if (!result || result.length === 0) return [];
    const columns = result[0].columns;
    const values = result[0].values;
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  // ==================== WEIGHTED ITEMS MANAGEMENT ====================

  // Create weighted item
  async createWeightedItem(itemData) {
    const result = this.db.prepare(`
      INSERT INTO weighted_items 
      (menu_item_id, unit_weight, min_weight, max_weight, weight_unit, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      itemData.menu_item_id,
      itemData.unit_weight || 1.0,
      itemData.min_weight || 1.0,
      itemData.max_weight || 1000.0,
      itemData.weight_unit || 'gram',
      itemData.is_active !== undefined ? itemData.is_active : 1
    );

    const weightedItemId = result.lastInsertRowid;

    // Update menu item to mark as weighted
    this.db.run(`
      UPDATE menu_items SET 
        is_weighted = 1,
        weight_unit = ?,
        unit_weight = ?
      WHERE id = ?
    `, [itemData.weight_unit || 'gram', itemData.unit_weight || 1.0, itemData.menu_item_id]);

    return this.getWeightedItem(weightedItemId);
  }

  // Get weighted item by ID
  async getWeightedItem(id) {
    const result = this.db.exec('SELECT * FROM weighted_items WHERE id = ?', [id]);
    const items = this._resultToObjects(result);
    return items[0] || null;
  }

  // Get weighted item by menu item ID
  async getWeightedItemByMenuItemId(menuItemId) {
    const result = this.db.exec('SELECT * FROM weighted_items WHERE menu_item_id = ?', [menuItemId]);
    const items = this._resultToObjects(result);
    return items[0] || null;
  }

  // Get all weighted items
  async getAllWeightedItems(activeOnly = true) {
    let query = 'SELECT * FROM weighted_items';
    const params = [];

    if (activeOnly) {
      query += ' WHERE is_active = 1';
    }

    query += ' ORDER BY menu_item_id ASC';

    const result = this.db.exec(query, params);
    return this._resultToObjects(result);
  }

  // Update weighted item
  async updateWeightedItem(id, itemData) {
    this.db.run(`
      UPDATE weighted_items SET 
        unit_weight = ?,
        min_weight = ?,
        max_weight = ?,
        weight_unit = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      itemData.unit_weight || 1.0,
      itemData.min_weight || 1.0,
      itemData.max_weight || 1000.0,
      itemData.weight_unit || 'gram',
      itemData.is_active !== undefined ? itemData.is_active : 1,
      id
    ]);

    // Update menu item as well
    const weightedItem = await this.getWeightedItem(id);
    if (weightedItem) {
      this.db.run(`
        UPDATE menu_items SET 
          is_weighted = 1,
          weight_unit = ?,
          unit_weight = ?
        WHERE id = ?
      `, [itemData.weight_unit || 'gram', itemData.unit_weight || 1.0, weightedItem.menu_item_id]);
    }

    return this.getWeightedItem(id);
  }

  // Delete weighted item
  async deleteWeightedItem(id) {
    const weightedItem = await this.getWeightedItem(id);
    if (!weightedItem) {
      throw new Error('Weighted item not found');
    }

    // Soft delete
    this.db.run('UPDATE weighted_items SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    // Update menu item
    this.db.run('UPDATE menu_items SET is_weighted = 0 WHERE id = ?', [weightedItem.menu_item_id]);

    return { success: true, message: 'Weighted item deactivated successfully' };
  }

  // ==================== WEIGHT PRICING TIERS ====================

  // Create pricing tier
  async createPricingTier(tierData) {
    const result = this.db.prepare(`
      INSERT INTO weight_pricing_tiers 
      (weighted_item_id, min_weight, max_weight, price, display_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      tierData.weighted_item_id,
      tierData.min_weight,
      tierData.max_weight,
      tierData.price,
      tierData.display_order || 0,
      tierData.is_active !== undefined ? tierData.is_active : 1
    );

    const tierId = result.lastInsertRowid;
    return this.getPricingTier(tierId);
  }

  // Get pricing tier by ID
  async getPricingTier(id) {
    const result = this.db.exec('SELECT * FROM weight_pricing_tiers WHERE id = ?', [id]);
    const tiers = this._resultToObjects(result);
    return tiers[0] || null;
  }

  // Get all pricing tiers for a weighted item
  async getPricingTiersForWeightedItem(weightedItemId, activeOnly = true) {
    let query = 'SELECT * FROM weight_pricing_tiers WHERE weighted_item_id = ?';
    const params = [weightedItemId];

    if (activeOnly) {
      query += ' AND is_active = 1';
    }

    query += ' ORDER BY display_order ASC, min_weight ASC';

    const result = this.db.exec(query, params);
    return this._resultToObjects(result);
  }

  // Update pricing tier
  async updatePricingTier(id, tierData) {
    this.db.run(`
      UPDATE weight_pricing_tiers SET 
        min_weight = ?,
        max_weight = ?,
        price = ?,
        display_order = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      tierData.min_weight,
      tierData.max_weight,
      tierData.price,
      tierData.display_order || 0,
      tierData.is_active !== undefined ? tierData.is_active : 1,
      id
    ]);

    return this.getPricingTier(id);
  }

  // Delete pricing tier
  async deletePricingTier(id) {
    this.db.run('UPDATE weight_pricing_tiers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    return { success: true, message: 'Pricing tier deactivated successfully' };
  }

  // ==================== WEIGHT CALCULATIONS ====================

  // Calculate price based on weight
  async calculatePriceByWeight(menuItemId, weight, weightUnit = 'gram') {
    const weightedItem = await this.getWeightedItemByMenuItemId(menuItemId);
    if (!weightedItem) {
      throw new Error('Item is not configured as weighted');
    }

    // Convert weight to the item's base unit
    const convertedWeight = this._convertWeight(weight, weightUnit, weightedItem.weight_unit);

    // Validate weight
    if (convertedWeight < weightedItem.min_weight) {
      throw new Error(`Weight must be at least ${weightedItem.min_weight} ${weightedItem.weight_unit}`);
    }

    if (convertedWeight > weightedItem.max_weight) {
      throw new Error(`Weight cannot exceed ${weightedItem.max_weight} ${weightedItem.weight_unit}`);
    }

    // Get pricing tiers
    const tiers = await this.getPricingTiersForWeightedItem(weightedItem.id);

    if (tiers.length === 0) {
      // Fallback to base price if no tiers configured
      const menuItem = await this._getMenuItem(menuItemId);
      return {
        price: menuItem.price,
        tier: null,
        weight: convertedWeight,
        weightUnit: weightedItem.weight_unit
      };
    }

    // Find the appropriate tier
    const applicableTier = tiers.find(tier => 
      convertedWeight >= tier.min_weight && convertedWeight <= tier.max_weight
    );

    if (!applicableTier) {
      // If no exact match, find the closest tier
      const sortedTiers = [...tiers].sort((a, b) => a.max_weight - b.max_weight);
      const lastTier = sortedTiers[sortedTiers.length - 1];
      
      if (convertedWeight > lastTier.max_weight) {
        // Use the last tier's price per unit
        const pricePerUnit = lastTier.price / lastTier.max_weight;
        return {
          price: pricePerUnit * convertedWeight,
          tier: lastTier,
          weight: convertedWeight,
          weightUnit: weightedItem.weight_unit,
          isExtrapolated: true
        };
      }
    }

    return {
      price: applicableTier ? applicableTier.price : 0,
      tier: applicableTier || null,
      weight: convertedWeight,
      weightUnit: weightedItem.weight_unit,
      isExtrapolated: !applicableTier
    };
  }

  // Convert weight between units
  _convertWeight(weight, fromUnit, toUnit) {
    if (fromUnit === toUnit) return weight;

    // Convert to grams first
    let weightInGrams;
    switch (fromUnit) {
      case 'gram':
        weightInGrams = weight;
        break;
      case 'kilogram':
        weightInGrams = weight * 1000;
        break;
      case 'ounce':
        weightInGrams = weight * 28.3495;
        break;
      case 'pound':
        weightInGrams = weight * 453.592;
        break;
      default:
        weightInGrams = weight;
    }

    // Convert from grams to target unit
    switch (toUnit) {
      case 'gram':
        return weightInGrams;
      case 'kilogram':
        return weightInGrams / 1000;
      case 'ounce':
        return weightInGrams / 28.3495;
      case 'pound':
        return weightInGrams / 453.592;
      default:
        return weightInGrams;
    }
  }

  // ==================== INVENTORY WEIGHT TRACKING ====================

  // Initialize inventory weight for an item
  async initializeInventoryWeight(menuItemId, currentWeight, maxWeight, weightUnit = 'gram') {
    const result = this.db.prepare(`
      INSERT OR REPLACE INTO inventory_items 
      (id, menu_item_id, current_weight, max_weight, weight_unit, last_updated)
      VALUES (
        (SELECT id FROM inventory_items WHERE menu_item_id = ?),
        ?,
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP
      )
    `).run(
      menuItemId,
      menuItemId,
      currentWeight,
      maxWeight,
      weightUnit
    );

    return { success: true, message: 'Inventory weight initialized' };
  }

  // Get inventory weight for an item
  async getInventoryWeight(menuItemId) {
    const result = this.db.exec('SELECT * FROM inventory_items WHERE menu_item_id = ?', [menuItemId]);
    const items = this._resultToObjects(result);
    return items[0] || null;
  }

  // Update inventory weight after sale
  async updateInventoryWeight(menuItemId, weightUsed, weightUnit = 'gram', orderId = null, orderItemId = null) {
    const inventory = await this.getInventoryWeight(menuItemId);

    if (!inventory) {
      throw new Error('Inventory weight not initialized for this item');
    }

    // Convert weight to the item's base unit
    const convertedWeight = this._convertWeight(weightUsed, weightUnit, inventory.weight_unit);

    // Check if there's enough stock
    if (inventory.current_weight < convertedWeight) {
      throw new Error('Insufficient inventory weight');
    }

    // Update inventory
    const newWeight = inventory.current_weight - convertedWeight;
    this.db.run(`
      UPDATE inventory_items SET 
        current_weight = ?,
        last_updated = CURRENT_TIMESTAMP
      WHERE menu_item_id = ?
    `, [newWeight, menuItemId]);

    // Log the transaction
    await this.db.run(`
      INSERT INTO inventory_weight_logs 
      (menu_item_id, order_id, order_item_id, weight_used, weight_unit, current_stock, transaction_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      menuItemId,
      orderId || null,
      orderItemId || null,
      convertedWeight,
      inventory.weight_unit,
      newWeight,
      'sale'
    ]);

    return {
      success: true,
      newWeight: newWeight,
      weightUnit: inventory.weight_unit
    };
  }

  // Restock inventory weight
  async restockInventoryWeight(menuItemId, weightAdded, weightUnit = 'gram') {
    const inventory = await this.getInventoryWeight(menuItemId);

    if (!inventory) {
      throw new Error('Inventory weight not initialized for this item');
    }

    // Convert weight to the item's base unit
    const convertedWeight = this._convertWeight(weightAdded, weightUnit, inventory.weight_unit);

    // Update inventory
    const newWeight = inventory.current_weight + convertedWeight;
    this.db.run(`
      UPDATE inventory_items SET 
        current_weight = ?,
        last_updated = CURRENT_TIMESTAMP
      WHERE menu_item_id = ?
    `, [newWeight, menuItemId]);

    // Log the transaction
    await this.db.run(`
      INSERT INTO inventory_weight_logs 
      (menu_item_id, weight_used, weight_unit, current_stock, transaction_type)
      VALUES (?, ?, ?, ?, ?)
    `, [
      menuItemId,
      convertedWeight,
      inventory.weight_unit,
      newWeight,
      'restock'
    ]);

    return {
      success: true,
      newWeight: newWeight,
      weightUnit: inventory.weight_unit
    };
  }

  // Get weight usage history
  async getWeightUsageHistory(menuItemId, limit = 50) {
    const query = `
      SELECT * FROM inventory_weight_logs 
      WHERE menu_item_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const result = this.db.exec(query, [menuItemId, limit]);
    return this._resultToObjects(result);
  }

  // ==================== HELPER METHODS ====================

  // Get menu item details
  async _getMenuItem(menuItemId) {
    const result = this.db.exec('SELECT * FROM menu_items WHERE id = ?', [menuItemId]);
    const items = this._resultToObjects(result);
    return items[0] || null;
  }

  // Check if item is weighted
  async isWeightedItem(menuItemId) {
    const result = this.db.exec('SELECT is_weighted FROM menu_items WHERE id = ?', [menuItemId]);
    const items = this._resultToObjects(result);
    return items[0] ? items[0].is_weighted === 1 : false;
  }
}

module.exports = WeightManager;
