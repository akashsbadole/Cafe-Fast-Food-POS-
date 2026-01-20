// Database module for Cafe POS using sql.js (pure JavaScript SQLite)
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'cafe_pos.db');
const dataDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;
let SQL = null;

// Initialize enhanced modules
let tokenQueueManager = null;
let inventoryManager = null;
let orderHoldManager = null;

// Initialize database
async function initDatabase() {
  SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      role_id INTEGER DEFAULT 1,
      full_name TEXT,
      is_active INTEGER DEFAULT 1,
      permissions TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      permissions TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      logout_time DATETIME,
      ip_address TEXT,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_order INTEGER DEFAULT 0,
      icon TEXT DEFAULT '☕',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image TEXT,
      stock_quantity INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 5,
      is_available INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reason TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      notes TEXT,
      total_orders INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      subtotal REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'fixed',
      tax_amount REAL NOT NULL,
      tax_rate REAL DEFAULT 9,
      total_amount REAL NOT NULL,
      payment_mode TEXT DEFAULT 'cash',
      payment_status TEXT DEFAULT 'unpaid',
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      notes TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kot_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      ticket_number TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tax_settings (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      rate REAL NOT NULL,
      is_active INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create default admin user if not exists
  const bcrypt = require('bcryptjs');
  const defaultPin = '1234';
  const defaultPassword = 'admin123';

  const existingUser = db.exec('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!existingUser.length || !existingUser[0].values.length) {
    const pinHash = bcrypt.hashSync(defaultPin, 10);
    const passwordHash = bcrypt.hashSync(defaultPassword, 10);

    db.run(`INSERT OR IGNORE INTO users (username, password_hash, pin_hash, role) VALUES (?, ?, ?, 'admin')`,
      ['admin', passwordHash, pinHash]);

    console.log('Default admin user created (PIN: 1234)');
  }

  // Create default categories if not exists
  const existingCategories = db.exec('SELECT COUNT(*) as count FROM categories');
  let categoryCount = 0;
  if (existingCategories.length > 0) {
    categoryCount = existingCategories[0].values[0][0];
  }

  if (categoryCount === 0) {
    const categories = [
      { name: 'Coffee', icon: '☕', order: 1 },
      { name: 'Tea', icon: '🍵', order: 2 },
      { name: 'Snacks', icon: '🥐', order: 3 },
      { name: 'Fast-Food', icon: '🍔', order: 4 },
      { name: 'Cold Beverages', icon: '🧊', order: 5 },
      { name: 'Meals/Combos', icon: '🍽️', order: 6 }
    ];

    categories.forEach(cat => {
      db.run(`INSERT INTO categories (name, icon, display_order) VALUES (?, ?, ?)`,
        [cat.name, cat.icon, cat.order]);
    });

    console.log('Default categories created');
  }

  // Create default tax settings if not exists
  const existingTax = db.exec('SELECT COUNT(*) as count FROM tax_settings');
  let taxCount = 0;
  if (existingTax.length > 0) {
    taxCount = existingTax[0].values[0][0];
  }

  if (taxCount === 0) {
    db.run(`INSERT INTO tax_settings (name, rate, is_active) VALUES (?, ?, ?)`,
      ['GST', 9, 1]);

    console.log('Default tax settings created');
  }

  // Create enterprise tables if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      schedule_cron TEXT NOT NULL,
      time_zone TEXT DEFAULT 'UTC',
      email_to TEXT,
      email_cc TEXT,
      email_bcc TEXT,
      format TEXT DEFAULT 'pdf',
      is_active INTEGER DEFAULT 1,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS report_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      query_sql TEXT NOT NULL,
      columns TEXT NOT NULL,
      filters TEXT DEFAULT '{}',
      is_public INTEGER DEFAULT 0,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS backup_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      schedule_cron TEXT NOT NULL,
      time_zone TEXT DEFAULT 'UTC',
      retention_days INTEGER DEFAULT 30,
      backup_location TEXT DEFAULT 'local',
      is_active INTEGER DEFAULT 1,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS backup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      backup_path TEXT NOT NULL,
      file_size INTEGER,
      status TEXT DEFAULT 'pending',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      error_message TEXT,
      FOREIGN KEY (schedule_id) REFERENCES backup_schedules(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS system_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_type TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add location_id to existing tables
  db.run('PRAGMA table_info(orders)');
  const ordersInfo = db.exec('PRAGMA table_info(orders)');
  if (!ordersInfo.some(row => row.values.some(v => v === 'location_id'))) {
    db.run('ALTER TABLE orders ADD COLUMN location_id INTEGER DEFAULT 1');
  }

  db.run('PRAGMA table_info(menu_items)');
  const menuInfo = db.exec('PRAGMA table_info(menu_items)');
  if (!menuInfo.some(row => row.values.some(v => v === 'location_id'))) {
    db.run('ALTER TABLE menu_items ADD COLUMN location_id INTEGER DEFAULT 1');
  }

  db.run('PRAGMA table_info(inventory_transactions)');
  const invInfo = db.exec('PRAGMA table_info(inventory_transactions)');
  if (!invInfo.some(row => row.values.some(v => v === 'location_id'))) {
    db.run('ALTER TABLE inventory_transactions ADD COLUMN location_id INTEGER DEFAULT 1');
  }

  db.run('PRAGMA table_info(customers)');
  const custInfo = db.exec('PRAGMA table_info(customers)');
  if (!custInfo.some(row => row.values.some(v => v === 'location_id'))) {
    db.run('ALTER TABLE customers ADD COLUMN location_id INTEGER DEFAULT 1');
  }

  db.run('PRAGMA table_info(users)');
  const userInfo = db.exec('PRAGMA table_info(users)');
  if (!userInfo.some(row => row.values.some(v => v === 'location_id'))) {
    db.run('ALTER TABLE users ADD COLUMN location_id INTEGER DEFAULT 1');
  }

  // Create default location
  const locationResult = db.exec('SELECT COUNT(*) as count FROM locations');
  let locationCount = 0;
  if (locationResult.length > 0) {
    locationCount = locationResult[0].values[0][0];
  }

  if (locationCount === 0) {
    db.run(`INSERT INTO locations (name, address, city, state, postal_code, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['Main Location', '123 Main Street', 'City', 'State', '12345', '555-1234', 1]);

    console.log('Default location created');
  }

  // Initialize enhanced modules
  const TokenQueueManager = require('./token-queue-manager');
  const InventoryManager = require('./inventory-manager');
  const OrderHoldManager = require('./order-hold-manager');

  tokenQueueManager = new TokenQueueManager(db);
  await tokenQueueManager.init();

  inventoryManager = new InventoryManager(db);
  await inventoryManager.init();

  orderHoldManager = new OrderHoldManager(db);
  await orderHoldManager.init();

  // Create sample menu items if not exists
  const existingItems = db.exec('SELECT COUNT(*) as count FROM menu_items');
  let itemCount = 0;
  if (existingItems.length > 0) {
    itemCount = existingItems[0].values[0][0];
  }

  if (itemCount === 0) {
    const menuItems = [
      { category: 'Coffee', name: 'Espresso', price: 80, description: 'Strong black coffee' },
      { category: 'Coffee', name: 'Cappuccino', price: 120, description: 'Coffee with milk foam' },
      { category: 'Coffee', name: 'Latte', price: 130, description: 'Coffee with steamed milk' },
      { category: 'Coffee', name: 'Americano', price: 100, description: 'Diluted espresso' },
      { category: 'Coffee', name: 'Mocha', price: 150, description: 'Coffee with chocolate' },
      { category: 'Tea', name: 'Masala Chai', price: 40, description: 'Spiced Indian tea' },
      { category: 'Tea', name: 'Green Tea', price: 60, description: 'Healthy green tea' },
      { category: 'Tea', name: 'Lemon Tea', price: 50, description: 'Tea with lemon' },
      { category: 'Tea', name: 'Ice Tea', price: 70, description: 'Chilled tea' },
      { category: 'Snacks', name: 'Croissant', price: 85, description: 'Butter croissant' },
      { category: 'Snacks', name: 'Muffin', price: 90, description: 'Chocolate muffin' },
      { category: 'Snacks', name: 'Sandwich', price: 110, description: 'Vegetable sandwich' },
      { category: 'Snacks', name: 'Cookie', price: 40, description: 'Choco chip cookie' },
      { category: 'Fast-Food', name: 'Burger', price: 150, description: 'Vegetable burger' },
      { category: 'Fast-Food', name: 'Fries', price: 80, description: 'Crispy fries' },
      { category: 'Fast-Food', name: 'Pizza Slice', price: 100, description: 'Cheese pizza slice' },
      { category: 'Fast-Food', name: 'Hot Dog', price: 120, description: 'Classic hot dog' },
      { category: 'Cold Beverages', name: 'Cold Coffee', price: 140, description: 'Iced coffee' },
      { category: 'Cold Beverages', name: 'Milkshake', price: 160, description: 'Chocolate milkshake' },
      { category: 'Cold Beverages', name: 'Fresh Lime', price: 50, description: 'Lime soda' },
      { category: 'Cold Beverages', name: 'Smoothie', price: 180, description: 'Fruit smoothie' },
      { category: 'Meals/Combos', name: 'Coffee + Sandwich', price: 180, description: 'Combo deal' },
      { category: 'Meals/Combos', name: 'Tea + Cookie', price: 80, description: 'Light combo' },
      { category: 'Meals/Combos', name: 'Full Meal', price: 250, description: 'Complete meal' }
    ];

    menuItems.forEach(item => {
      const catResult = db.exec(`SELECT id FROM categories WHERE name = ?`, [item.category]);
      if (catResult.length > 0 && catResult[0].values.length > 0) {
        const categoryId = catResult[0].values[0][0];
        db.run(`INSERT INTO menu_items (category_id, name, price, description) VALUES (?, ?, ?, ?)`,
          [categoryId, item.name, item.price, item.description]);
      }
    });

    console.log('Sample menu items created');
  }

  // Seed default data (roles, users, etc.)
  seedDefaultData();

  saveDatabase();
}

// Save database to file
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Helper to convert result to array of objects
function resultToObjects(result) {
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

// User operations
const userOps = {
  getAll: () => {
    const result = db.exec('SELECT * FROM users WHERE is_active = 1 ORDER BY created_at DESC');
    return resultToObjects(result);
  },

  getByUsername: (username) => {
    const result = db.exec('SELECT * FROM users WHERE username = ?', [username]);
    const users = resultToObjects(result);
    return users[0] || null;
  },

  updateLastLogin: (id) => {
    db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    saveDatabase();
  }
};

// Category operations
const categoryOps = {
  getAll: () => {
    const result = db.exec(`SELECT * FROM categories WHERE is_active = 1 ORDER BY display_order`);
    return resultToObjects(result);
  },

  getById: (id) => {
    const result = db.exec('SELECT * FROM categories WHERE id = ?', [id]);
    const categories = resultToObjects(result);
    return categories[0] || null;
  },

  create: (name, icon, displayOrder) => {
    db.run(`INSERT INTO categories (name, icon, display_order) VALUES (?, ?, ?)`,
      [name, icon || '☕', displayOrder || 0]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDatabase();
    return result[0].values[0][0];
  },

  update: (id, name, icon, displayOrder) => {
    db.run(`UPDATE categories SET name = ?, icon = ?, display_order = ? WHERE id = ?`,
      [name, icon, displayOrder, id]);
    saveDatabase();
  },

  delete: (id) => {
    db.run('DELETE FROM categories WHERE id = ?', [id]);
    saveDatabase();
  }
};

// Menu item operations
const menuOps = {
  getAll: () => {
    const result = db.exec(`
      SELECT mi.*, c.name as category_name, c.icon as category_icon
      FROM menu_items mi
      JOIN categories c ON mi.category_id = c.id
      ORDER BY c.display_order, mi.id
    `);
    return resultToObjects(result);
  },

  getByCategory: (categoryId) => {
    const result = db.exec(`
      SELECT mi.*, c.name as category_name, c.icon as category_icon
      FROM menu_items mi
      JOIN categories c ON mi.category_id = c.id
      WHERE mi.category_id = ?
      ORDER BY mi.id
    `, [categoryId]);
    return resultToObjects(result);
  },

  getById: (id) => {
    const result = db.exec(`
      SELECT mi.*, c.name as category_name
      FROM menu_items mi
      JOIN categories c ON mi.category_id = c.id
      WHERE mi.id = ?
    `, [id]);
    const items = resultToObjects(result);
    return items[0] || null;
  },

  search: (query) => {
    const result = db.exec(`
      SELECT mi.*, c.name as category_name, c.icon as category_icon
      FROM menu_items mi
      JOIN categories c ON mi.category_id = c.id
      WHERE mi.name LIKE ? AND mi.is_available = 1
      ORDER BY mi.name
    `, [`%${query}%`]);
    return resultToObjects(result);
  },

  create: (categoryId, name, price, description) => {
    db.run(`INSERT INTO menu_items (category_id, name, price, description) VALUES (?, ?, ?, ?)`,
      [categoryId, name, price, description || '']);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDatabase();
    return result[0].values[0][0];
  },

  update: (id, categoryId, name, price, description, isAvailable) => {
    db.run(`
      UPDATE menu_items 
      SET category_id = ?, name = ?, price = ?, description = ?, is_available = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [categoryId, name, price, description, isAvailable ? 1 : 0, id]);
    saveDatabase();
  },

  toggleAvailability: (id) => {
    const item = menuOps.getById(id);
    if (item) {
      db.run(`
        UPDATE menu_items 
        SET is_available = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [item.is_available ? 0 : 1, id]);
      saveDatabase();
    }
  },

  delete: (id) => {
    db.run('DELETE FROM menu_items WHERE id = ?', [id]);
    saveDatabase();
  }
};

// Order operations
const orderOps = {
  generateOrderNumber: () => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const result = db.exec(`
      SELECT order_number FROM orders 
      WHERE order_number LIKE ?
      ORDER BY id DESC LIMIT 1
    `, [`ORD-${today}-%`]);

    let counter = 1;
    if (result.length > 0 && result[0].values.length > 0) {
      const lastOrder = result[0].values[0][0];
      const parts = lastOrder.split('-');
      counter = parseInt(parts[2]) + 1;
    }

    return `ORD-${today}-${String(counter).padStart(4, '0')}`;
  },

  create: (orderData) => {
    db.run(`
      INSERT INTO orders (
        order_number, subtotal, discount_amount, discount_type,
        tax_amount, tax_rate, total_amount, payment_mode,
        payment_status, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      orderData.orderNumber,
      orderData.subtotal,
      orderData.discountAmount || 0,
      orderData.discountType || 'fixed',
      orderData.taxAmount,
      orderData.taxRate || 9,
      orderData.totalAmount,
      orderData.paymentMode || 'cash',
      orderData.paymentStatus || 'unpaid',
      orderData.status || 'pending',
      orderData.notes || ''
    ]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDatabase();
    return result[0].values[0][0];
  },

  addItem: (orderId, itemData) => {
    db.run(`
      INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      orderId,
      itemData.menuItemId,
      itemData.quantity,
      itemData.unitPrice,
      itemData.totalPrice,
      itemData.notes || ''
    ]);
    saveDatabase();
  },

  getById: (id) => {
    const result = db.exec('SELECT * FROM orders WHERE id = ?', [id]);
    const orders = resultToObjects(result);
    return orders[0] || null;
  },

  getWithItems: (id) => {
    const order = orderOps.getById(id);
    if (!order) return null;

    const itemsResult = db.exec(`
      SELECT oi.*, mi.name, mi.description
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE oi.order_id = ?
    `, [id]);

    const items = resultToObjects(itemsResult);
    return { ...order, items };
  },

  getTodayOrders: () => {
    const today = new Date().toISOString().split('T')[0];
    const result = db.exec(`
      SELECT * FROM orders 
      WHERE DATE(created_at) = ?
      ORDER BY id DESC
    `, [today]);
    return resultToObjects(result);
  },

  getAllOrders: () => {
    const result = db.exec(`SELECT * FROM orders ORDER BY id DESC`);
    return resultToObjects(result);
  },

  searchByNumber: (query) => {
    const result = db.exec(`
      SELECT * FROM orders 
      WHERE order_number LIKE ?
      ORDER BY id DESC
    `, [`%${query}%`]);
    return resultToObjects(result);
  },

  updateStatus: (id, status) => {
    db.run(`
      UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [status, id]);
    saveDatabase();
  },

  updatePayment: (id, paymentMode, paymentStatus) => {
    db.run(`
      UPDATE orders 
      SET payment_mode = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [paymentMode, paymentStatus, id]);
    saveDatabase();
  }
};

// KOT operations
const kotOps = {
  generateTicketNumber: () => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const result = db.exec(`
      SELECT ticket_number FROM kot_tickets 
      WHERE ticket_number LIKE ?
      ORDER BY id DESC LIMIT 1
    `, [`KOT-${today}-%`]);

    let counter = 1;
    if (result.length > 0 && result[0].values.length > 0) {
      const lastTicket = result[0].values[0][0];
      const parts = lastTicket.split('-');
      counter = parseInt(parts[2]) + 1;
    }

    return `KOT-${today}-${String(counter).padStart(4, '0')}`;
  },

  create: (orderId, notes) => {
    const ticketNumber = kotOps.generateTicketNumber();
    db.run(`
      INSERT INTO kot_tickets (order_id, ticket_number, notes)
      VALUES (?, ?, ?)
    `, [orderId, ticketNumber, notes || '']);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDatabase();
    return { id: result[0].values[0][0], ticketNumber };
  },

  getAll: () => {
    const result = db.exec(`
      SELECT kt.*, o.order_number, o.status as order_status
      FROM kot_tickets kt
      JOIN orders o ON kt.order_id = o.id
      WHERE kt.status != 'served'
      ORDER BY kt.created_at DESC
    `);
    return resultToObjects(result);
  },

  getByOrderId: (orderId) => {
    const result = db.exec(`
      SELECT * FROM kot_tickets WHERE order_id = ? ORDER BY id DESC
    `, [orderId]);
    return resultToObjects(result);
  },

  updateStatus: (id, status) => {
    db.run(`
      UPDATE kot_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [status, id]);

    const ticketResult = db.exec('SELECT order_id FROM kot_tickets WHERE id = ?', [id]);
    if (ticketResult.length > 0 && ticketResult[0].values.length > 0) {
      const ticket = resultToObjects(ticketResult)[0];
      orderOps.updateStatus(ticket.order_id, status);
    }
    saveDatabase();
  }
};

// Tax operations
const taxOps = {
  getActive: () => {
    const result = db.exec('SELECT * FROM tax_settings WHERE is_active = 1');
    return resultToObjects(result);
  },

  getById: (id) => {
    const result = db.exec('SELECT * FROM tax_settings WHERE id = ?', [id]);
    const taxes = resultToObjects(result);
    return taxes[0] || null;
  }
};

// Settings operations
const settingOps = {
  get: (key) => {
    const result = db.exec('SELECT value FROM settings WHERE key = ?', [key]);
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0];
    }
    return null;
  },

  set: (key, value) => {
    db.run(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [key, value]);
    saveDatabase();
  },
  
  getAll: () => {
    const result = db.exec('SELECT key, value FROM settings');
    // Convert to object for easier use: { key: value }
    const rows = resultToObjects(result);
    return rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  },
  
  updateMultiple: (settingsObj) => {
    for (const [key, value] of Object.entries(settingsObj)) {
      db.run(`
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `, [key, value]);
    }
    saveDatabase();
  }
};

// Export all operations
module.exports = {
  initDatabase,
  saveDatabase,
  user: userOps,
  category: categoryOps,
  menu: menuOps,
  order: orderOps,
  kot: kotOps,
  tax: taxOps,
  settings: settingOps,
  settingOps: settingOps,
  // Aliases for consistency with server.js expectations
  categoryOps,
  menuOps,
  orderOps,
  kotOps,
  taxOps,
  settingsOps: settingOps,
  settingOps
};

// Note: seedDefaultData() is now called inside initDatabase() after db is created

// return db;
// }

// Seed default data
function seedDefaultData() {
  // Check if database is initialized
  if (!db) {
    console.error('Database not initialized, cannot seed default data');
    return;
  }

  try {
    // Create default roles
    const adminRoleResult = db.exec('SELECT id FROM roles WHERE name = ?', ['admin']);
    const adminRole = adminRoleResult.length > 0 && adminRoleResult[0].values.length > 0 ? resultToObjects(adminRoleResult)[0] : null;
    if (!adminRole) {
      db.run('INSERT INTO roles (name, description, permissions) VALUES (?, ?, ?)',
        ['admin', 'Administrator with full access', JSON.stringify(['manage_all', 'manage_settings', 'manage_users', 'manage_menu', 'manage_orders', 'view_reports'])]);
    }
  
    const cashierRoleResult = db.exec('SELECT id FROM roles WHERE name = ?', ['cashier']);
    const cashierRole = cashierRoleResult.length > 0 && cashierRoleResult[0].values.length > 0 ? resultToObjects(cashierRoleResult)[0] : null;
    if (!cashierRole) {
      db.run('INSERT INTO roles (name, description, permissions) VALUES (?, ?, ?)',
        ['cashier', 'Cashier with limited access', JSON.stringify(['manage_orders', 'view_menu'])]);
    }
  
    // Create default admin user if not exists
    const adminUserResult = db.exec('SELECT id FROM users WHERE username = ?', ['admin']);
    const adminUser = adminUserResult.length > 0 && adminUserResult[0].values.length > 0 ? resultToObjects(adminUserResult)[0] : null;
    if (!adminUser) {
      const bcrypt = require('bcryptjs');
      const adminRoleIdResult = db.exec('SELECT id FROM roles WHERE name = ?', ['admin']);
      const adminRoleId = adminRoleIdResult.length > 0 && adminRoleIdResult[0].values.length > 0 ? resultToObjects(adminRoleIdResult)[0].id : null;

      db.prepare(`INSERT INTO users (username, password_hash, pin_hash, role, role_id, full_name, permissions) 
                  VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        'admin',
        bcrypt.hashSync('admin123', 10),
        bcrypt.hashSync('1234', 10),
        'admin',
        adminRoleId,
        'System Administrator',
        JSON.stringify(['manage_all'])
      );
    }

    console.log('Default data seeded successfully');
  } catch (error) {
    console.error('Error seeding default data:', error);
  }
}

// Database operations object
const dbOps = {
  // User operations
  user: {
    getAll: () => {
      const result = db.exec(`
        SELECT u.id, u.username, u.full_name, u.role, r.name as role_name,
               u.is_active, u.last_login, u.created_at
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.is_active = 1
        ORDER BY u.created_at DESC
      `);
      return resultToObjects(result);
    },

    getById: (id) => {
      return db.prepare(`
        SELECT u.*, r.name as role_name, r.permissions as role_permissions
        FROM users u 
        LEFT JOIN roles r ON u.role_id = r.id 
        WHERE u.id = ? AND u.is_active = 1
      `).get(id);
    },

    getByUsername: (username) => {
      return db.prepare(`
        SELECT u.*, r.name as role_name, r.permissions as role_permissions
        FROM users u 
        LEFT JOIN roles r ON u.role_id = r.id 
        WHERE u.username = ? AND u.is_active = 1
      `).get(username);
    },

    getByPin: (pin) => {
      const bcrypt = require('bcryptjs');
      const result = db.exec('SELECT * FROM users WHERE is_active = 1');
      const users = resultToObjects(result);
      return users.find(user => bcrypt.compareSync(pin, user.pin_hash));
    },

    create: (userData) => {
      const { username, pin_hash, password_hash, role_id, full_name, permissions } = userData;
      const result = db.prepare(`
        INSERT INTO users (username, pin_hash, password_hash, role_id, full_name, permissions)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(username, pin_hash, password_hash, role_id, full_name, JSON.stringify(permissions || []));
      return result.lastInsertRowid;
    },

    update: (id, updates) => {
      const fields = [];
      const values = [];

      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(key === 'permissions' ? JSON.stringify(updates[key]) : updates[key]);
        }
      });

      if (fields.length === 0) return;

      values.push(id);
      return db.run(`UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...values);
    },

    updateLastLogin: (id) => {
      return db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    },

    delete: (id) => {
      return db.run('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    },

    getPermissions: (userId) => {
      const user = db.prepare(`
        SELECT u.permissions, r.permissions as role_permissions
        FROM users u 
        LEFT JOIN roles r ON u.role_id = r.id 
        WHERE u.id = ?
      `).get(userId);

      if (!user) return [];

      const userPerms = JSON.parse(user.permissions || '[]');
      const rolePerms = JSON.parse(user.role_permissions || '[]');

      return [...new Set([...userPerms, ...rolePerms])];
    }
  },

  // Role operations
  role: {
    getAll: () => {
      const result = db.exec('SELECT * FROM roles WHERE is_active = 1 ORDER BY name');
      return resultToObjects(result);
    },

    getById: (id) => {
      const result = db.exec('SELECT * FROM roles WHERE id = ? AND is_active = 1', [id]);
      const roles = resultToObjects(result);
      return roles[0] || null;
    },

    create: (name, description, permissions) => {
      const result = db.prepare(`
        INSERT INTO roles (name, description, permissions)
        VALUES (?, ?, ?)
      `).run(name, description, JSON.stringify(permissions || []));
      return result.lastInsertRowid;
    },

    update: (id, name, description, permissions) => {
      return db.prepare(`
        UPDATE roles SET name = ?, description = ?, permissions = ?
        WHERE id = ?
      `).run(name, description, JSON.stringify(permissions), id);
    },

    delete: (id) => {
      return db.run('UPDATE roles SET is_active = 0 WHERE id = ?', [id]);
    }
  },

  // Customer operations
  customer: {
    getAll: () => {
      const result = db.exec('SELECT * FROM customers ORDER BY created_at DESC');
      return resultToObjects(result);
    },

    getById: (id) => {
      const result = db.exec('SELECT * FROM customers WHERE id = ?', [id]);
      const customers = resultToObjects(result);
      return customers[0] || null;
    },
    
    getByPhone: (phone) => {
      const result = db.exec('SELECT * FROM customers WHERE phone = ?', [phone]);
      const customers = resultToObjects(result);
      return customers[0] || null;
    },

    search: (query) => {
      return db.prepare(`
        SELECT * FROM customers 
        WHERE phone LIKE ? OR name LIKE ? 
        ORDER BY total_orders DESC 
        LIMIT 10
      `).all(`%${query}%`, `%${query}%`);
    },

    create: (name, phone, email = null) => {
      const result = db.prepare(`
        INSERT INTO customers (name, phone, email)
        VALUES (?, ?, ?)
      `).run(name, phone, email);
      return result.lastInsertRowid;
    },

    update: (id, updates) => {
      const fields = [];
      const values = [];

      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(updates[key]);
        }
      });

      if (fields.length === 0) return;

      values.push(id);
      return db.run(`UPDATE customers SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...values);
    },

    updateStats: (customerId, orderTotal) => {
      return db.prepare(`
        UPDATE customers 
        SET total_orders = total_orders + 1, 
            total_spent = total_spent + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(orderTotal, customerId);
    },

    getOrderHistory: (customerId, limit = 20) => {
      return db.prepare(`
        SELECT o.*, COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.customer_id = ?
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT ?
      `).all(customerId, limit);
    }
  },

  // Inventory operations
  inventory: {
    updateStock: (itemId, quantity, reason, userId) => {
      const transaction = db.transaction(() => {
        // Update menu item stock
        db.run('UPDATE menu_items SET stock_quantity = stock_quantity + ? WHERE id = ?', [quantity, itemId]);

        // Record transaction
        db.prepare(`
          INSERT INTO inventory_transactions (menu_item_id, transaction_type, quantity, reason, created_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(itemId, quantity > 0 ? 'add' : 'remove', Math.abs(quantity), reason, userId);

        // Update availability based on stock
        const itemResult = db.exec('SELECT stock_quantity FROM menu_items WHERE id = ?', [itemId]);
        const item = itemResult.length > 0 && itemResult[0].values.length > 0 ? resultToObjects(itemResult)[0] : null;
        if (item && item.stock_quantity <= 0) {
          db.run('UPDATE menu_items SET is_available = 0 WHERE id = ?', [itemId]);
        } else if (item && item.stock_quantity > 0) {
          db.run('UPDATE menu_items SET is_available = 1 WHERE id = ?', [itemId]);
        }
      });

      transaction();
    },

    getStockLevel: (itemId) => {
      const result = db.exec('SELECT stock_quantity FROM menu_items WHERE id = ?', [itemId]);
      const items = resultToObjects(result);
      return items[0] || null;
    },

    getLowStockItems: () => {
      const result = db.exec(`
        SELECT m.*, c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.stock_quantity <= m.low_stock_threshold AND m.is_available = 1
        ORDER BY m.stock_quantity ASC
      `);
      return resultToObjects(result);
    },

    getTransactionHistory: (itemId, limit = 50) => {
      return db.prepare(`
        SELECT it.*, u.username as created_by_name
        FROM inventory_transactions it
        LEFT JOIN users u ON it.created_by = u.id
        WHERE it.menu_item_id = ?
        ORDER BY it.created_at DESC
        LIMIT ?
      `).all(itemId, limit);
    },

    setLowStockThreshold: (itemId, threshold) => {
      return db.run('UPDATE menu_items SET low_stock_threshold = ? WHERE id = ?', [threshold, itemId]);
    }
  },

  // Reporting operations
  reports: {
    getSalesReport: (startDate, endDate) => {
      return db.prepare(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(total_amount) as total_sales,
          SUM(tax_amount) as total_tax,
          SUM(discount_amount) as total_discounts,
          AVG(total_amount) as average_order_value,
          payment_mode,
          COUNT(*) as payment_count
        FROM orders 
        WHERE DATE(created_at) BETWEEN ? AND ?
        AND payment_status = 'paid'
        GROUP BY payment_mode
      `).all(startDate, endDate);
    },

    getDailySummary: (date) => {
      return db.prepare(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(total_amount) as total_sales,
          SUM(tax_amount) as total_tax,
          SUM(discount_amount) as total_discounts,
          AVG(total_amount) as average_order_value
        FROM orders 
        WHERE DATE(created_at) = ?
        AND payment_status = 'paid'
      `).get(date);
    },

    getTopSellingItems: (startDate, endDate, limit = 10) => {
      return db.prepare(`
        SELECT 
          m.name,
          m.price,
          SUM(oi.quantity) as total_quantity,
          SUM(oi.total_price) as total_revenue,
          COUNT(DISTINCT oi.order_id) as order_count
        FROM order_items oi
        JOIN menu_items m ON oi.menu_item_id = m.id
        JOIN orders o ON oi.order_id = o.id
        WHERE DATE(o.created_at) BETWEEN ? AND ?
        AND o.payment_status = 'paid'
        GROUP BY m.id, m.name, m.price
        ORDER BY total_quantity DESC
        LIMIT ?
      `).all(startDate, endDate, limit);
    },

    getTaxReport: (startDate, endDate) => {
      return db.prepare(`
        SELECT 
          DATE(created_at) as date,
          SUM(subtotal) as taxable_amount,
          SUM(tax_amount) as tax_collected,
          tax_rate,
          COUNT(*) as transaction_count
        FROM orders 
        WHERE DATE(created_at) BETWEEN ? AND ?
        AND payment_status = 'paid'
        GROUP BY DATE(created_at), tax_rate
        ORDER BY date DESC
      `).all(startDate, endDate);
    },

    getPaymentBreakdown: (startDate, endDate) => {
      return db.prepare(`
        SELECT 
          payment_mode,
          COUNT(*) as transaction_count,
          SUM(total_amount) as total_amount,
          AVG(total_amount) as average_amount
        FROM orders 
        WHERE DATE(created_at) BETWEEN ? AND ?
        AND payment_status = 'paid'
        GROUP BY payment_mode
        ORDER BY total_amount DESC
      `).all(startDate, endDate);
    }
  },

  // Backup operations
  backup: {
    getDatabaseDump: () => {
      const tables = ['users', 'roles', 'categories', 'menu_items', 'orders', 'order_items', 'customers', 'inventory_transactions'];
      const dump = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: {}
      };

      tables.forEach(table => {
        try {
          const result = db.exec(`SELECT * FROM ${table}`);
          dump.data[table] = resultToObjects(result);
        } catch (error) {
          console.warn(`Table ${table} not found or error:`, error.message);
          dump.data[table] = [];
        }
      });

      return dump;
    },

    restoreDatabase: (dumpData) => {
      if (!dumpData.data) throw new Error('Invalid backup format');

      const transaction = db.transaction(() => {
        // Clear existing data (except keep admin user)
        const tables = ['inventory_transactions', 'order_items', 'orders', 'customers', 'menu_items', 'categories'];
        tables.forEach(table => {
          try {
            db.run(`DELETE FROM ${table}`);
          } catch (error) {
            console.warn(`Could not clear table ${table}:`, error.message);
          }
        });

        // Restore data
        Object.keys(dumpData.data).forEach(table => {
          const rows = dumpData.data[table];
          if (!rows || rows.length === 0) return;

          try {
            const columns = Object.keys(rows[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);

            rows.forEach(row => {
              const values = columns.map(col => row[col]);
              stmt.run(...values);
            });
          } catch (error) {
            console.warn(`Could not restore table ${table}:`, error.message);
          }
        });
      });

      transaction();
    }
  }
};

