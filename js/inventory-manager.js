// Enhanced Inventory Management System
// Handles supplier management, purchase orders, and advanced inventory features

class InventoryManager {
  constructor(db) {
    this.db = db;
  }

  // Initialize inventory system
  async init() {
    try {
      // Initialize recipe manager if needed
      const RecipeManager = require('./recipe-manager');
      this.recipeManager = new RecipeManager(this.db, this);
      await this.recipeManager.init();

      // Create suppliers table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS suppliers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          contact_person TEXT,
          phone TEXT,
          email TEXT,
          address TEXT,
          city TEXT,
          state TEXT,
          pincode TEXT,
          gst_number TEXT,
          notes TEXT,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create purchase_orders table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS purchase_orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          po_number TEXT UNIQUE NOT NULL,
          supplier_id INTEGER NOT NULL,
          order_date DATETIME NOT NULL,
          expected_delivery_date DATETIME,
          actual_delivery_date DATETIME,
          status TEXT DEFAULT 'draft',
          total_amount REAL DEFAULT 0,
          tax_amount REAL DEFAULT 0,
          grand_total REAL DEFAULT 0,
          notes TEXT,
          created_by INTEGER,
          updated_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (updated_by) REFERENCES users(id)
        )
      `);

      // Create purchase_order_items table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS purchase_order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          po_id INTEGER NOT NULL,
          menu_item_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          total_price REAL NOT NULL,
          received_quantity INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
        )
      `);

