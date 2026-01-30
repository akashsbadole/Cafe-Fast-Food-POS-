// Inventory Logging Module
// This file contains logging functionality for inventory management actions

const db = require('./database');

// Log inventory actions to database
async function logInventoryAction(itemId, action, description, userId) {
  try {
    const query = `
      INSERT INTO inventory_logs 
      (item_id, action, description, user_id, created_at) 
      VALUES (?, ?, ?, ?, NOW())
    `;
    
    await db.execute(query, [itemId, action, description, userId]);
  } catch (error) {
    console.error('Error logging inventory action:', error);
    // Don't throw error to prevent breaking the main operation
  }
}

// Get inventory action logs
async function getInventoryLogs(itemId = null, limit = 100, offset = 0) {
  try {
    let query = `
      SELECT l.*, 
             u.username as user_name,
             i.name as item_name
      FROM inventory_logs l
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN inventory_items i ON l.item_id = i.id
    `;
    
    const params = [];
    
    if (itemId) {
      query += ' WHERE l.item_id = ?';
      params.push(itemId);
    }
    
    query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [logs] = await db.execute(query, params);
    return logs;
  } catch (error) {
    console.error('Error fetching inventory logs:', error);
    throw error;
  }
}

// Get inventory audit trail for an item
async function getInventoryAuditTrail(itemId) {
  try {
    const query = `
      SELECT l.*, 
             u.username as user_name
      FROM inventory_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.item_id = ?
      ORDER BY l.created_at DESC
    `;
    
    const [logs] = await db.execute(query, [itemId]);
    return logs;
  } catch (error) {
    console.error('Error fetching inventory audit trail:', error);
    throw error;
  }
}

// Get user activity logs
async function getUserActivityLogs(userId, limit = 50, offset = 0) {
  try {
    const query = `
      SELECT l.*, 
             i.name as item_name,
             i.category_id,
             c.name as category_name
      FROM inventory_logs l
      LEFT JOIN inventory_items i ON l.item_id = i.id
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `;
    
    const [logs] = await db.execute(query, [userId, parseInt(limit), parseInt(offset)]);
    return logs;
  } catch (error) {
    console.error('Error fetching user activity logs:', error);
    throw error;
  }
}

// Clean up old logs (optional maintenance function)
async function cleanupOldLogs(daysToKeep = 90) {
  try {
    const query = `
      DELETE FROM inventory_logs 
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    
    const [result] = await db.execute(query, [daysToKeep]);
    return result.affectedRows;
  } catch (error) {
    console.error('Error cleaning up old logs:', error);
    throw error;
  }
}

// Get summary of inventory actions
async function getInventoryActionSummary(startDate = null, endDate = null) {
  try {
    let query = `
      SELECT action, 
             COUNT(*) as count,
             DATE(created_at) as date
      FROM inventory_logs
      WHERE 1=1
    `;
    
    const params = [];
    
    if (startDate) {
      query += ' AND created_at >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND created_at <= ?';
      params.push(endDate);
    }
    
    query += ' GROUP BY action, DATE(created_at) ORDER BY date DESC, action';
    
    const [summary] = await db.execute(query, params);
    return summary;
  } catch (error) {
    console.error('Error fetching inventory action summary:', error);
    throw error;
  }
}

module.exports = {
  logInventoryAction,
  getInventoryLogs,
  getInventoryAuditTrail,
  getUserActivityLogs,
  cleanupOldLogs,
  getInventoryActionSummary
};
