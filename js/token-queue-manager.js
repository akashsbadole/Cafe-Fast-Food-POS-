// Token/Queue Management System for Cafe POS
// Handles token generation, queue management, and display

const { v4: uuidv4 } = require('uuid');

class TokenQueueManager {
  constructor(db) {
    this.db = db;
    this.activeQueue = [];
    this.tokenCounter = 0;
    this.lastTokenDate = null;
  }

  // Initialize token queue from database
  async init() {
    try {
      // Create token_queues table if not exists
      this.db.run(`
        CREATE TABLE IF NOT EXISTS token_queues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token_number TEXT UNIQUE NOT NULL,
          queue_number INTEGER NOT NULL,
          status TEXT DEFAULT 'waiting',
          customer_name TEXT,
          customer_phone TEXT,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          called_at DATETIME,
          served_at DATETIME,
          cancelled_at DATETIME,
          called_by INTEGER,
          served_by INTEGER,
          FOREIGN KEY (called_by) REFERENCES users(id),
          FOREIGN KEY (served_by) REFERENCES users(id)
        )
      `);

      // Create token_history table for archival
      this.db.run(`
        CREATE TABLE IF NOT EXISTS token_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token_number TEXT UNIQUE NOT NULL,
          queue_number INTEGER NOT NULL,
          status TEXT NOT NULL,
          customer_name TEXT,
          customer_phone TEXT,
          notes TEXT,
          created_at DATETIME NOT NULL,
          called_at DATETIME,
          served_at DATETIME,
          cancelled_at DATETIME,
          called_by INTEGER,
          served_by INTEGER,
          FOREIGN KEY (called_by) REFERENCES users(id),
          FOREIGN KEY (served_by) REFERENCES users(id)
        )
      `);

      // Create token_settings table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS token_settings (
          id INTEGER PRIMARY KEY,
          prefix TEXT DEFAULT 'TOK',
          reset_daily INTEGER DEFAULT 1,
          current_queue_number INTEGER DEFAULT 0,
          last_reset_date TEXT,
          auto_announce INTEGER DEFAULT 1,
          sound_volume INTEGER DEFAULT 80,
          display_duration INTEGER DEFAULT 10
        )
      `);

      // Initialize settings
      await this._initSettings();

      // Load active queue
      await this._loadActiveQueue();

      console.log('Token/Queue Management System initialized');
    } catch (error) {
      console.error('Error initializing token queue manager:', error);
      throw error;
    }
  }

  // Initialize settings
  async _initSettings() {
    const result = this.db.exec('SELECT COUNT(*) as count FROM token_settings');
    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;

    if (count === 0) {
      this.db.run(`
        INSERT INTO token_settings (prefix, reset_daily, current_queue_number, last_reset_date)
        VALUES (?, ?, ?, ?)
      `, ['TOK', 1, 0, new Date().toISOString().split('T')[0]]);
    }
  }

  // Load active queue from database
  async _loadActiveQueue() {
    const result = this.db.exec(`
      SELECT * FROM token_queues 
      WHERE status IN ('waiting', 'called')
      ORDER BY queue_number ASC
    `);

    const rows = this._resultToObjects(result);
    this.activeQueue = rows;
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

  // Get settings
  async getSettings() {
    const result = this.db.exec('SELECT * FROM token_settings LIMIT 1');
    const rows = this._resultToObjects(result);
    return rows[0] || null;
  }

  // Update settings
  async updateSettings(settings) {
    this.db.run(`
      INSERT OR REPLACE INTO token_settings 
      (id, prefix, reset_daily, current_queue_number, last_reset_date, auto_announce, sound_volume, display_duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      settings.id || 1,
      settings.prefix || 'TOK',
      settings.reset_daily || 1,
      settings.current_queue_number || 0,
      settings.last_reset_date || new Date().toISOString().split('T')[0],
      settings.auto_announce || 1,
      settings.sound_volume || 80,
      settings.display_duration || 10
    ]);
  }

  // Generate next token number
  async generateTokenNumber() {
    const settings = await this.getSettings();
    const today = new Date().toISOString().split('T')[0];

    // Reset counter if daily reset is enabled and date changed
    if (settings.reset_daily && settings.last_reset_date !== today) {
      settings.current_queue_number = 0;
      settings.last_reset_date = today;
      await this.updateSettings(settings);
    }

    settings.current_queue_number++;
    await this.updateSettings(settings);

    return `${settings.prefix}-${today}-${String(settings.current_queue_number).padStart(4, '0')}`;
  }

  // Create new token
  async createToken(customerName, customerPhone, notes, userId) {
    const tokenNumber = await this.generateTokenNumber();
    const settings = await this.getSettings();

    const result = this.db.prepare(`
      INSERT INTO token_queues 
      (token_number, queue_number, status, customer_name, customer_phone, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      tokenNumber,
      settings.current_queue_number,
      'waiting',
      customerName || null,
      customerPhone || null,
      notes || null,
      userId || null
    );

    const tokenId = result.lastInsertRowid;
    
    // Reload active queue
    await this._loadActiveQueue();

    return {
      id: tokenId,
      token_number: tokenNumber,
      queue_number: settings.current_queue_number,
      status: 'waiting',
      customer_name: customerName,
      customer_phone: customerPhone,
      notes: notes,
      created_at: new Date().toISOString()
    };
  }

  // Get token by ID
  async getToken(tokenId) {
    const result = this.db.exec('SELECT * FROM token_queues WHERE id = ?', [tokenId]);
    const tokens = this._resultToObjects(result);
    return tokens[0] || null;
  }

  // Get token by token number
  async getTokenByNumber(tokenNumber) {
    const result = this.db.exec('SELECT * FROM token_queues WHERE token_number = ?', [tokenNumber]);
    const tokens = this._resultToObjects(result);
    return tokens[0] || null;
  }

  // Get all tokens (with optional filtering)
  async getAllTokens(statusFilter = null) {
    let query = 'SELECT * FROM token_queues';
    const params = [];

    if (statusFilter) {
      query += ' WHERE status = ?';
      params.push(statusFilter);
    }

    query += ' ORDER BY queue_number DESC';

    const result = this.db.exec(query, params);
    return this._resultToObjects(result);
  }

  // Get active queue
  getActiveQueue() {
    return this.activeQueue.filter(t => t.status === 'waiting' || t.status === 'called');
  }

  // Get waiting queue count
  getWaitingCount() {
    return this.activeQueue.filter(t => t.status === 'waiting').length;
  }

  // Call next token
  async callNextToken(userId) {
    // Find the next waiting token
    const nextToken = this.activeQueue.find(t => t.status === 'waiting');

    if (!nextToken) {
      return null; // No tokens to call
    }

    // Update status to 'called'
    this.db.run(`
      UPDATE token_queues 
      SET status = 'called', called_at = CURRENT_TIMESTAMP, called_by = ?
      WHERE id = ?
    `, [userId, nextToken.id]);

    // Reload active queue
    await this._loadActiveQueue();

    return this.getToken(nextToken.id);
  }

  // Call specific token
  async callToken(tokenId, userId) {
    const token = await this.getToken(tokenId);
    if (!token) {
      throw new Error('Token not found');
    }

    if (token.status !== 'waiting') {
      throw new Error('Token is not in waiting status');
    }

    this.db.run(`
      UPDATE token_queues 
      SET status = 'called', called_at = CURRENT_TIMESTAMP, called_by = ?
      WHERE id = ?
    `, [userId, tokenId]);

    // Reload active queue
    await this._loadActiveQueue();

    return this.getToken(tokenId);
  }

  // Mark token as served
  async serveToken(tokenId, userId) {
    const token = await this.getToken(tokenId);
    if (!token) {
      throw new Error('Token not found');
    }

    if (token.status !== 'called') {
      throw new Error('Token must be called before serving');
    }

    // Update status to 'served'
    this.db.run(`
      UPDATE token_queues 
      SET status = 'served', served_at = CURRENT_TIMESTAMP, served_by = ?
      WHERE id = ?
    `, [userId, tokenId]);

    // Move to history
    const historyResult = this.db.exec('SELECT * FROM token_queues WHERE id = ?', [tokenId]);
    const tokenData = this._resultToObjects(historyResult)[0];

    this.db.run(`
      INSERT INTO token_history 
      (token_number, queue_number, status, customer_name, customer_phone, notes, 
       created_at, called_at, served_at, called_by, served_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tokenData.token_number,
      tokenData.queue_number,
      'served',
      tokenData.customer_name,
      tokenData.customer_phone,
      tokenData.notes,
      tokenData.created_at,
      tokenData.called_at,
      tokenData.served_at,
      tokenData.called_by,
      tokenData.served_by
    ]);

    // Delete from active queue
    this.db.run('DELETE FROM token_queues WHERE id = ?', [tokenId]);

    // Reload active queue
    await this._loadActiveQueue();

    return { success: true, message: 'Token served successfully' };
  }

  // Cancel token
  async cancelToken(tokenId, userId, reason) {
    const token = await this.getToken(tokenId);
    if (!token) {
      throw new Error('Token not found');
    }

    // Update status to 'cancelled'
    this.db.run(`
      UPDATE token_queues 
      SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, notes = ?
      WHERE id = ?
    `, [reason || 'Cancelled by user', tokenId]);

    // Move to history
    const historyResult = this.db.exec('SELECT * FROM token_queues WHERE id = ?', [tokenId]);
    const tokenData = this._resultToObjects(historyResult)[0];

    this.db.run(`
      INSERT INTO token_history 
      (token_number, queue_number, status, customer_name, customer_phone, notes, 
       created_at, called_at, served_at, cancelled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tokenData.token_number,
      tokenData.queue_number,
      'cancelled',
      tokenData.customer_name,
      tokenData.customer_phone,
      tokenData.notes,
      tokenData.created_at,
      tokenData.called_at,
      tokenData.served_at,
      tokenData.cancelled_at
    ]);

    // Delete from active queue
    this.db.run('DELETE FROM token_queues WHERE id = ?', [tokenId]);

    // Reload active queue
    await this._loadActiveQueue();

    return { success: true, message: 'Token cancelled successfully' };
  }

  // Get token history
  async getTokenHistory(limit = 50, statusFilter = null) {
    let query = 'SELECT * FROM token_history';
    const params = [];

    if (statusFilter) {
      query += ' WHERE status = ?';
      params.push(statusFilter);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const result = this.db.exec(query, params);
    return this._resultToObjects(result);
  }

  // Get statistics
  async getStatistics() {
    const today = new Date().toISOString().split('T')[0];

    const waitingCount = this.getWaitingCount();
    const calledCount = this.activeQueue.filter(t => t.status === 'called').length;

    const servedTodayResult = this.db.exec(`
      SELECT COUNT(*) as count FROM token_history 
      WHERE DATE(created_at) = ? AND status = 'served'
    `, [today]);

    const cancelledTodayResult = this.db.exec(`
      SELECT COUNT(*) as count FROM token_history 
      WHERE DATE(created_at) = ? AND status = 'cancelled'
    `, [today]);

    const servedToday = servedTodayResult.length > 0 && servedTodayResult[0].values.length > 0 
      ? servedTodayResult[0].values[0][0] 
      : 0;

    const cancelledToday = cancelledTodayResult.length > 0 && cancelledTodayResult[0].values.length > 0 
      ? cancelledTodayResult[0].values[0][0] 
      : 0;

    return {
      waiting: waitingCount,
      called: calledCount,
      served_today: servedToday,
      cancelled_today: cancelledToday,
      total_active: this.activeQueue.length
    };
  }

  // Reset queue (for admin use)
  async resetQueue(userId) {
    // Move all active tokens to history with 'reset' status
    const activeTokens = await this.getAllTokens();

    for (const token of activeTokens) {
      this.db.run(`
        INSERT INTO token_history 
        (token_number, queue_number, status, customer_name, customer_phone, notes, 
         created_at, called_at, served_at, cancelled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        token.token_number,
        token.queue_number,
        'reset',
        token.customer_name,
        token.customer_phone,
        token.notes,
        token.created_at,
        token.called_at,
        token.served_at,
        null
      ]);
    }

    // Clear active queue
    this.db.run('DELETE FROM token_queues');

    // Reset counter
    const settings = await this.getSettings();
    settings.current_queue_number = 0;
    await this.updateSettings(settings);

    // Reload active queue
    await this._loadActiveQueue();

    return { success: true, message: 'Queue reset successfully' };
  }
}

module.exports = TokenQueueManager;
