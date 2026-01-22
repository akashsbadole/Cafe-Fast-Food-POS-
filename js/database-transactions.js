// Database Transaction Handler for Cafe POS
// Provides transaction management, connection pooling, and data integrity

const { Pool } = require('pg');
const SQL = require('sql.js');

class DatabaseTransactions {
  constructor() {
    this.db = null;
    this.SQL = null;
    this.pool = null;
    this.isPostgres = false;
    this.transactionDepth = 0;
  }

  async initDatabase() {
    try {
      // Try PostgreSQL first
      this.pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'cafe_pos',
        password: process.env.DB_PASSWORD || 'password',
        port: process.env.DB_PORT || 5432,
        max: 20, // Maximum number of clients in the pool
        min: 2,  // Minimum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
      });

      // Test PostgreSQL connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isPostgres = true;
      console.log('PostgreSQL database initialized successfully');
    } catch (pgError) {
      console.log('PostgreSQL not available, using SQLite:', pgError.message);
      this.isPostgres = false;
      
      // Initialize SQLite
      this.SQL = await require('sql.js')();
      const fs = require('fs');
      const path = require('path');
      
      const dbPath = path.join(__dirname, '..', 'data', 'cafe_pos.db');
      const dataDir = path.dirname(dbPath);
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      let data;
      if (fs.existsSync(dbPath)) {
        data = fs.readFileSync(dbPath);
        this.db = new this.SQL.Database(data);
      } else {
        this.db = new this.SQL.Database();
      }
      
      console.log('SQLite database initialized successfully');
    }
  }

  // Execute query with transaction support
  async query(sql, params = [], options = {}) {
    const { transaction = false, readOnly = false } = options;

    if (this.isPostgres) {
      if (transaction) {
        return this.executeInTransaction(sql, params, readOnly);
      } else {
        return this.executePostgresQuery(sql, params, readOnly);
      }
    } else {
      return this.executeSQLiteQuery(sql, params);
    }
  }

  // Execute PostgreSQL query
  async executePostgresQuery(sql, params, readOnly) {
    const client = await this.pool.connect();
    try {
      if (readOnly) {
        await client.query('BEGIN READ ONLY');
      }
      
      const result = await client.query(sql, params);
      
      if (readOnly) {
        await client.query('COMMIT');
      }
      
      return result;
    } finally {
      client.release();
    }
  }

  // Execute SQLite query
  async executeSQLiteQuery(sql, params) {
    try {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        
        stmt.free();
        return { rows: results };
      } else {
        this.db.run(sql, params);
        return { rowCount: this.db.getRowsModified() };
      }
    } catch (error) {
      console.error('SQLite query error:', error);
      throw error;
    }
  }

  // Execute query in PostgreSQL transaction
  async executeInTransaction(sql, params, readOnly) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      if (readOnly) {
        await client.query('SET TRANSACTION READ ONLY');
      }
      
      const result = await client.query(sql, params);
      await client.query('COMMIT');
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Execute transaction with callback
  async executeTransaction(callback) {
    if (this.isPostgres) {
      return this.executePostgresTransaction(callback);
    } else {
      return this.executeSQLiteTransaction(callback);
    }
  }

  // Execute PostgreSQL transaction
  async executePostgresTransaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Execute SQLite transaction
  async executeSQLiteTransaction(callback) {
    try {
      this.db.run('BEGIN');
      
      const result = await callback(this.db);
      
      this.db.run('COMMIT');
      return result;
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  // Safe order creation with transaction
  async createOrderWithItems(orderData, items) {
    return this.executeTransaction(async (client) => {
      let orderId;
      
      if (this.isPostgres) {
        // PostgreSQL version
        const orderResult = await client.query(
          `INSERT INTO orders (order_number, subtotal, discount_amount, discount_type, 
                              tax_amount, tax_rate, total_amount, payment_mode, payment_status, 
                              status, notes, customer_id, location_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            orderData.orderNumber, orderData.subtotal, orderData.discountAmount,
            orderData.discountType, orderData.taxAmount, orderData.taxRate,
            orderData.totalAmount, orderData.paymentMode, orderData.paymentStatus,
            orderData.status, orderData.notes, orderData.customerId, orderData.locationId || 1
          ]
        );
        
        orderId = orderResult.rows[0].id;
        
        // Insert order items
        for (const item of items) {
          await client.query(
            `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [orderId, item.menuItemId, item.quantity, item.unitPrice, item.totalPrice, item.notes || '']
          );
        }
        
        // Update inventory if needed
        if (orderData.updateInventory !== false) {
          for (const item of items) {
            await client.query(
              `UPDATE menu_items SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
              [item.quantity, item.menuItemId]
            );
          }
        }
      } else {
        // SQLite version
        const stmt = this.db.prepare(`
          INSERT INTO orders (order_number, subtotal, discount_amount, discount_type, 
                              tax_amount, tax_rate, total_amount, payment_mode, payment_status, 
                              status, notes, customer_id, location_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run([
          orderData.orderNumber, orderData.subtotal, orderData.discountAmount,
          orderData.discountType, orderData.taxAmount, orderData.taxRate,
          orderData.totalAmount, orderData.paymentMode, orderData.paymentStatus,
          orderData.status, orderData.notes, orderData.customerId, orderData.locationId || 1
        ]);
        
        orderId = this.db.lastInsertRowid();
        stmt.free();
        
        // Insert order items
        const itemStmt = this.db.prepare(`
          INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        for (const item of items) {
          itemStmt.run([orderId, item.menuItemId, item.quantity, item.unitPrice, item.totalPrice, item.notes || '']);
        }
        itemStmt.free();
        
        // Update inventory if needed
        if (orderData.updateInventory !== false) {
          const invStmt = this.db.prepare(`UPDATE menu_items SET stock_quantity = stock_quantity - ? WHERE id = ?`);
          for (const item of items) {
            invStmt.run([item.quantity, item.menuItemId]);
          }
          invStmt.free();
        }
      }
      
      return orderId;
    });
  }

  // Safe inventory update with transaction
  async updateInventory(itemId, quantity, reason, userId) {
    return this.executeTransaction(async (client) => {
      if (this.isPostgres) {
        // Check current stock
        const stockResult = await client.query('SELECT stock_quantity FROM menu_items WHERE id = $1', [itemId]);
        const currentStock = stockResult.rows[0]?.stock_quantity || 0;
        const newStock = currentStock + quantity;
        
        // Update stock
        await client.query('UPDATE menu_items SET stock_quantity = $1 WHERE id = $2', [newStock, itemId]);
        
        // Record transaction
        await client.query(
          `INSERT INTO inventory_transactions (menu_item_id, transaction_type, quantity, reason, created_by, location_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [itemId, quantity > 0 ? 'add' : 'remove', Math.abs(quantity), reason, userId, 1]
        );
        
        return { newStock, transactionId: null }; // PostgreSQL doesn't have lastInsertRowid
      } else {
        // Check current stock
        const stockResult = this.db.exec('SELECT stock_quantity FROM menu_items WHERE id = ?', [itemId]);
        const currentStock = stockResult.length > 0 && stockResult[0].values.length > 0 
          ? stockResult[0].values[0][0] 
          : 0;
        const newStock = currentStock + quantity;
        
        // Update stock
        this.db.run('UPDATE menu_items SET stock_quantity = ? WHERE id = ?', [newStock, itemId]);
        
        // Record transaction
        this.db.run(
          `INSERT INTO inventory_transactions (menu_item_id, transaction_type, quantity, reason, created_by, location_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [itemId, quantity > 0 ? 'add' : 'remove', Math.abs(quantity), reason, userId, 1]
        );
        
        return { newStock, transactionId: this.db.lastInsertRowid() };
      }
    });
  }

  // Safe user creation with transaction
  async createUser(userData) {
    return this.executeTransaction(async (client) => {
      if (this.isPostgres) {
        // Check if username exists
        const existing = await client.query('SELECT id FROM users WHERE username = $1', [userData.username]);
        if (existing.rows.length > 0) {
          throw new Error('Username already exists');
        }
        
        // Check if PIN exists
        const pinExists = await client.query('SELECT id FROM users WHERE pin_hash = $1', [userData.pin_hash]);
        if (pinExists.rows.length > 0) {
          throw new Error('PIN is already in use');
        }
        
        // Create user
        const result = await client.query(
          `INSERT INTO users (username, pin_hash, password_hash, role_id, full_name, permissions, location_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [userData.username, userData.pin_hash, userData.password_hash, userData.role_id, 
           userData.full_name, JSON.stringify(userData.permissions || []), userData.locationId || 1]
        );
        
        return result.rows[0].id;
      } else {
        // Check if username exists
        const existing = this.db.exec('SELECT id FROM users WHERE username = ?', [userData.username]);
        if (existing.length > 0 && existing[0].values.length > 0) {
          throw new Error('Username already exists');
        }
        
        // Check if PIN exists (simplified for SQLite)
        const pinExists = this.db.exec('SELECT id FROM users WHERE pin_hash = ?', [userData.pin_hash]);
        if (pinExists.length > 0 && pinExists[0].values.length > 0) {
          throw new Error('PIN is already in use');
        }
        
        // Create user
        const stmt = this.db.prepare(`
          INSERT INTO users (username, pin_hash, password_hash, role_id, full_name, permissions, location_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run([
          userData.username, userData.pin_hash, userData.password_hash, userData.role_id,
          userData.full_name, JSON.stringify(userData.permissions || []), userData.locationId || 1
        ]);
        
        const userId = this.db.lastInsertRowid();
        stmt.free();
        
        return userId;
      }
    });
  }

  // Get database statistics
  async getStats() {
    if (this.isPostgres) {
      const client = await this.pool.connect();
      try {
        const stats = await client.query(`
          SELECT 
            (SELECT COUNT(*) FROM users) as user_count,
            (SELECT COUNT(*) FROM menu_items) as menu_item_count,
            (SELECT COUNT(*) FROM orders) as order_count,
            (SELECT COUNT(*) FROM customers) as customer_count
        `);
        return stats.rows[0];
      } finally {
        client.release();
      }
    } else {
      const result = this.db.exec(`
        SELECT 
          (SELECT COUNT(*) FROM users) as user_count,
          (SELECT COUNT(*) FROM menu_items) as menu_item_count,
          (SELECT COUNT(*) FROM orders) as order_count,
          (SELECT COUNT(*) FROM customers) as customer_count
      `);
      
      if (result.length > 0) {
        const row = result[0].values[0];
        return {
          user_count: row[0],
          menu_item_count: row[1],
          order_count: row[2],
          customer_count: row[3]
        };
      }
      
      return { user_count: 0, menu_item_count: 0, order_count: 0, customer_count: 0 };
    }
  }

  // Health check
  async healthCheck() {
    try {
      if (this.isPostgres) {
        const client = await this.pool.connect();
        try {
          await client.query('SELECT 1');
          return { status: 'healthy', database: 'PostgreSQL' };
        } finally {
          client.release();
        }
      } else {
        this.db.exec('SELECT 1');
        return { status: 'healthy', database: 'SQLite' };
      }
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  // Close database connections
  async close() {
    if (this.isPostgres && this.pool) {
      await this.pool.end();
    }
  }

  // Export database for backup
  async exportDatabase() {
    const dump = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      database: this.isPostgres ? 'PostgreSQL' : 'SQLite',
      data: {}
    };

    const tables = ['users', 'roles', 'categories', 'menu_items', 'orders', 'order_items', 'customers', 'inventory_transactions'];
    
    for (const table of tables) {
      try {
        if (this.isPostgres) {
          const client = await this.pool.connect();
          try {
            const result = await client.query(`SELECT * FROM ${table}`);
            dump.data[table] = result.rows;
          } finally {
            client.release();
          }
        } else {
          const result = this.db.exec(`SELECT * FROM ${table}`);
          dump.data[table] = this.resultToObjects(result);
        }
      } catch (error) {
        console.warn(`Could not export table ${table}:`, error.message);
        dump.data[table] = [];
      }
    }

    return dump;
  }

  // Import database from backup
  async importDatabase(dumpData) {
    if (!dumpData.data) {
      throw new Error('Invalid backup format');
    }

    return this.executeTransaction(async (client) => {
      const tables = ['inventory_transactions', 'order_items', 'orders', 'customers', 'menu_items', 'categories', 'roles', 'users'];
      
      // Clear existing data (except keep admin user)
      for (const table of tables) {
        try {
          if (this.isPostgres) {
            if (table === 'users') {
              await client.query('DELETE FROM users WHERE id > 1'); // Keep admin user
            } else {
              await client.query(`DELETE FROM ${table}`);
            }
          } else {
            if (table === 'users') {
              this.db.run('DELETE FROM users WHERE id > 1'); // Keep admin user
            } else {
              this.db.run(`DELETE FROM ${table}`);
            }
          }
        } catch (error) {
          console.warn(`Could not clear table ${table}:`, error.message);
        }
      }

      // Restore data
      for (const table of Object.keys(dumpData.data)) {
        const rows = dumpData.data[table];
        if (!rows || rows.length === 0) continue;

        try {
          if (this.isPostgres) {
            const columns = Object.keys(rows[0]);
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
            const stmt = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
            
            for (const row of rows) {
              const values = columns.map(col => row[col]);
              await client.query(stmt, values);
            }
          } else {
            const columns = Object.keys(rows[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const stmt = this.db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
            
            for (const row of rows) {
              const values = columns.map(col => row[col]);
              stmt.run(values);
            }
            stmt.free();
          }
        } catch (error) {
          console.warn(`Could not restore table ${table}:`, error.message);
        }
      }
    });
  }

  // Helper to convert SQLite result to objects
  resultToObjects(result) {
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
}

// Export singleton instance
module.exports = new DatabaseTransactions();
