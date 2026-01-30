// Database module for Cafe POS using sql.js (pure JavaScript SQLite)
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

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

  // Add is_active column to users table if it doesn't exist (for existing databases)
  const usersTableInfo = db.exec('PRAGMA table_info(users)');
  const usersTableColumns = resultToObjects(usersTableInfo).map(row => row.name);
  if (!usersTableColumns.includes('is_active')) {
    db.run('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
  }

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
      stock_quantity INTEGER DEFAULT NULL,
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
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add description column to settings table if it doesn't exist
  const settingsInfo = db.exec('PRAGMA table_info(settings)');
  const settingsColumns = resultToObjects(settingsInfo).map(row => row.name);
  if (!settingsColumns.includes('description')) {
    db.run('ALTER TABLE settings ADD COLUMN description TEXT');
  }
  if (!settingsColumns.includes('updated_at')) {
    db.run('ALTER TABLE settings ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  }

  // Create default admin user if not exists
  const defaultPin = '1234';
  const defaultPassword = 'admin123';

  const existingUser = db.exec('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!existingUser.length || !existingUser[0].values.length) {
    const pinHash = bcrypt.hashSync(defaultPin, 10);
    const passwordHash = bcrypt.hashSync(defaultPassword, 10);

    db.run(`INSERT OR IGNORE INTO users (username, password_hash, pin_hash, role, permissions) VALUES (?, ?, ?, 'admin', ?)`,
      ['admin', passwordHash, pinHash, JSON.stringify(['manage_all', 'manage_settings', 'manage_users', 'manage_customers', 'manage_inventory', 'view_reports'])]);

    console.log('Default admin user created (PIN: 1234) with full permissions');
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

  // Create KDS tables
  db.run(`
    CREATE TABLE IF NOT EXISTS kds_stations (
      station_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT,
      description TEXT,
      position INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kds_orders (
      kds_order_id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      table_id INTEGER,
      customer_name TEXT,
      order_type TEXT DEFAULT 'dine-in',
      status TEXT DEFAULT 'received',
      priority INTEGER DEFAULT 0,
      estimated_prep_time INTEGER,
      notes TEXT,
      kds_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      kds_completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders (id),
      FOREIGN KEY (table_id) REFERENCES tables (id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kds_order_items (
      kds_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      kds_order_id INTEGER NOT NULL,
      order_item_id INTEGER NOT NULL,
      station_id INTEGER,
      menu_item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT DEFAULT 'received',
      notes TEXT,
      estimated_prep_time INTEGER,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (kds_order_id) REFERENCES kds_orders (kds_order_id),
      FOREIGN KEY (station_id) REFERENCES kds_stations (station_id),
      FOREIGN KEY (order_item_id) REFERENCES order_items (id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kds_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kds_order_id INTEGER,
      kds_item_id INTEGER,
      old_status TEXT,
      new_status TEXT,
      changed_by TEXT,
      change_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (kds_order_id) REFERENCES kds_orders (kds_order_id),
      FOREIGN KEY (kds_item_id) REFERENCES kds_order_items (kds_item_id)
    )
  `);

  // Create tables table for table management
  db.run(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number TEXT NOT NULL,
      name TEXT,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available',
      location_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create system_settings table for service configurations
  db.run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create digital receipt tables
  db.run(`
    CREATE TABLE IF NOT EXISTS digital_receipt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      template_type TEXT DEFAULT 'email',
      subject_template TEXT,
      body_template TEXT,
      html_template TEXT,
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_communication_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      email TEXT,
      phone TEXT,
      whatsapp_enabled INTEGER DEFAULT 0,
      email_enabled INTEGER DEFAULT 1,
      sms_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers (id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS digital_receipt_history (
      id TEXT PRIMARY KEY,
      order_id INTEGER NOT NULL,
      customer_id INTEGER,
      template_id INTEGER,
      receipt_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      message_id TEXT,
      external_id TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders (id),
      FOREIGN KEY (customer_id) REFERENCES customers (id),
      FOREIGN KEY (template_id) REFERENCES digital_receipt_templates (id)
    )
  `);

  // Create indexes for better performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_kds_orders_status ON kds_orders (status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_kds_orders_order_id ON kds_orders (order_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_kds_order_items_status ON kds_order_items (status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_kds_order_items_station ON kds_order_items (station_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tables_status ON tables (status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tables_location ON tables (location_id)`);

  // =================== INVENTORY MANAGEMENT TABLES ===================
  // Create inventory categories table
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create inventory suppliers table
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create inventory items table
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      stock_quantity INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 5,
      cost_price REAL DEFAULT 0,
      selling_price REAL DEFAULT 0,
      unit TEXT DEFAULT 'piece',
      supplier_id INTEGER,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create inventory adjustments table
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reason TEXT,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      adjusted_by INTEGER,
      adjusted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create inventory logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for inventory tables
  db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items (category_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_items_supplier ON inventory_items (supplier_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_items_stock ON inventory_items (stock_quantity, low_stock_threshold)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_item ON inventory_adjustments (item_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_logs_item ON inventory_logs (item_id)`);

  // Insert default inventory categories if none exist
  const existingInvCategories = db.exec('SELECT COUNT(*) as count FROM inventory_categories');
  let invCategoryCount = 0;
  if (existingInvCategories.length > 0) {
    invCategoryCount = existingInvCategories[0].values[0][0];
  }

  if (invCategoryCount === 0) {
    const invCategories = [
      { name: 'Coffee & Beverages', description: 'Coffee, tea, and other beverages' },
      { name: 'Food Items', description: 'Snacks, meals, and food products' },
      { name: 'Packaging', description: 'Cups, lids, bags, and packaging materials' },
      { name: 'Cleaning Supplies', description: 'Cleaning and sanitization products' },
      { name: 'Office Supplies', description: 'Paper, pens, and office materials' },
      { name: 'Equipment Parts', description: 'Machine parts and equipment components' }
    ];

    invCategories.forEach(cat => {
      db.run(`INSERT INTO inventory_categories (name, description) VALUES (?, ?)`,
        [cat.name, cat.description]);
    });

    console.log('Default inventory categories created');
  }

  // Insert default inventory suppliers if none exist
  const existingInvSuppliers = db.exec('SELECT COUNT(*) as count FROM inventory_suppliers');
  let invSupplierCount = 0;
  if (existingInvSuppliers.length > 0) {
    invSupplierCount = existingInvSuppliers[0].values[0][0];
  }

  if (invSupplierCount === 0) {
    const invSuppliers = [
      { name: 'Coffee Bean Co.', contact_person: 'John Smith', phone: '+1234567890', email: 'john@coffeebean.com', address: '123 Coffee St, Coffee City', notes: 'Primary coffee supplier' },
      { name: 'Bakery Supplies Ltd.', contact_person: 'Sarah Johnson', phone: '+1234567891', email: 'sarah@bakery.com', address: '456 Bakery Rd, Food Town', notes: 'Pastries and baked goods' },
      { name: 'Packaging Plus', contact_person: 'Mike Wilson', phone: '+1234567892', email: 'mike@packaging.com', address: '789 Package Ave, Box City', notes: 'Packaging materials' },
      { name: 'Clean Solutions', contact_person: 'Lisa Brown', phone: '+1234567893', email: 'lisa@cleansol.com', address: '321 Clean St, Sanitize Town', notes: 'Cleaning supplies' }
    ];

    invSuppliers.forEach(sup => {
      db.run(`INSERT INTO inventory_suppliers (name, contact_person, phone, email, address, notes) VALUES (?, ?, ?, ?, ?, ?)`,
        [sup.name, sup.contact_person, sup.phone, sup.email, sup.address, sup.notes]);
    });

    console.log('Default inventory suppliers created');
  }

  // Add location_id to existing tables
  const ordersInfo = db.exec('PRAGMA table_info(orders)');
  const ordersColumns = resultToObjects(ordersInfo).map(row => row.name);
  if (!ordersColumns.includes('location_id')) {
    db.run('ALTER TABLE orders ADD COLUMN location_id INTEGER DEFAULT 1');
  }

  const menuInfo = db.exec('PRAGMA table_info(menu_items)');
  const menuColumns = resultToObjects(menuInfo).map(row => row.name);
  if (!menuColumns.includes('location_id')) {
    db.run('ALTER TABLE menu_items ADD COLUMN location_id INTEGER DEFAULT 1');
  }

  const invInfo = db.exec('PRAGMA table_info(inventory_transactions)');
  const invColumns = resultToObjects(invInfo).map(row => row.name);
  if (!invColumns.includes('location_id')) {
    db.run('ALTER TABLE inventory_transactions ADD COLUMN location_id INTEGER DEFAULT 1');
  }

  const custInfo = db.exec('PRAGMA table_info(customers)');
  const custColumns = resultToObjects(custInfo).map(row => row.name);
  if (!custColumns.includes('location_id')) {
    db.run('ALTER TABLE customers ADD COLUMN location_id INTEGER DEFAULT 1');
  }

  const userInfo = db.exec('PRAGMA table_info(users)');
  const userColumns = resultToObjects(userInfo).map(row => row.name);
  if (!userColumns.includes('location_id')) {
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

  // Create sample KDS stations if not exists
  const existingStations = db.exec('SELECT COUNT(*) as count FROM kds_stations');
  let stationCount = 0;
  if (existingStations.length > 0) {
    stationCount = existingStations[0].values[0][0];
  }

  if (stationCount === 0) {
    const stations = [
      { name: 'grill', display_name: 'Grill Station', description: 'Hot food preparation', position: 1 },
      { name: 'cold', display_name: 'Cold Station', description: 'Cold beverages and desserts', position: 2 },
      { name: 'bar', display_name: 'Bar Station', description: 'Coffee and hot beverages', position: 3 },
      { name: 'fry', display_name: 'Fry Station', description: 'Fried items', position: 4 }
    ];

    stations.forEach(station => {
      db.run(`INSERT INTO kds_stations (name, display_name, description, position) VALUES (?, ?, ?, ?)`,
        [station.name, station.display_name, station.description, station.position]);
    });

    console.log('Sample KDS stations created');
  }

  // Create sample tables if not exists
  const existingTables = db.exec('SELECT COUNT(*) as count FROM tables');
  let tableCount = 0;
  if (existingTables.length > 0) {
    tableCount = existingTables[0].values[0][0];
  }

  if (tableCount === 0) {
    const tables = [
      { table_number: 'T01', name: 'Table 1', capacity: 2, status: 'available' },
      { table_number: 'T02', name: 'Table 2', capacity: 4, status: 'available' },
      { table_number: 'T03', name: 'Table 3', capacity: 4, status: 'available' },
      { table_number: 'T04', name: 'Table 4', capacity: 6, status: 'available' },
      { table_number: 'T05', name: 'Table 5', capacity: 2, status: 'available' },
      { table_number: 'T06', name: 'Table 6', capacity: 4, status: 'available' },
      { table_number: 'T07', name: 'Table 7', capacity: 8, status: 'available' },
      { table_number: 'T08', name: 'Table 8', capacity: 4, status: 'available' }
    ];

    tables.forEach(table => {
      db.run(`INSERT INTO tables (table_number, name, capacity, status, location_id) VALUES (?, ?, ?, ?, ?)`,
        [table.table_number, table.name, table.capacity, table.status, 1]);
    });

    console.log('Sample tables created');
  }

  // Seed default data (roles, users, etc.)
  seedDefaultData();

  saveDatabase();
}

// Save database to file
function saveDatabase() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (err) {
      console.error('FAILED TO SAVE DATABASE:', err);
      throw err; // Re-throw to propagate to caller
    }
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
  },

  getByPin: (pin) => {
    const result = db.exec('SELECT * FROM users WHERE is_active = 1');
    const users = resultToObjects(result);
    for (const user of users) {
      if (user.pin_hash && bcrypt.compareSync(pin, user.pin_hash)) {
        return user;
      }
    }
    return null;
  },

  getById: (id) => {
    const result = db.exec(`
      SELECT u.*, r.name as role_name, r.permissions as role_permissions
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = ? AND u.is_active = 1
    `, [id]);
    const users = resultToObjects(result);
    return users[0] || null;
  },

  create: (userData) => {
    const { username, pin_hash, password_hash, role_id, full_name, permissions } = userData;
    db.run(`
      INSERT INTO users (username, pin_hash, password_hash, role_id, full_name, permissions)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [username, pin_hash, password_hash, role_id, full_name, JSON.stringify(permissions || [])]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDatabase();
    return result[0].values[0][0];
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
    db.run(`UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
    saveDatabase();
    return true;
  },

  delete: (id) => {
    db.run('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    saveDatabase();
    return true;
  },

  getPermissions: (userId) => {
    const result = db.exec(`
      SELECT u.permissions, r.permissions as role_permissions
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = ?
    `, [userId]);
    const user = resultToObjects(result)[0];
    if (!user) return [];
    const userPerms = JSON.parse(user.permissions || '[]');
    const rolePerms = JSON.parse(user.role_permissions || '[]');
    return [...new Set([...userPerms, ...rolePerms])];
  }
};

// Role operations
const roleOps = {
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
    db.run(`
      INSERT INTO roles (name, description, permissions)
      VALUES (?, ?, ?)
    `, [name, description, JSON.stringify(permissions || [])]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDatabase();
    return result[0].values[0][0];
  },

  update: (id, name, description, permissions) => {
    db.run(`
      UPDATE roles SET name = ?, description = ?, permissions = ?
      WHERE id = ?
    `, [name, description, JSON.stringify(permissions), id]);
    saveDatabase();
    return true;
  },

  delete: (id) => {
    db.run('UPDATE roles SET is_active = 0 WHERE id = ?', [id]);
    saveDatabase();
    return true;
  }
};

// Customer operations
const customerOps = {
  getAll: () => {
    try {
      const stmt = db.prepare("SELECT * FROM customers ORDER BY name ASC");
      const customers = [];
      while (stmt.step()) {
        customers.push(stmt.getAsObject());
      }
      stmt.free();
      return customers;
    } catch (error) {
      console.error('Error getting all customers:', error);
      return [];
    }
  },

  search: (q) => {
    try {
      const stmt = db.prepare("SELECT * FROM customers WHERE name LIKE $q OR phone LIKE $q ORDER BY name ASC");
      stmt.bind({ $q: `%${q}%` });
      const customers = [];
      while (stmt.step()) {
        customers.push(stmt.getAsObject());
      }
      stmt.free();
      return customers;
    } catch (error) {
      console.error('Error searching customers:', error);
      return [];
    }
  },

  create: (name, phone, email, notes) => {
    try {
      // Check if phone exists
      const existing = db.exec("SELECT id FROM customers WHERE phone = ?", [phone]);
      if (existing.length > 0 && existing[0].values.length > 0) {
        throw new Error('Customer with this phone already exists');
      }

      db.run("INSERT INTO customers (name, phone, email, notes, created_at) VALUES (?, ?, ?, ?, ?)", [name, phone, email || null, notes || null, new Date().toISOString()]);
      saveDatabase();
      const result = db.exec("SELECT last_insert_rowid() as id");
      const id = result[0].values[0][0];
      
      const stmt = db.prepare("SELECT * FROM customers WHERE id = ?");
      stmt.bind([id]);
      let customer = null;
      if (stmt.step()) {
        customer = stmt.getAsObject();
      }
      stmt.free();
      
      // Ensure we always return a valid customer object with at least name and phone
      if (!customer) {
        customer = {
          id: id,
          name: name,
          phone: phone,
          email: email || null,
          notes: notes || null,
          created_at: new Date().toISOString()
        };
      }
      
      return customer;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  },

  getById: (id) => {
    try {
      const result = db.exec("SELECT * FROM customers WHERE id = ?", [id]);
      const customers = resultToObjects(result);
      return customers[0] || null;
    } catch (error) {
      console.error('Error getting customer by ID:', error);
      return null;
    }
  },

  getByPhone: (phone) => {
    try {
      const stmt = db.prepare("SELECT * FROM customers WHERE phone = ?");
      stmt.bind([phone]);
      let customer = null;
      if (stmt.step()) {
        customer = stmt.getAsObject();
      }
      stmt.free();
      return customer;
    } catch (error) {
      console.error('Error getting customer by phone:', error);
      return null;
    }
  },

  update: (id, data) => {
    try {
      const { name, phone, email, notes } = data;
      db.run(
        "UPDATE customers SET name = ?, phone = ?, email = ?, notes = ?, updated_at = ? WHERE id = ?",
        [name, phone, email, notes, new Date().toISOString(), id]
      );
      saveDatabase();
      return true;
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  },

  delete: (id) => {
    try {
      db.run("DELETE FROM customers WHERE id = ?", [id]);
      saveDatabase();
      return true;
    } catch (error) {
      console.error('Error deleting customer:', error);
      throw error;
    }
  },

  getOrderHistory: (customerId) => {
    try {
      const stmt = db.prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC");
      stmt.bind([customerId]);
      const orders = [];
      while (stmt.step()) {
        orders.push(stmt.getAsObject());
      }
      stmt.free();
      return orders;
    } catch (error) {
      console.error('Error getting customer order history:', error);
      return [];
    }
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
    const orderNumber = orderData.order_number || orderData.orderNumber;
    const customerId = orderData.customer_id || orderData.customerId || null;
    const subtotal = orderData.subtotal;
    const discountAmount = orderData.discount_amount !== undefined ? orderData.discount_amount : (orderData.discountAmount || 0);
    const discountType = orderData.discount_type || orderData.discountType || 'fixed';
    const taxAmount = orderData.tax_amount !== undefined ? orderData.tax_amount : orderData.taxAmount;
    const taxRate = orderData.tax_rate || orderData.taxRate || 9;
    const totalAmount = orderData.total_amount !== undefined ? orderData.total_amount : orderData.totalAmount;
    const paymentMode = orderData.payment_mode || orderData.paymentMode || 'cash';
    const paymentStatus = orderData.payment_status || orderData.paymentStatus || 'unpaid';
    const status = orderData.status || 'pending';
    const notes = orderData.notes || '';

    db.run(`
      INSERT INTO orders (
        order_number, customer_id, subtotal, discount_amount, discount_type,
        tax_amount, tax_rate, total_amount, payment_mode,
        payment_status, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, orderNumber, customerId, subtotal, discountAmount, discountType, taxAmount, taxRate, totalAmount, paymentMode, paymentStatus, status, notes);
    
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDatabase();
    return result[0].values[0][0];
  },

  addItem: (orderId, itemData) => {
    db.run(`
      INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `, orderId, itemData.menuItemId, itemData.quantity, itemData.unitPrice, itemData.totalPrice, itemData.notes || '');
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
    // First try to update existing setting
    const stmt1 = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    stmt1.bind([String(value), key]);
    stmt1.step();
    const changes = db.getRowsModified();
    stmt1.free();

    // If no rows were updated, insert new setting
    if (changes === 0) {
      const stmt2 = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      stmt2.bind([key, String(value)]);
      stmt2.step();
      stmt2.free();
    }
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
    try {
      console.log('Updating settings:', Object.keys(settingsObj));
      for (const [key, value] of Object.entries(settingsObj)) {
        // First try to update existing setting
        const stmt1 = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
        stmt1.bind([String(value), key]);
        stmt1.step();
        const changes = db.getRowsModified();
        stmt1.free();

        // If no rows were updated, insert new setting
        if (changes === 0) {
          const stmt2 = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
          stmt2.bind([key, String(value)]);
          stmt2.step();
          stmt2.free();
        }
      }
      saveDatabase();
    } catch (err) {
      console.error('Error in updateMultiple:', err);
      throw err;
    }
  }
};

const systemOps = {
  rawQuery: (sql, params = []) => {
    return db.run(sql, params);
  },
  exec: (sql, params = []) => {
    return db.exec(sql, params);
  }
};

// Export all operations
module.exports = {
  system: systemOps,
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
        ['cashier', 'Cashier with basic access', JSON.stringify(['manage_orders', 'view_menu', 'view_customers', 'view_inventory', 'view_settings'])]);
    }

    // Create default admin user if not exists
    const adminUserResult = db.exec('SELECT id FROM users WHERE username = ?', ['admin']);
    const adminUser = adminUserResult.length > 0 && adminUserResult[0].values.length > 0 ? resultToObjects(adminUserResult)[0] : null;
    if (!adminUser) {
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

// Unified exports - merge verified operations
module.exports = {
  initDatabase,
  saveDatabase,
  getDatabase: () => db,
  // Operations (consistent with server.js and mvp-endpoints.js expectations)
  user: userOps,
  role: roleOps,
  roles: roleOps,
  category: categoryOps,
  categoryOps,
  menu: menuOps,
  menuOps,
  order: orderOps,
  orderOps,
  kot: kotOps,
  kotOps,
  tax: taxOps,
  taxOps,
  settings: settingOps,
  settingOps,
  customer: customerOps,
  customerOps,
  // Query helper for raw SQL (used by enterprise endpoints)
  query: (sql, params = []) => {
    try {
      const result = db.exec(sql, params);
      return { rows: resultToObjects(result) };
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  },
  // Helpers to match various expected APIs
  run: (sql, params = []) => {
    try {
      db.run(sql, params);
      return Promise.resolve({
        lastID: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || null,
        changes: db.getRowsModified()
      });
    } catch (error) {
      console.error('Run error:', error);
      return Promise.reject(error);
    }
  },
  get: (sql, params = []) => {
    try {
      const result = db.exec(sql, params);
      const objects = resultToObjects(result);
      return Promise.resolve(objects[0] || null);
    } catch (error) {
      console.error('Get error:', error);
      return Promise.reject(error);
    }
  },
  all: (sql, params = []) => {
    try {
      const result = db.exec(sql, params);
      return Promise.resolve(resultToObjects(result));
    } catch (error) {
      console.error('All error:', error);
      return Promise.reject(error);
    }
  },
  execute: (sql, params = []) => {
    try {
      const result = db.exec(sql, params);
      return Promise.resolve(resultToObjects(result));
    } catch (error) {
      console.error('Execute error:', error);
      return Promise.reject(error);
    }
  },
  // Enhanced modules
  tokenQueue: tokenQueueManager,
  inventoryManager: inventoryManager,
  orderHold: orderHoldManager,
  system: systemOps
};
