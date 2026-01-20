// Order Hold/Cancel Management System
// Enhances order management with hold functionality and improved cancellation

class OrderHoldManager {
  constructor(db) {
    this.db = db;
  }

  // Initialize hold manager
  async init() {
    try {
      // Add hold_status field to orders table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS order_holds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER UNIQUE NOT NULL,
          hold_reason TEXT,
          hold_notes TEXT,
          hold_expiry DATETIME,
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          released_by INTEGER,
          released_at DATETIME,
          FOREIGN KEY (order_id) REFERENCES orders(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (released_by) REFERENCES users(id)
        )
      `);

      // Create cancellation_reasons table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS cancellation_reasons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reason TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create order_cancellations table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS order_cancellations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER UNIQUE NOT NULL,
          cancellation_reason_id INTEGER,
          custom_reason TEXT,
          refund_amount REAL DEFAULT 0,
          refund_status TEXT DEFAULT 'not_applied',
          cancelled_by INTEGER,
          cancelled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          notes TEXT,
          FOREIGN KEY (order_id) REFERENCES orders(id),
          FOREIGN KEY (cancellation_reason_id) REFERENCES cancellation_reasons(id),
          FOREIGN KEY (cancelled_by) REFERENCES users(id)
        )
      `);

      // Create hold_timeout_settings table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS hold_timeout_settings (
          id INTEGER PRIMARY KEY,
          default_timeout_minutes INTEGER DEFAULT 30,
          max_timeout_minutes INTEGER DEFAULT 120,
          auto_release_enabled INTEGER DEFAULT 1,
          notification_enabled INTEGER DEFAULT 1,
          notification_interval_minutes INTEGER DEFAULT 5
        )
      `);

      // Initialize default hold timeout settings
      await this._initHoldTimeoutSettings();

      // Initialize default cancellation reasons
      await this._initDefaultCancellationReasons();

      console.log('Order Hold/Cancel Manager initialized');
    } catch (error) {
      console.error('Error initializing order hold manager:', error);
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

  // Initialize hold timeout settings
  async _initHoldTimeoutSettings() {
    const result = this.db.exec('SELECT COUNT(*) as count FROM hold_timeout_settings');
    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;

    if (count === 0) {
      this.db.run(`
        INSERT INTO hold_timeout_settings 
        (default_timeout_minutes, max_timeout_minutes, auto_release_enabled, notification_enabled, notification_interval_minutes)
        VALUES (?, ?, ?, ?, ?)
      `, [30, 120, 1, 1, 5]);
    }
  }

  // Initialize default cancellation reasons
  async _initDefaultCancellationReasons() {
    const result = this.db.exec('SELECT COUNT(*) as count FROM cancellation_reasons');
    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;

    if (count === 0) {
      const reasons = [
        'Customer changed mind',
        'Wrong order',
        'Late delivery',
        'Quality issue',
        'Payment issue',
        'Technical error',
        'Other'
      ];

      for (const reason of reasons) {
        this.db.run('INSERT INTO cancellation_reasons (reason) VALUES (?)', [reason]);
      }

      console.log('Default cancellation reasons initialized');
    }
  }

  // Get hold timeout settings
  async getHoldTimeoutSettings() {
    const result = this.db.exec('SELECT * FROM hold_timeout_settings LIMIT 1');
    const settings = this._resultToObjects(result);
    return settings[0] || null;
  }

  // Update hold timeout settings
  async updateHoldTimeoutSettings(settings) {
    this.db.run(`
      INSERT OR REPLACE INTO hold_timeout_settings 
      (id, default_timeout_minutes, max_timeout_minutes, auto_release_enabled, notification_enabled, notification_interval_minutes)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      settings.id || 1,
      settings.default_timeout_minutes || 30,
      settings.max_timeout_minutes || 120,
      settings.auto_release_enabled || 1,
      settings.notification_enabled || 1,
      settings.notification_interval_minutes || 5
    ]);

    return { success: true, message: 'Hold timeout settings updated successfully' };
  }

  // Get all cancellation reasons
  async getAllCancellationReasons(activeOnly = true) {
    let query = 'SELECT * FROM cancellation_reasons';
    const params = [];

    if (activeOnly) {
      query += ' WHERE is_active = 1';
    }

    query += ' ORDER BY reason ASC';

    const result = this.db.exec(query, params);
    return this._resultToObjects(result);
  }

  // Add cancellation reason
  async addCancellationReason(reason) {
    const result = this.db.prepare('INSERT INTO cancellation_reasons (reason) VALUES (?)').run(reason);
    return { success: true, id: result.lastInsertRowid };
  }

  // Update cancellation reason
  async updateCancellationReason(id, reason, isActive) {
    this.db.run(`
      UPDATE cancellation_reasons SET 
        reason = ?,
        is_active = ?
      WHERE id = ?
    `, [reason, isActive ? 1 : 0, id]);

    return { success: true, message: 'Cancellation reason updated successfully' };
  }

  // ==================== HOLD ORDER FUNCTIONS ====================

  // Place order on hold
  async holdOrder(orderId, reason, notes, timeoutMinutes, userId) {
    // Validate order exists and is in valid status
    const orderResult = this.db.exec('SELECT status FROM orders WHERE id = ?', [orderId]);
    const orders = this._resultToObjects(orderResult);

    if (orders.length === 0) {
      throw new Error('Order not found');
    }

    const orderStatus = orders[0].status;
    if (orderStatus !== 'pending' && orderStatus !== 'processing') {
      throw new Error('Order cannot be held in current status');
    }

    // Check if already on hold
    const holdResult = this.db.exec('SELECT id FROM order_holds WHERE order_id = ?', [orderId]);
    if (holdResult.length > 0 && holdResult[0].values.length > 0) {
      throw new Error('Order is already on hold');
    }

    // Calculate expiry time
    const expiryDate = new Date();
    expiryDate.setMinutes(expiryDate.getMinutes() + (timeoutMinutes || 30));

    // Create hold record
    this.db.run(`
      INSERT INTO order_holds 
      (order_id, hold_reason, hold_notes, hold_expiry, created_by)
      VALUES (?, ?, ?, ?, ?)
    `, [orderId, reason, notes, expiryDate.toISOString(), userId]);

    // Update order status
    this.db.run('UPDATE orders SET status = ? WHERE id = ?', ['on_hold', orderId]);

    return { success: true, message: 'Order placed on hold successfully' };
  }

  // Release order from hold
  async releaseOrder(orderId, userId) {
    // Check if order is on hold
    const holdResult = this.db.exec('SELECT id FROM order_holds WHERE order_id = ? AND released_at IS NULL', [orderId]);
    if (holdResult.length === 0 || holdResult[0].values.length === 0) {
      throw new Error('Order is not on hold or already released');
    }

    const holdId = holdResult[0].values[0][0];

    // Release hold
    this.db.run(`
      UPDATE order_holds SET 
        released_by = ?,
        released_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [userId, holdId]);

    // Restore order status to processing
    this.db.run('UPDATE orders SET status = ? WHERE id = ?', ['processing', orderId]);

    return { success: true, message: 'Order released from hold successfully' };
  }

  // Get hold information for order
  async getOrderHold(orderId) {
    const result = this.db.exec(`
      SELECT oh.*, u.username as created_by_name, r.username as released_by_name
      FROM order_holds oh
      LEFT JOIN users u ON oh.created_by = u.id
      LEFT JOIN users r ON oh.released_by = r.id
      WHERE oh.order_id = ?
    `, [orderId]);

    const holds = this._resultToObjects(result);
    return holds[0] || null;
  }

  // Check if order is on hold
  async isOrderOnHold(orderId) {
    const result = this.db.exec(`
      SELECT COUNT(*) as count FROM order_holds 
      WHERE order_id = ? AND released_at IS NULL
    `, [orderId]);

    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
    return count > 0;
  }

  // Get all held orders
  async getHeldOrders() {
    const result = this.db.exec(`
      SELECT o.*, oh.hold_reason, oh.hold_notes, oh.hold_expiry,
             u.username as held_by_name,
             DATEDIFF('seconds', CURRENT_TIMESTAMP, oh.hold_expiry) as seconds_remaining
      FROM orders o
      JOIN order_holds oh ON o.id = oh.order_id
      LEFT JOIN users u ON oh.created_by = u.id
      WHERE o.status = 'on_hold'
      ORDER BY oh.hold_expiry ASC
    `);

    return this._resultToObjects(result);
  }

  // Extend hold time
  async extendHold(orderId, additionalMinutes, userId) {
    // Check if order is on hold
    const hold = await this.getOrderHold(orderId);
    if (!hold) {
      throw new Error('Order is not on hold');
    }

    // Calculate new expiry
    const currentExpiry = new Date(hold.hold_expiry);
    currentExpiry.setMinutes(currentExpiry.getMinutes() + additionalMinutes);

    // Update hold expiry
    this.db.run(`
      UPDATE order_holds SET 
        hold_expiry = ?,
        hold_notes = COALESCE(hold_notes, '') || ?
      WHERE id = ?
    `, [currentExpiry.toISOString(), `\nExtended by ${additionalMinutes} minutes on ${new Date().toISOString()}`, hold.id]);

    return { success: true, message: 'Hold time extended successfully' };
  }

  // Auto-release expired holds
  async autoReleaseExpiredHolds() {
    const result = this.db.exec(`
      SELECT oh.id, oh.order_id FROM order_holds oh
      WHERE oh.hold_expiry < CURRENT_TIMESTAMP AND oh.released_at IS NULL
    `);

    const holds = this._resultToObjects(result);
    let releasedCount = 0;

    for (const hold of holds) {
      try {
        // Release the hold (no user ID for auto-release)
        this.db.run('UPDATE order_holds SET released_at = CURRENT_TIMESTAMP WHERE id = ?', [hold.id]);
        
        // Update order status to completed (since it expired, assume it was meant to be completed)
        this.db.run('UPDATE orders SET status = ? WHERE id = ?', ['completed', hold.order_id]);
        
        releasedCount++;
      } catch (error) {
        console.error(`Error releasing hold ${hold.id}:`, error);
      }
    }

    return { success: true, releasedCount };
  }

  // ==================== CANCEL ORDER FUNCTIONS ====================

  // Cancel order with reason
  async cancelOrder(orderId, cancellationReasonId, customReason, refundAmount, notes, userId) {
    // Validate order exists
    const orderResult = this.db.exec('SELECT status FROM orders WHERE id = ?', [orderId]);
    const orders = this._resultToObjects(orderResult);

    if (orders.length === 0) {
      throw new Error('Order not found');
    }

    const orderStatus = orders[0].status;
    if (orderStatus === 'completed' || orderStatus === 'cancelled') {
      throw new Error('Order cannot be cancelled in current status');
    }

    // Check if already cancelled
    const cancelResult = this.db.exec('SELECT id FROM order_cancellations WHERE order_id = ?', [orderId]);
    if (cancelResult.length > 0 && cancelResult[0].values.length > 0) {
      throw new Error('Order is already cancelled');
    }

    // Create cancellation record
    this.db.run(`
      INSERT INTO order_cancellations 
      (order_id, cancellation_reason_id, custom_reason, refund_amount, 
       refund_status, cancelled_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      orderId,
      cancellationReasonId || null,
      customReason || null,
      refundAmount || 0,
      'not_applied',
      userId,
      notes || null
    ]);

    // Update order status
    this.db.run('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', orderId]);

    // If order was on hold, release it
    const hold = await this.getOrderHold(orderId);
    if (hold) {
      this.db.run('UPDATE order_holds SET released_at = CURRENT_TIMESTAMP WHERE id = ?', [hold.id]);
    }

    return { success: true, message: 'Order cancelled successfully' };
  }

  // Get cancellation information for order
  async getOrderCancellation(orderId) {
    const result = this.db.exec(`
      SELECT oc.*, 
             cr.reason as cancellation_reason,
             u.username as cancelled_by_name
      FROM order_cancellations oc
      LEFT JOIN cancellation_reasons cr ON oc.cancellation_reason_id = cr.id
      LEFT JOIN users u ON oc.cancelled_by = u.id
      WHERE oc.order_id = ?
    `, [orderId]);

    const cancellations = this._resultToObjects(result);
    return cancellations[0] || null;
  }

  // Get all cancelled orders
  async getCancelledOrders() {
    const result = this.db.exec(`
      SELECT o.*, oc.cancellation_reason_id, oc.custom_reason, oc.refund_amount,
             oc.refund_status, oc.notes, oc.cancelled_at,
             u.username as cancelled_by_name,
             cr.reason as cancellation_reason
      FROM orders o
      JOIN order_cancellations oc ON o.id = oc.order_id
      LEFT JOIN users u ON oc.cancelled_by = u.id
      LEFT JOIN cancellation_reasons cr ON oc.cancellation_reason_id = cr.id
      WHERE o.status = 'cancelled'
      ORDER BY oc.cancelled_at DESC
    `);

    return this._resultToObjects(result);
  }

  // Update refund status
  async updateRefundStatus(cancellationId, refundStatus, refundAmount) {
    this.db.run(`
      UPDATE order_cancellations SET 
        refund_status = ?,
        refund_amount = ?
      WHERE id = ?
    `, [refundStatus, refundAmount || 0, cancellationId]);

    return { success: true, message: 'Refund status updated successfully' };
  }

  // ==================== REPORTING ====================

  // Get hold/cancel statistics
  async getHoldCancelStatistics() {
    const today = new Date().toISOString().split('T')[0];

    // Held orders today
    const heldTodayResult = this.db.exec(`
      SELECT COUNT(*) as count FROM order_holds 
      WHERE DATE(created_at) = ?
    `, [today]);

    // Cancelled orders today
    const cancelledTodayResult = this.db.exec(`
      SELECT COUNT(*) as count FROM order_cancellations 
      WHERE DATE(cancelled_at) = ?
    `, [today]);

    // Active holds
    const activeHoldsResult = this.db.exec(`
      SELECT COUNT(*) as count FROM order_holds 
      WHERE released_at IS NULL
    `);

    // Hold duration average
    const holdDurationResult = this.db.exec(`
      SELECT AVG(JULIANDAY(released_at) - JULIANDAY(created_at)) * 24 * 60 as avg_minutes 
      FROM order_holds 
      WHERE released_at IS NOT NULL
    `);

    const heldToday = heldTodayResult.length > 0 && heldTodayResult[0].values.length > 0 
      ? heldTodayResult[0].values[0][0] 
      : 0;

    const cancelledToday = cancelledTodayResult.length > 0 && cancelledTodayResult[0].values.length > 0 
      ? cancelledTodayResult[0].values[0][0] 
      : 0;

    const activeHolds = activeHoldsResult.length > 0 && activeHoldsResult[0].values.length > 0 
      ? activeHoldsResult[0].values[0][0] 
      : 0;

    const avgHoldDuration = holdDurationResult.length > 0 && holdDurationResult[0].values.length > 0 
      ? holdDurationResult[0].values[0][0] 
      : 0;

    return {
      held_today: heldToday,
      cancelled_today: cancelledToday,
      active_holds: activeHolds,
      average_hold_duration_minutes: avgHoldDuration
    };
  }

  // Get hold/cancel report by date range
  async getHoldCancelReport(startDate, endDate) {
    const result = this.db.exec(`
      SELECT 
        DATE(o.created_at) as date,
        COUNT(CASE WHEN o.status = 'on_hold' THEN 1 END) as held_orders,
        COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) as cancelled_orders,
        SUM(CASE WHEN o.status = 'on_hold' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as hold_percentage,
        SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as cancel_percentage
      FROM orders o
      WHERE DATE(o.created_at) BETWEEN ? AND ?
      GROUP BY DATE(o.created_at)
      ORDER BY date ASC
    `, [startDate, endDate]);

    return this._resultToObjects(result);
  }

  // Get cancellation reasons report
  async getCancellationReasonsReport(startDate, endDate) {
    const result = this.db.exec(`
      SELECT 
        cr.id,
        cr.reason,
        COUNT(oc.id) as count,
        COUNT(oc.id) * 100.0 / NULLIF((
          SELECT COUNT(*) FROM order_cancellations oc2
          WHERE DATE(oc2.cancelled_at) BETWEEN ? AND ?
        ), 0) as percentage
      FROM cancellation_reasons cr
      LEFT JOIN order_cancellations oc ON cr.id = oc.cancellation_reason_id
      WHERE DATE(oc.cancelled_at) BETWEEN ? AND ?
      GROUP BY cr.id, cr.reason
      ORDER BY count DESC
    `, [startDate, endDate, startDate, endDate]);

    return this._resultToObjects(result);
  }

  // Get hold duration distribution
  async getHoldDurationDistribution() {
    const result = this.db.exec(`
      SELECT 
        CASE 
          WHEN JULIANDAY(oh.released_at) - JULIANDAY(oh.created_at) * 24 * 60 < 15 THEN '0-15 minutes'
          WHEN JULIANDAY(oh.released_at) - JULIANDAY(oh.created_at) * 24 * 60 < 30 THEN '15-30 minutes'
          WHEN JULIANDAY(oh.released_at) - JULIANDAY(oh.created_at) * 24 * 60 < 60 THEN '30-60 minutes'
          ELSE '60+ minutes'
        END as duration_range,
        COUNT(*) as count
      FROM order_holds oh
      WHERE oh.released_at IS NOT NULL
      GROUP BY duration_range
      ORDER BY 
        CASE duration_range 
          WHEN '0-15 minutes' THEN 1
          WHEN '15-30 minutes' THEN 2
          WHEN '30-60 minutes' THEN 3
          ELSE 4
        END
    `);

    return this._resultToObjects(result);
  }
}

module.exports = OrderHoldManager;