// Save database to file
function saveDatabase() {
  if (db && SQL) {
    const data = db.export();
    fs.writeFileSync(dbPath, data);
  }
}

// Auto-save every 30 seconds
setInterval(saveDatabase, 30000);

// Save on process exit
process.on('exit', saveDatabase);
process.on('SIGINT', () => {
  saveDatabase();
  process.exit(0);
});

// Unified exports - merge old-style ops with dbOps
module.exports = {
  initDatabase,
  saveDatabase,
  getDatabase: () => db,
  // Old-style operations (for compatibility with server.js)
  user: userOps,
  category: categoryOps,
  menu: menuOps,
  order: orderOps,
  kot: kotOps,
  tax: taxOps,
  settings: settingOps,
  settingOps: settingOps,
  // Aliases
  categoryOps,
  menuOps,
  orderOps,
  kotOps,
  taxOps,
  settingsOps: settingOps,
  settingOps,
  // New dbOps structure
  user: {
    ...userOps,
    ...dbOps.user,
    // Ensure getByPin is accessible
    getByPin: dbOps.user.getByPin
  },
  roles: dbOps.role,
  customer: dbOps.customer,
  inventory: dbOps.inventory,
  reports: dbOps.reports,
  backup: dbOps.backup,
  // Enhanced modules
  tokenQueue: tokenQueueManager,
  inventoryManager: inventoryManager,
  orderHold: orderHoldManager,
  // Query helper for raw SQL
  query: (sql, params = []) => {
    try {
      const stmt = db.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return { rows: results };
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }
};