      // Create reorder_levels table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS reorder_levels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          menu_item_id INTEGER UNIQUE NOT NULL,
          reorder_threshold INTEGER NOT NULL,
          lead_time_days INTEGER DEFAULT 3,
          supplier_id INTEGER,
          last_reordered DATETIME,
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )
      `);

      // Create inventory_alerts table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          menu_item_id INTEGER NOT NULL,
          alert_type TEXT NOT NULL,
          message TEXT NOT NULL,
          is_resolved INTEGER DEFAULT 0,
          resolved_at DATETIME,
          resolved_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
          FOREIGN KEY (resolved_by) REFERENCES users(id)
        )
      `);

      // Create inventory_transfers table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_transfers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transfer_number TEXT UNIQUE NOT NULL,
          from_location TEXT,
          to_location TEXT,
          status TEXT DEFAULT 'pending',
          notes TEXT,
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `);

      // Create inventory_transfer_items table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_transfer_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transfer_id INTEGER NOT NULL,
          menu_item_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id),
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
        )
      `);

      console.log('Inventory Management System initialized');
    } catch (error) {
      console.error('Error initializing inventory manager:', error);
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

  // ==================== SUPPLIER MANAGEMENT ====================

  // Create supplier
  async createSupplier(supplierData, userId) {
    const result = this.db.prepare(`
      INSERT INTO suppliers 
      (name, contact_person, phone, email, address, city, state, pincode, gst_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      supplierData.name,
      supplierData.contact_person || null,
      supplierData.phone || null,
      supplierData.email || null,
      supplierData.address || null,
      supplierData.city || null,
      supplierData.state || null,
      supplierData.pincode || null,
      supplierData.gst_number || null,
      supplierData.notes || null
    );

    const supplierId = result.lastInsertRowid;
    
    // Update timestamp
    this.db.run('UPDATE suppliers SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [supplierId]);

    return this.getSupplier(supplierId);
  }

  // Get supplier by ID
  async getSupplier(supplierId) {
    const result = this.db.exec('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
    const suppliers = this._resultToObjects(result);
    return suppliers[0] || null;
  }

  // Get all suppliers
  async getAllSuppliers(activeOnly = true) {
    let query = 'SELECT * FROM suppliers';
    const params = [];

    if (activeOnly) {
      query += ' WHERE is_active = 1';
    }

    query += ' ORDER BY name ASC';

    const result = this.db.exec(query, params);
    return this._resultToObjects(result);
  }

  // Update supplier
  async updateSupplier(supplierId, supplierData, userId) {
    this.db.run(`
      UPDATE suppliers SET 
        name = ?,
        contact_person = ?,
        phone = ?,
        email = ?,
        address = ?,
        city = ?,
        state = ?,
        pincode = ?,
        gst_number = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      supplierData.name,
      supplierData.contact_person || null,
      supplierData.phone || null,
      supplierData.email || null,
      supplierData.address || null,
      supplierData.city || null,
      supplierData.state || null,
      supplierData.pincode || null,
      supplierData.gst_number || null,
      supplierData.notes || null,
      supplierId
    ]);

    return this.getSupplier(supplierId);
  }

  // Delete supplier (soft delete)
  async deleteSupplier(supplierId, userId) {
    this.db.run('UPDATE suppliers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [supplierId]);
    return { success: true, message: 'Supplier deactivated successfully' };
  }

  // Search suppliers
  async searchSuppliers(query) {
    const result = this.db.exec(`
      SELECT * FROM suppliers 
      WHERE is_active = 1 AND 
            (name LIKE ? OR contact_person LIKE ? OR phone LIKE ? OR email LIKE ?)
      ORDER BY name ASC
      LIMIT 20
    `, [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]);

    return this._resultToObjects(result);
  }

  // ==================== PURCHASE ORDERS ====================

  // Generate PO number
  async generatePONumber() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const result = this.db.exec(`
      SELECT po_number FROM purchase_orders 
      WHERE po_number LIKE ?
      ORDER BY id DESC LIMIT 1
    `, [`PO-${today}-%`]);

    let counter = 1;
    if (result.length > 0 && result[0].values.length > 0) {
      const lastPO = result[0].values[0][0];
      const parts = lastPO.split('-');
      counter = parseInt(parts[2]) + 1;
    }

    return `PO-${today}-${String(counter).padStart(4, '0')}`;
  }

  // Create purchase order
  async createPurchaseOrder(poData, userId) {
    const poNumber = await this.generatePONumber();

    const result = this.db.prepare(`
      INSERT INTO purchase_orders 
      (po_number, supplier_id, order_date, expected_delivery_date, 
       status, total_amount, tax_amount, grand_total, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      poNumber,
      poData.supplier_id,
      poData.order_date || new Date().toISOString(),
      poData.expected_delivery_date || null,
      poData.status || 'draft',
      poData.total_amount || 0,
      poData.tax_amount || 0,
      poData.grand_total || 0,
      poData.notes || null,
      userId
    );

    const poId = result.lastInsertRowid;

    // Add items if provided
    if (poData.items && poData.items.length > 0) {
      for (const item of poData.items) {
        await this.addPurchaseOrderItem(poId, item, userId);
      }
    }

    return this.getPurchaseOrder(poId);
  }

  // Get purchase order by ID
  async getPurchaseOrder(poId) {
    const result = this.db.exec('SELECT * FROM purchase_orders WHERE id = ?', [poId]);
    const orders = this._resultToObjects(result);
    const po = orders[0] || null;

    if (po) {
      // Get items
      const itemsResult = this.db.exec('SELECT * FROM purchase_order_items WHERE po_id = ?', [poId]);
      po.items = this._resultToObjects(itemsResult);

      // Get supplier info
      if (po.supplier_id) {
        const supplierResult = this.db.exec('SELECT id, name, phone, email FROM suppliers WHERE id = ?', [po.supplier_id]);
        const suppliers = this._resultToObjects(supplierResult);
        po.supplier = suppliers[0] || null;
      }
    }

    return po;
  }

  // Get all purchase orders
  async getAllPurchaseOrders(statusFilter = null) {
    let query = 'SELECT * FROM purchase_orders';
    const params = [];

    if (statusFilter) {
      query += ' WHERE status = ?';
      params.push(statusFilter);
    }

    query += ' ORDER BY order_date DESC';

    const result = this.db.exec(query, params);
    const orders = this._resultToObjects(result);

    // Enrich with supplier info
    for (const order of orders) {
      if (order.supplier_id) {
        const supplierResult = this.db.exec('SELECT id, name, phone, email FROM suppliers WHERE id = ?', [order.supplier_id]);
        const suppliers = this._resultToObjects(supplierResult);
        order.supplier = suppliers[0] || null;
      }
    }

    return orders;
  }

  // Add item to purchase order
  async addPurchaseOrderItem(poId, itemData, userId) {
    const result = this.db.prepare(`
      INSERT INTO purchase_order_items 
      (po_id, menu_item_id, quantity, unit_price, total_price, received_quantity)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      poId,
      itemData.menu_item_id,
      itemData.quantity,
      itemData.unit_price,
      itemData.total_price,
      itemData.received_quantity || 0
    );

    const itemId = result.lastInsertRowid;

    // Update PO totals
    await this._updatePOTotals(poId);

    return this.getPurchaseOrderItem(itemId);
  }

  // Get purchase order item
  async getPurchaseOrderItem(itemId) {
    const result = this.db.exec('SELECT * FROM purchase_order_items WHERE id = ?', [itemId]);
    const items = this._resultToObjects(result);
    return items[0] || null;
  }

  // Update purchase order item
  async updatePurchaseOrderItem(itemId, itemData, userId) {
    this.db.run(`
      UPDATE purchase_order_items SET 
        quantity = ?,
        unit_price = ?,
        total_price = ?,
        received_quantity = ?
      WHERE id = ?
    `, [
      itemData.quantity,
      itemData.unit_price,
      itemData.total_price,
      itemData.received_quantity || 0,
      itemId
    ]);

    // Get PO ID
    const item = await this.getPurchaseOrderItem(itemId);
    if (item) {
      await this._updatePOTotals(item.po_id);
    }

    return this.getPurchaseOrderItem(itemId);
  }

  // Delete purchase order item
  async deletePurchaseOrderItem(itemId, userId) {
    const item = await this.getPurchaseOrderItem(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    this.db.run('DELETE FROM purchase_order_items WHERE id = ?', [itemId]);

    // Update PO totals
    await this._updatePOTotals(item.po_id);

    return { success: true, message: 'Item deleted successfully' };
  }

  // Update PO status
  async updatePOStatus(poId, status, userId) {
    this.db.run(`
      UPDATE purchase_orders SET 
        status = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, userId, poId]);

    return this.getPurchaseOrder(poId);
  }

  // Receive purchase order items
  async receivePOItems(poId, itemsData, userId) {
    for (const item of itemsData) {
      await this.db.run(`
        UPDATE purchase_order_items SET 
          received_quantity = ?,
          status = ?
        WHERE id = ?
      `, [item.received_quantity, item.status || 'received', item.id]);

      // Update inventory stock
      if (item.received_quantity > 0) {
        const quantityChange = item.received_quantity - (item.received_quantity_before || 0);
        if (quantityChange > 0) {
          await this.db.run(`
            UPDATE menu_items SET 
              stock_quantity = stock_quantity + ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [quantityChange, item.menu_item_id]);

          // Record inventory transaction
          await this.db.run(`
            INSERT INTO inventory_transactions 
            (menu_item_id, transaction_type, quantity, reason, created_by)
            VALUES (?, ?, ?, ?, ?)
          `, [
            item.menu_item_id,
            'purchase',
            quantityChange,
            `PO #${poId} - Received from supplier`,
            userId
          ]);
        }
      }
    }

    // Update PO status to 'received' if all items are received
    const po = await this.getPurchaseOrder(poId);
    const allReceived = po.items.every(item => item.received_quantity >= item.quantity);

    if (allReceived) {
      await this.updatePOStatus(poId, 'received', userId);
    }

    return { success: true, message: 'Items received successfully' };
  }

  // Update PO totals
  async _updatePOTotals(poId) {
    const itemsResult = this.db.exec('SELECT SUM(total_price) as total FROM purchase_order_items WHERE po_id = ?', [poId]);
    const total = itemsResult.length > 0 && itemsResult[0].values.length > 0 
      ? itemsResult[0].values[0][0] 
      : 0;

    // Calculate tax (12% for purchases)
    const taxAmount = total * 0.12;
    const grandTotal = total + taxAmount;

    this.db.run(`
      UPDATE purchase_orders SET 
        total_amount = ?,
        tax_amount = ?,
        grand_total = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [total, taxAmount, grandTotal, poId]);
  }

  // ==================== REORDER LEVELS ====================

  // Set reorder level for item
  async setReorderLevel(itemId, threshold, leadTimeDays, supplierId) {
    const existingResult = this.db.exec('SELECT id FROM reorder_levels WHERE menu_item_id = ?', [itemId]);
    const exists = existingResult.length > 0 && existingResult[0].values.length > 0;

    if (exists) {
      this.db.run(`
        UPDATE reorder_levels SET 
          reorder_threshold = ?,
          lead_time_days = ?,
          supplier_id = ?,
          last_reordered = NULL
        WHERE menu_item_id = ?
      `, [threshold, leadTimeDays, supplierId, itemId]);
    } else {
      this.db.run(`
        INSERT INTO reorder_levels 
        (menu_item_id, reorder_threshold, lead_time_days, supplier_id)
        VALUES (?, ?, ?, ?)
      `, [itemId, threshold, leadTimeDays, supplierId]);
    }

    return { success: true, message: 'Reorder level updated successfully' };
  }

  // Get reorder level for item
  async getReorderLevel(itemId) {
    const result = this.db.exec('SELECT * FROM reorder_levels WHERE menu_item_id = ?', [itemId]);
    const levels = this._resultToObjects(result);
    return levels[0] || null;
  }

  // Get items needing reorder
  async getItemsNeedingReorder() {
    const result = this.db.exec(`
      SELECT mi.*, rl.reorder_threshold, rl.lead_time_days, rl.supplier_id,
             s.name as supplier_name, s.phone as supplier_phone
      FROM menu_items mi
      LEFT JOIN reorder_levels rl ON mi.id = rl.menu_item_id
      LEFT JOIN suppliers s ON rl.supplier_id = s.id
      WHERE mi.stock_quantity <= COALESCE(rl.reorder_threshold, mi.low_stock_threshold)
        AND mi.is_available = 1
      ORDER BY mi.stock_quantity ASC
    `);

    return this._resultToObjects(result);
  }

  // ==================== INVENTORY ALERTS ====================

  // Create inventory alert
  async createAlert(itemId, alertType, message, userId) {
    const result = this.db.prepare(`
      INSERT INTO inventory_alerts 
      (menu_item_id, alert_type, message, created_at)
      VALUES (?, ?, ?, ?)
    `).run(itemId, alertType, message, new Date().toISOString());

    const alertId = result.lastInsertRowid;
    return this.getAlert(alertId);
  }

  // Get alert by ID
  async getAlert(alertId) {
    const result = this.db.exec('SELECT * FROM inventory_alerts WHERE id = ?', [alertId]);
    const alerts = this._resultToObjects(result);
    return alerts[0] || null;
  }

  // Get all alerts
  async getAllAlerts(resolvedFilter = null) {
    let query = 'SELECT * FROM inventory_alerts';
    const params = [];

    if (resolvedFilter !== null) {
      query += ' WHERE is_resolved = ?';
      params.push(resolvedFilter ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';

    const result = this.db.exec(query, params);
    return this._resultToObjects(result);
  }

  // Resolve alert
  async resolveAlert(alertId, userId) {
    this.db.run(`
      UPDATE inventory_alerts SET 
        is_resolved = 1,
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by = ?
      WHERE id = ?
    `, [userId, alertId]);

    return { success: true, message: 'Alert resolved successfully' };
  }

  // ==================== INVENTORY TRANSFERS ====================

  // Generate transfer number
  async generateTransferNumber() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const result = this.db.exec(`
      SELECT transfer_number FROM inventory_transfers 
      WHERE transfer_number LIKE ?
      ORDER BY id DESC LIMIT 1
    `, [`TRF-${today}-%`]);

    let counter = 1;
    if (result.length > 0 && result[0].values.length > 0) {
      const lastTransfer = result[0].values[0][0];
      const parts = lastTransfer.split('-');
      counter = parseInt(parts[2]) + 1;
    }

    return `TRF-${today}-${String(counter).padStart(4, '0')}`;
  }

  // Create inventory transfer
  async createTransfer(transferData, userId) {
    const transferNumber = await this.generateTransferNumber();

    const result = this.db.prepare(`
      INSERT INTO inventory_transfers 
      (transfer_number, from_location, to_location, status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      transferNumber,
      transferData.from_location,
      transferData.to_location,
      transferData.status || 'pending',
      transferData.notes || null,
      userId
    );

    const transferId = result.lastInsertRowid;

    // Add items if provided
    if (transferData.items && transferData.items.length > 0) {
      for (const item of transferData.items) {
        await this.addTransferItem(transferId, item, userId);
      }
    }

    return this.getTransfer(transferId);
  }

  // Get transfer by ID
  async getTransfer(transferId) {
    const result = this.db.exec('SELECT * FROM inventory_transfers WHERE id = ?', [transferId]);
    const transfers = this._resultToObjects(result);
    const transfer = transfers[0] || null;

    if (transfer) {
      // Get items
      const itemsResult = this.db.exec('SELECT * FROM inventory_transfer_items WHERE transfer_id = ?', [transferId]);
      transfer.items = this._resultToObjects(itemsResult);
    }

    return transfer;
  }

  // Add item to transfer
  async addTransferItem(transferId, itemData, userId) {
    const result = this.db.prepare(`
      INSERT INTO inventory_transfer_items 
      (transfer_id, menu_item_id, quantity, status)
      VALUES (?, ?, ?, ?)
    `).run(
      transferId,
      itemData.menu_item_id,
      itemData.quantity,
      itemData.status || 'pending'
    );

    return { success: true, itemId: result.lastInsertRowid };
  }

  // Complete transfer
  async completeTransfer(transferId, userId) {
    // Update transfer status
    this.db.run(`
      UPDATE inventory_transfers SET 
        status = 'completed',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [transferId]);

    // Update items status
    this.db.run('UPDATE inventory_transfer_items SET status = ? WHERE transfer_id = ?', ['completed', transferId]);

    // Update inventory (simplified - in real app, would need to handle from/to locations)
    const transfer = await this.getTransfer(transferId);
    for (const item of transfer.items) {
      // For now, just update stock (in multi-location, would need to track per location)
      await this.db.run(`
        UPDATE menu_items SET 
          stock_quantity = stock_quantity + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [item.quantity, item.menu_item_id]);

      // Record transaction
      await this.db.run(`
        INSERT INTO inventory_transactions 
        (menu_item_id, transaction_type, quantity, reason, created_by)
        VALUES (?, ?, ?, ?, ?)
      `, [
        item.menu_item_id,
        'transfer',
        item.quantity,
        `Transfer #${transfer.transfer_number} - ${transfer.from_location} to ${transfer.to_location}`,
        userId
      ]);
    }

    return { success: true, message: 'Transfer completed successfully' };
  }

  // ==================== REPORTING ====================

  // Get inventory summary report
  async getInventorySummary() {
    const result = this.db.exec(`
      SELECT 
        COUNT(*) as total_items,
        SUM(stock_quantity) as total_stock,
        AVG(stock_quantity) as avg_stock,
        SUM(CASE WHEN stock_quantity <= low_stock_threshold THEN 1 ELSE 0 END) as low_stock_items,
        SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock_items
      FROM menu_items
      WHERE is_available = 1
    `);

    const summary = this._resultToObjects(result)[0] || {};
    return {
      total_items: summary.total_items || 0,
      total_stock: summary.total_stock || 0,
      average_stock: summary.avg_stock || 0,
      low_stock_items: summary.low_stock_items || 0,
      out_of_stock_items: summary.out_of_stock_items || 0
    };
  }

  // Get stock movement report
  async getStockMovementReport(startDate, endDate) {
    const result = this.db.exec(`
      SELECT 
        mi.name as item_name,
        mi.category_id,
        c.name as category_name,
        SUM(CASE WHEN it.transaction_type = 'purchase' THEN it.quantity ELSE 0 END) as purchased,
        SUM(CASE WHEN it.transaction_type = 'add' THEN it.quantity ELSE 0 END) as manual_add,
        SUM(CASE WHEN it.transaction_type = 'remove' THEN it.quantity ELSE 0 END) as manual_remove,
        SUM(CASE WHEN it.transaction_type = 'transfer' THEN it.quantity ELSE 0 END) as transfers,
        SUM(it.quantity) as net_change,
        mi.stock_quantity as current_stock
      FROM inventory_transactions it
      JOIN menu_items mi ON it.menu_item_id = mi.id
      LEFT JOIN categories c ON mi.category_id = c.id
      WHERE DATE(it.created_at) BETWEEN ? AND ?
      GROUP BY mi.id, mi.name, mi.category_id, c.name
      ORDER BY net_change DESC
    `, [startDate, endDate]);

    return this._resultToObjects(result);
  }

  // Get purchase order report
  async getPurchaseOrderReport(startDate, endDate, statusFilter = null) {
    let query = `
      SELECT 
        po.*,
        s.name as supplier_name,
        s.phone as supplier_phone,
        COUNT(poi.id) as item_count
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN purchase_order_items poi ON po.id = poi.po_id
    `;

    const params = [];

    if (statusFilter) {
      query += ' WHERE po.status = ?';
      params.push(statusFilter);
    }

    query += ` AND DATE(po.order_date) BETWEEN ? AND ?
      GROUP BY po.id, s.name, s.phone
      ORDER BY po.order_date DESC`;

    params.push(startDate, endDate);

    const result = this.db.exec(query, params);
    return this._resultToObjects(result);
  }

  // Get supplier performance report
  async getSupplierPerformanceReport(startDate, endDate) {
    const result = this.db.exec(`
      SELECT
        s.id,
        s.name,
        s.phone,
        s.email,
        COUNT(po.id) as total_orders,
        SUM(po.grand_total) as total_spent,
        AVG(po.grand_total) as avg_order_value,
        SUM(CASE WHEN po.status = 'received' THEN 1 ELSE 0 END) as on_time_deliveries,
        SUM(CASE WHEN po.status = 'received' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(po.id), 0) as on_time_percentage
      FROM suppliers s
      LEFT JOIN purchase_orders po ON s.id = po.supplier_id
      WHERE DATE(po.order_date) BETWEEN ? AND ?
      GROUP BY s.id, s.name, s.phone, s.email
      ORDER BY total_spent DESC
    `, [startDate, endDate]);

    return this._resultToObjects(result);
  }

  // ==================== WEIGHT TRACKING ====================

  // Initialize weight tracking for an item
  async initializeWeightTracking(menuItemId, currentWeight, maxWeight, weightUnit = 'gram') {
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

    return { success: true, message: 'Weight tracking initialized' };
  }

  // Get weight tracking for an item
  async getWeightTracking(menuItemId) {
    const result = this.db.exec('SELECT * FROM inventory_items WHERE menu_item_id = ?', [menuItemId]);
    const items = this._resultToObjects(result);
    return items[0] || null;
  }

  // Update weight after sale
  async updateWeightAfterSale(menuItemId, weightUsed, weightUnit = 'gram', orderId = null, orderItemId = null) {
    const inventory = await this.getWeightTracking(menuItemId);

    if (!inventory) {
      throw new Error('Weight tracking not initialized for this item');
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

  // Restock weight
  async restockWeight(menuItemId, weightAdded, weightUnit = 'gram') {
    const inventory = await this.getWeightTracking(menuItemId);

    if (!inventory) {
      throw new Error('Weight tracking not initialized for this item');
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

  // ==================== VOID/REFUND INVENTORY REVERSAL ====================

  // Reverse inventory for voided items
  async reverseInventoryForVoid(orderId, itemId = null, quantity = null, userId) {
    try {
      let itemsToReverse = [];
      
      if (itemId) {
        // Reverse inventory for specific item
        const item = await this.db.get(
          'SELECT * FROM order_items WHERE id = ?',
          [itemId]
        );
        
        if (!item) {
          throw new Error('Order item not found');
        }
        
        itemsToReverse.push({
          product_id: item.product_id,
          quantity: quantity || item.quantity,
          item_id: itemId
        });
      } else {
        // Reverse inventory for all items in order
        const items = await this.db.all(
          'SELECT * FROM order_items WHERE order_id = ? AND item_void_status = ?',
          [orderId, 'ACTIVE']
        );
        
        itemsToReverse = items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          item_id: item.id
        }));
      }
      
      // Process each item
      for (const item of itemsToReverse) {
        await this._reverseInventoryForProduct(item.product_id, item.quantity, userId, orderId, item.item_id);
      }
      
      return { success: true, message: 'Inventory reversed successfully' };
    } catch (error) {
      console.error('Error reversing inventory:', error);
      throw error;
    }
  }

  // Reverse inventory for a specific product
  async _reverseInventoryForProduct(productId, quantity, userId, orderId = null, orderItemId = null) {
    try {
      // Get current inventory
      const inventory = await this.db.get(
        'SELECT * FROM inventory WHERE product_id = ?',
        [productId]
      );
      
      if (!inventory) {
        // Create inventory record if it doesn't exist
        await this.db.run(
          'INSERT INTO inventory (product_id, quantity) VALUES (?, ?)',
          [productId, 0]
        );
        
        // Get the newly created inventory
        const newInventory = await this.db.get(
          'SELECT * FROM inventory WHERE product_id = ?',
          [productId]
        );
        
        // Update with the reversed quantity
        const newQuantity = newInventory.quantity + quantity;
        await this.db.run(
          'UPDATE inventory SET quantity = ? WHERE product_id = ?',
          [newQuantity, productId]
        );
        
        // Log transaction
        await this.db.run(
          `INSERT INTO inventory_transactions
           (product_id, transaction_type, quantity, reason, created_by, order_id, order_item_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            productId,
            'void',
            quantity,
            `Void/Refund - Order #${orderId || 'N/A'}`,
            userId,
            orderId || null,
            orderItemId || null
          ]
        );
        
        return { success: true, newQuantity };
      }
      
      // Update existing inventory
      const newQuantity = inventory.quantity + quantity;
      await this.db.run(
        'UPDATE inventory SET quantity = ? WHERE product_id = ?',
        [newQuantity, productId]
      );
      
      // Log transaction
      await this.db.run(
        `INSERT INTO inventory_transactions
         (product_id, transaction_type, quantity, reason, created_by, order_id, order_item_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          productId,
          'void',
          quantity,
          `Void/Refund - Order #${orderId || 'N/A'}`,
          userId,
          orderId || null,
          orderItemId || null
        ]
      );
      
      return { success: true, newQuantity };
    } catch (error) {
      console.error('Error reversing inventory for product:', error);
      throw error;
    }
  }

  // Reverse weight inventory for voided items
  async reverseWeightInventoryForVoid(orderId, itemId = null, weightUsed = null, weightUnit = 'gram', userId) {
    try {
      if (itemId) {
        // Get the order item
        const item = await this.db.get(
          'SELECT * FROM order_items WHERE id = ?',
          [itemId]
        );
        
        if (!item) {
          throw new Error('Order item not found');
        }
        
        // Reverse the weight
        const result = await this.restockWeight(item.product_id, weightUsed || item.item_weight, weightUnit);
        
        // Log the void transaction
        await this.db.run(
          `INSERT INTO inventory_weight_logs
           (menu_item_id, order_id, order_item_id, weight_used, weight_unit, current_stock, transaction_type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            item.product_id,
            orderId,
            itemId,
            weightUsed || item.item_weight,
            weightUnit,
            result.newWeight,
            'void'
          ]
        );
        
        return result;
      }
      
      // For full order void, reverse all weighted items
      const items = await this.db.all(
        'SELECT * FROM order_items WHERE order_id = ? AND item_weight > 0 AND item_void_status = ?',
        [orderId, 'ACTIVE']
      );
      
      for (const item of items) {
        await this.restockWeight(item.product_id, item.item_weight, item.weight_unit || 'gram');
        
        await this.db.run(
          `INSERT INTO inventory_weight_logs
           (menu_item_id, order_id, order_item_id, weight_used, weight_unit, current_stock, transaction_type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            item.product_id,
            orderId,
            item.id,
            item.item_weight,
            item.weight_unit || 'gram',
            result.newWeight,
            'void'
          ]
        );
      }
      
      return { success: true, message: 'Weight inventory reversed for all items' };
    } catch (error) {
      console.error('Error reversing weight inventory:', error);
      throw error;
    }
  }
}

module.exports = InventoryManager;
