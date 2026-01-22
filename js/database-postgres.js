const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'cafe_pos',
  port: process.env.DB_PORT || 5432,
});

async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

// Initialize database
async function initDatabase() {
  try {
    // Create tables
    await query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        resource TEXT NOT NULL,
        action TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        permissions JSONB DEFAULT '[]', -- List of permission IDs or CASL rules
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin', -- Legacy, keeping for now. New systems should use role_id
        role_id INTEGER REFERENCES roles(id),
        email TEXT,
        full_name TEXT,
        preferences JSONB DEFAULT '{}', -- Store detailed user preferences like language
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        display_order INTEGER DEFAULT 0,
        icon TEXT DEFAULT '☕',
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        name TEXT NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        image TEXT,
        is_available INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        discount_amount DECIMAL(10, 2) DEFAULT 0,
        discount_type TEXT DEFAULT 'fixed',
        tax_amount DECIMAL(10, 2) NOT NULL,
        tax_rate DECIMAL(5, 2) DEFAULT 9,
        total_amount DECIMAL(10, 2) NOT NULL,
        payment_mode TEXT DEFAULT 'cash',
        payment_status TEXT DEFAULT 'unpaid',
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        total_price DECIMAL(10, 2) NOT NULL,
        notes TEXT
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS kot_tickets (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        ticket_number TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS tax_settings (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        rate DECIMAL(5, 2) NOT NULL,
        type TEXT DEFAULT 'percentage', -- percentage or fixed
        location TEXT DEFAULT 'default', -- location code (e.g., 'IN-MH', 'US-NY')
        apply_to_all BOOLEAN DEFAULT TRUE,
        specific_categories JSONB DEFAULT '[]', -- Category IDs this tax applies to
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: Add location column if it applies to an old schema
    try {
      await query(`ALTER TABLE tax_settings ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'default'`);
    } catch (e) {
      console.log('Migration check: tax_settings.location');
    }

    try {
      await query(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0`);
    } catch (e) {
        console.log('Migration check: menu_items.stock_quantity');
    }

    try {
      await query(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5`);
    } catch (e) {
        console.log('Migration check: menu_items.low_stock_threshold');
    }

    // Migration: Add role column to users table for legacy compatibility
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin'`);
    } catch (e) {
      console.log('Migration check: users.role');
    }

    // Migration: Add role_id column to users table
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id)`);
    } catch (e) {
      console.log('Migration check: users.role_id');
    }

    // Migration: Add email column to users table
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
    } catch (e) {
      console.log('Migration check: users.email');
    }

    // Migration: Add full_name column to users table
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT`);
    } catch (e) {
      console.log('Migration check: users.full_name');
    }

    // Migration: Add preferences column to users table
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'`);
    } catch (e) {
      console.log('Migration check: users.preferences');
    }

    // Migration: Add is_active column to users table
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1`);
    } catch (e) {
      console.log('Migration check: users.is_active');
    }

    // Indices for performance
    await query(`CREATE INDEX IF NOT EXISTS IDX_menu_items_category ON menu_items(category_id)`);
    await query(`CREATE INDEX IF NOT EXISTS IDX_order_items_order ON order_items(order_id)`);
    await query(`CREATE INDEX IF NOT EXISTS IDX_order_items_menu_item ON order_items(menu_item_id)`);
    await query(`CREATE INDEX IF NOT EXISTS IDX_kot_tickets_order ON kot_tickets(order_id)`);
    await query(`CREATE INDEX IF NOT EXISTS IDX_orders_order_number ON orders(order_number)`);
    await query(`CREATE INDEX IF NOT EXISTS IDX_customers_phone ON customers(phone)`);

    await query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT,
        phone TEXT UNIQUE NOT NULL,
        email TEXT,
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id SERIAL PRIMARY KEY,
        menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
        transaction_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        reason TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id)`);
    } catch (e) {
        console.log('Migration check: orders.customer_id');
    }

    await query(`
      CREATE TABLE IF NOT EXISTS translations (
        id SERIAL PRIMARY KEY,
        lang_code TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(lang_code, key)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: Add description column if it doesn't exist
    try {
      await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS description TEXT`);
    } catch (e) {
      console.log('Migration check: settings.description');
    }

    // Seed default settings
    const defaultSettings = [
      ['business_name', 'Cafe POS', 'The name of your business'],
      ['business_address', '123 Main St, City', 'The address of your business'],
      ['tax_rate', '9.00', 'GST Tax percentage'],
      ['currency_symbol', '₹', 'Currency symbol to display'],
      ['currency_code', 'INR', 'ISO currency code'],
      ['receipt_header', 'COFFEE CAFE\nTaste the Difference', 'Text to display at the top of the receipt'],
      ['receipt_footer', 'Thank you! Visit Again!', 'Text to display at the bottom of the receipt'],
      ['receipt_show_logo', 'true', 'Whether to show the coffee logo on receipts'],
      ['receipt_font_size', '12px', 'Base font size for receipt printing']
    ];

    for (const [key, value, desc] of defaultSettings) {
      await query(`
        INSERT INTO settings (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET value = $2, description = $3
      `, [key, value, desc]);
    }

    // Seed default roles
    const rolesCount = await query('SELECT COUNT(*) as count FROM roles');
    let adminRoleId, cashierRoleId;

    if (parseInt(rolesCount.rows[0].count) === 0) {
      const adminRole = await query("INSERT INTO roles (name, description, permissions) VALUES ('admin', 'Full Administrator Access', '[\"manage_all\"]') RETURNING id");
      adminRoleId = adminRole.rows[0].id;
      
      const cashierRole = await query("INSERT INTO roles (name, description, permissions) VALUES ('cashier', 'Cashier Access (POS only)', '[\"pos_access\", \"view_orders\"]') RETURNING id");
      cashierRoleId = cashierRole.rows[0].id;
    } else {
        const adminRoleRes = await query("SELECT id FROM roles WHERE name = 'admin'");
        if(adminRoleRes.rows.length) adminRoleId = adminRoleRes.rows[0].id;
        
        const cashierRoleRes = await query("SELECT id FROM roles WHERE name = 'cashier'");
        if(cashierRoleRes.rows.length) cashierRoleId = cashierRoleRes.rows[0].id;
    }

    // Seed default admin
    const bcrypt = require('bcryptjs');
    const defaultPin = '1234';
    const defaultPassword = 'admin123';
    
    const userResult = await query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (userResult.rows.length === 0) {
      const pinHash = bcrypt.hashSync(defaultPin, 10);
      const passwordHash = bcrypt.hashSync(defaultPassword, 10);
      await query(`INSERT INTO users (username, password_hash, pin_hash, role, role_id) VALUES ($1, $2, $3, 'admin', $4)`, 
        ['admin', passwordHash, pinHash, adminRoleId]);
      console.log('Default admin user created');
    }

    const cashierResult = await query('SELECT id FROM users WHERE username = $1', ['cashier']);
    if (cashierResult.rows.length === 0) {
      const pinHash = bcrypt.hashSync('5678', 10);
      const passwordHash = bcrypt.hashSync('cashier123', 10);
      await query(`INSERT INTO users (username, password_hash, pin_hash, role, role_id) VALUES ($1, $2, $3, 'cashier', $4)`, 
        ['cashier', passwordHash, pinHash, cashierRoleId]);
      console.log('Default cashier user created');
    }

    // Seed default categories
    const catCount = await query('SELECT COUNT(*) as count FROM categories');
    if (parseInt(catCount.rows[0].count) === 0) {
        const categories = [
            { name: 'Coffee', icon: '☕', order: 1 },
            { name: 'Tea', icon: '🍵', order: 2 },
            { name: 'Snacks', icon: '🥐', order: 3 },
            { name: 'Fast-Food', icon: '🍔', order: 4 },
            { name: 'Cold Beverages', icon: '🧊', order: 5 },
            { name: 'Meals/Combos', icon: '🍽️', order: 6 }
        ];
        for (const cat of categories) {
            await query('INSERT INTO categories (name, icon, display_order) VALUES ($1, $2, $3)', [cat.name, cat.icon, cat.order]);
        }
    }

    // Seed tax
    const taxCount = await query('SELECT COUNT(*) as count FROM tax_settings');
    if (parseInt(taxCount.rows[0].count) === 0) {
        await query('INSERT INTO tax_settings (name, rate, is_active) VALUES ($1, $2, $3)', ['GST', 9, 1]);
    }

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
}

const userOps = {
  getAll: async () => {
    const res = await query(`
      SELECT u.id, u.username, u.role, u.role_id, u.last_login, u.is_active, r.name as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = 1
      ORDER BY u.id
    `);
    return res.rows;
  },
  getByUsername: async (username) => {
    const res = await query('SELECT * FROM users WHERE username = $1 AND is_active = 1', [username]);
    return res.rows[0];
  },
  getById: async (id) => {
    const res = await query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
  },
  create: async (data) => {
     // data: { username, pin_hash, role_id, ... }
     // We default role based on role_id lookup or passed role name (legacy support)
     
     // 1. Get role name if not provided but role_id is
     let roleName = data.role;
     if (!roleName && data.role_id) {
         const r = await query('SELECT name FROM roles WHERE id = $1', [data.role_id]);
         if(r.rows.length) roleName = r.rows[0].name;
     }

     const res = await query(`
        INSERT INTO users (username, password_hash, pin_hash, role, role_id, full_name, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, 1)
        RETURNING id
     `, [
         data.username, 
         data.password_hash || '', // optional for now if using PIN only
         data.pin_hash,
         roleName || 'cashier',
         data.role_id,
         data.full_name || ''
     ]);
     return res.rows[0].id;
  },
  update: async (id, data) => {
    // Build dynamic query
    let updates = [];
    let params = [];
    let idx = 1;

    if (data.username) { updates.push(`username = $${idx++}`); params.push(data.username); }
    if (data.pin_hash) { updates.push(`pin_hash = $${idx++}`); params.push(data.pin_hash); }
    if (data.role_id) { updates.push(`role_id = $${idx++}`); params.push(data.role_id); }
    if (data.role) { updates.push(`role = $${idx++}`); params.push(data.role); }
    if (data.full_name) { updates.push(`full_name = $${idx++}`); params.push(data.full_name); }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updates.length > 1) { // > 1 because updated_at is always there
        params.push(id);
        await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    }
  },
  delete: async (id) => {
    // Soft delete
    await query('UPDATE users SET is_active = 0 WHERE id = $1', [id]);
  },
  updateLastLogin: async (id) => {
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [id]);
  },
  getPermissions: async (userId) => {
    // Join users -> roles -> permissions logic
    // For now, permissions are stored as JSONB in roles table
    const res = await query(`
      SELECT u.role, r.permissions 
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `, [userId]);
    
    if (res.rows.length > 0) {
      const user = res.rows[0];
      
      // If role_id exists and has permissions, use those
      if (user.permissions) {
        return user.permissions; // Returns array of strings e.g. ["manage_all"] or ["pos_access"]
      }
      
      // Fallback for legacy users without role_id: check role field
      if (user.role === 'admin') {
        return ['manage_all'];
      } else if (user.role === 'cashier') {
        return ['pos_access', 'view_orders'];
      }
    }
    return [];
  },
  checkPinExists: async (pinHash, excludeUserId = null) => {
      let sql = 'SELECT id FROM users WHERE pin_hash = $1 AND is_active = 1';
      let params = [pinHash];
      if (excludeUserId) {
          sql += ' AND id != $2';
          params.push(excludeUserId);
      }
      const res = await query(sql, params);
      return res.rows.length > 0;
  },
  getByPin: async (pin) => {
    const bcrypt = require('bcryptjs');
    // Fetch all active users
    const res = await query('SELECT * FROM users WHERE is_active = 1');

    for (const user of res.rows) {
      if (user.pin_hash && bcrypt.compareSync(pin, user.pin_hash)) {
        return user;
      }
    }
    return null;
  }
};

const categoryOps = {
  getAll: async () => {
    const res = await query('SELECT * FROM categories WHERE is_active = 1 ORDER BY display_order');
    return res.rows;
  },
  getById: async (id) => {
    const res = await query('SELECT * FROM categories WHERE id = $1', [id]);
    return res.rows[0];
  },
  create: async (name, icon, displayOrder) => {
    const res = await query('INSERT INTO categories (name, icon, display_order) VALUES ($1, $2, $3) RETURNING id', [name, icon, displayOrder]);
    return res.rows[0].id;
  },
  update: async (id, name, icon, displayOrder) => {
    await query('UPDATE categories SET name = $1, icon = $2, display_order = $3 WHERE id = $4', [name, icon, displayOrder, id]);
  },
  delete: async (id) => {
    await query('DELETE FROM categories WHERE id = $1', [id]);
  }
};

const customerOps = {
    getAll: async () => {
        const res = await query('SELECT * FROM customers ORDER BY created_at DESC');
        return res.rows;
    },
    search: async (q) => {
        const res = await query(`
            SELECT * FROM customers
            WHERE phone ILIKE $1 OR name ILIKE $1
            ORDER BY name
            LIMIT 10
        `, [`%${q}%`]);
        return res.rows;
    },
    create: async (name, phone) => {
        const res = await query(`
            INSERT INTO customers (name, phone)
            VALUES ($1, $2)
            RETURNING *
        `, [name, phone]);
        return res.rows[0];
    },
    getById: async (id) => {
        const res = await query('SELECT * FROM customers WHERE id = $1', [id]);
        return res.rows[0];
    }
};

const settingOps = {
  getAll: async () => {
    const res = await query('SELECT key, value FROM settings');
    // Convert to object for easier use: { key: value }
    return res.rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  },
  update: async (key, value) => {
    await query('UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2', [value, key]);
  },
  updateMultiple: async (settingsObj) => {
    for (const [key, value] of Object.entries(settingsObj)) {
      await query('UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2', [value, key]);
    }
  }
};

const menuOps = {
  getAll: async () => {
    const res = await query(`
      SELECT m.*, c.name as category_name, c.icon as category_icon 
      FROM menu_items m
      JOIN categories c ON m.category_id = c.id
      ORDER BY c.display_order, m.name
    `);
    return res.rows;
  },
  getByCategory: async (categoryId) => {
    const res = await query(`
      SELECT m.*, c.name as category_name, c.icon as category_icon 
      FROM menu_items m
      JOIN categories c ON m.category_id = c.id
      WHERE m.category_id = $1 AND m.is_available = 1
      ORDER BY m.name
    `, [categoryId]);
    return res.rows;
  },
  search: async (q) => {
    const res = await query(`
        SELECT m.*, c.name as category_name, c.icon as category_icon 
        FROM menu_items m
        JOIN categories c ON m.category_id = c.id
        WHERE m.name ILIKE $1
        ORDER BY m.name
    `, [`%${q}%`]);
    return res.rows;
  },
  create: async (categoryId, name, price, description, stockQuantity = 0) => {
    const res = await query('INSERT INTO menu_items (category_id, name, price, description, stock_quantity) VALUES ($1, $2, $3, $4, $5) RETURNING id', [categoryId, name, price, description, stockQuantity]);
    return res.rows[0].id;
  },
  update: async (id, categoryId, name, price, description, isAvailable, stockQuantity = 0) => {
    await query(`
      UPDATE menu_items 
      SET category_id = $1, name = $2, price = $3, description = $4, is_available = $5, stock_quantity = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
    `, [categoryId, name, price, description, isAvailable ? 1 : 0, stockQuantity, id]);
  },
  toggleAvailability: async (id) => {
      // Need to fetch first to know current status, or use SQL toggle if boolean
      // Let's assume we pass the new status from UI or fetch-toggle
      // proper toggle sql: is_available = 1 - is_available
      await query('UPDATE menu_items SET is_available = CASE WHEN is_available = 1 THEN 0 ELSE 1 END WHERE id = $1', [id]);
  },
  getById: async (id) => {
    const res = await query('SELECT * FROM menu_items WHERE id = $1', [id]);
    return res.rows[0];
  },
  delete: async (id) => {
    await query('DELETE FROM menu_items WHERE id = $1', [id]);
  }
};

const backupOps = {
    getDatabaseDump: async () => {
        const tables = [
            'roles', 'users', 'categories', 'menu_items', 'customers', 
            'orders', 'order_items', 'tax_settings', 'settings', 'translations'
        ];
        
        const dump = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            data: {}
        };

        for (const table of tables) {
            try {
                const res = await query(`SELECT * FROM ${table}`);
                dump.data[table] = res.rows;
            } catch (e) {
                console.error(`Error dumping table ${table}:`, e);
                dump.data[table] = [];
            }
        }
        return dump;
    },
    
    restoreDatabase: async (dumpData) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const order = [
                'order_items', 'orders', 'menu_items', 'categories', 
                'customers', 'users', 'roles', 'tax_settings', 'settings', 'translations'
            ];

            // 1. Clear tables (in reverse dependency order)
            for (const table of order) {
                 await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
            }

            // 2. Restore data (in dependency order: roles -> users -> etc)
            // Reverse of 'order' array roughly, but let's be explicit
            const restoreOrder = [
                'roles', 'users', 'customers', 'categories', 'menu_items', 
                'orders', 'order_items', 'tax_settings', 'settings', 'translations'
            ];

            for (const table of restoreOrder) {
                const rows = dumpData.data[table];
                if (!rows || rows.length === 0) continue;

                // Build Insert Statement Dynamically
                // Assuming all rows have same keys
                const keys = Object.keys(rows[0]);
                if (keys.length === 0) continue;

                const columns = keys.map(k => `"${k}"`).join(', ');
                
                for (const row of rows) {
                    const values = Object.values(row);
                    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
                    
                    await client.query(
                        `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
                        values
                    );
                }
                
                // Reset sequences
                try {
                    await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM ${table}`);
                } catch (e) {
                    // Ignore if no sequence or id column
                }
            }

            await client.query('COMMIT');
            return { success: true };
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('Restore failed:', e);
            throw e;
        } finally {
            client.release();
        }
    }
};

const orderOps = {
    generateOrderNumber: async () => {
        const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const res = await query(`SELECT order_number FROM orders WHERE order_number LIKE $1 ORDER BY id DESC LIMIT 1`, [`ORD-${todayStr}-%`]);
        let counter = 1;
        if (res.rows.length > 0) {
            const parts = res.rows[0].order_number.split('-');
            counter = parseInt(parts[2]) + 1;
        }
        return `ORD-${todayStr}-${String(counter).padStart(4, '0')}`;
    },
    create: async (data) => {
        const res = await query(`
            INSERT INTO orders (
                order_number, subtotal, discount_amount, discount_type,
                tax_amount, tax_rate, total_amount, payment_mode,
                payment_status, status, notes, customer_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id
        `, [
            data.orderNumber, data.subtotal, data.discountAmount || 0, data.discountType || 'fixed',
            data.taxAmount, data.taxRate || 9, data.totalAmount, data.paymentMode || 'cash',
            data.paymentStatus || 'unpaid', data.status || 'pending', data.notes || '',
            data.customerId || null
        ]);
        return res.rows[0].id;
    },
    addItem: async (orderId, item) => {
        await query(`
            INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [orderId, item.menuItemId, item.quantity, item.unitPrice, item.totalPrice, item.notes || '']);

        // Deduct stock
        await query(`
            UPDATE menu_items 
            SET stock_quantity = stock_quantity - $1 
            WHERE id = $2
        `, [item.quantity, item.menuItemId]);
    },
    getById: async (id) => {
        const res = await query('SELECT * FROM orders WHERE id = $1', [id]);
        return res.rows[0];
    },
    getSalesReport: async (startDate, endDate) => {
        const start = startDate + ' 00:00:00';
        const end = endDate + ' 23:59:59';
        
        const res = await query(`
            SELECT 
                COUNT(id) as total_orders,
                COALESCE(SUM(total_amount), 0) as total_sales,
                COALESCE(SUM(tax_amount), 0) as total_tax,
                COALESCE(SUM(discount_amount), 0) as total_discount
            FROM orders 
            WHERE created_at >= $1 AND created_at <= $2 AND status != 'cancelled'
        `, [start, end]);
        
        const paymentRes = await query(`
            SELECT payment_mode, COUNT(id) as count, COALESCE(SUM(total_amount), 0) as total
            FROM orders
            WHERE created_at >= $1 AND created_at <= $2 AND status != 'cancelled'
            GROUP BY payment_mode
        `, [start, end]);

        return {
            summary: res.rows[0],
            paymentBreakdown: paymentRes.rows
        };
    },
    getTopSellingItems: async (startDate, endDate, limit = 5) => {
        const start = startDate + ' 00:00:00';
        const end = endDate + ' 23:59:59';
        
        const res = await query(`
            SELECT mi.name, SUM(oi.quantity) as quantity, SUM(oi.total_price) as revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE o.created_at >= $1 AND o.created_at <= $2 AND o.status != 'cancelled'
            GROUP BY mi.id, mi.name
            ORDER BY quantity DESC
            LIMIT $3
        `, [start, end, limit]);
        
        return res.rows;
    },
    getWithItems: async (id) => {
        const res = await query('SELECT * FROM orders WHERE id = $1', [id]);
        const order = res.rows[0];
        if (!order) return null;
        
        const itemsRes = await query(`
            SELECT oi.*, mi.name, mi.description
            FROM order_items oi
            JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE oi.order_id = $1
        `, [id]);
        order.items = itemsRes.rows;
        return order;
    },
    getTodayOrders: async () => {
        const today = new Date().toISOString().split('T')[0];
        const res = await query('SELECT * FROM orders WHERE DATE(created_at) = $1 ORDER BY id DESC', [today]);
        return res.rows;
    },
    getAllOrders: async () => {
        const res = await query('SELECT * FROM orders ORDER BY id DESC');
        return res.rows;
    },
    searchByNumber: async (q) => {
        const res = await query('SELECT * FROM orders WHERE order_number ILIKE $1 ORDER BY id DESC', [`%${q}%`]);
        return res.rows;
    },
    updateStatus: async (id, status) => {
        await query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);
    },
    updatePayment: async (id, mode, status) => {
        await query('UPDATE orders SET payment_mode = $1, payment_status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [mode, status, id]);
    }
};

const kotOps = {
    generateTicketNumber: async () => {
        const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const res = await query(`SELECT ticket_number FROM kot_tickets WHERE ticket_number LIKE $1 ORDER BY id DESC LIMIT 1`, [`KOT-${todayStr}-%`]);
        let counter = 1;
        if (res.rows.length > 0) {
            const parts = res.rows[0].ticket_number.split('-');
            counter = parseInt(parts[2]) + 1;
        }
        return `KOT-${todayStr}-${String(counter).padStart(4, '0')}`;
    },
    create: async (orderId, notes) => {
        const ticketNumber = await kotOps.generateTicketNumber();
        const res = await query('INSERT INTO kot_tickets (order_id, ticket_number, notes) VALUES ($1, $2, $3) RETURNING id', [orderId, ticketNumber, notes || '']);
        return { id: res.rows[0].id, ticketNumber };
    },
    getAll: async () => {
        const res = await query(`
            SELECT kt.*, o.order_number, o.status as order_status
            FROM kot_tickets kt
            JOIN orders o ON kt.order_id = o.id
            WHERE kt.status != 'served'
            ORDER BY kt.created_at DESC
        `);
        return res.rows;
    },
    getByOrderId: async (orderId) => {
        const res = await query('SELECT * FROM kot_tickets WHERE order_id = $1 ORDER BY id DESC', [orderId]);
        return res.rows;
    },
    updateStatus: async (id, status) => {
        await query('UPDATE kot_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);
        // Also update order if needed, but keeping it simple for now as per original code
        const res = await query('SELECT order_id FROM kot_tickets WHERE id = $1', [id]);
        if (res.rows.length > 0) {
             const ticket = res.rows[0];
             await orderOps.updateStatus(ticket.order_id, status);
        }
    }
};

const taxOps = {
    getActive: async () => {
        const res = await query('SELECT * FROM tax_settings WHERE is_active = 1');
        return res.rows;
    },
    getById: async (id) => {
        const res = await query('SELECT * FROM tax_settings WHERE id = $1', [id]);
        return res.rows[0];
    }
};

const inventoryOps = {
    updateStock: async (itemId, quantity, reason, userId) => {
        // Update menu item stock
        await query('UPDATE menu_items SET stock_quantity = stock_quantity + $1 WHERE id = $2', [quantity, itemId]);

        // Record transaction
        await query(`
            INSERT INTO inventory_transactions (menu_item_id, transaction_type, quantity, reason, created_by)
            VALUES ($1, $2, $3, $4, $5)
        `, [itemId, quantity > 0 ? 'add' : 'remove', Math.abs(quantity), reason, userId]);

        // Update availability based on stock
        const itemRes = await query('SELECT stock_quantity FROM menu_items WHERE id = $1', [itemId]);
        const item = itemRes.rows[0];
        if (item && item.stock_quantity <= 0) {
            await query('UPDATE menu_items SET is_available = 0 WHERE id = $1', [itemId]);
        } else if (item && item.stock_quantity > 0) {
            await query('UPDATE menu_items SET is_available = 1 WHERE id = $1', [itemId]);
        }
    },

    getStockLevel: async (itemId) => {
        const res = await query('SELECT stock_quantity FROM menu_items WHERE id = $1', [itemId]);
        return res.rows[0] || null;
    },

    getLowStockItems: async () => {
        const res = await query(`
            SELECT m.*, c.name as category_name
            FROM menu_items m
            LEFT JOIN categories c ON m.category_id = c.id
            WHERE m.stock_quantity <= m.low_stock_threshold AND m.is_available = 1
            ORDER BY m.stock_quantity ASC
        `);
        return res.rows;
    },

    getTransactionHistory: async (itemId, limit = 50) => {
        const res = await query(`
            SELECT it.*, u.username as created_by_name
            FROM inventory_transactions it
            LEFT JOIN users u ON it.created_by = u.id
            WHERE it.menu_item_id = $1
            ORDER BY it.created_at DESC
            LIMIT $2
        `, [itemId, limit]);
        return res.rows;
    },

    setLowStockThreshold: async (itemId, threshold) => {
        await query('UPDATE menu_items SET low_stock_threshold = $1 WHERE id = $2', [threshold, itemId]);
    }
};

// Old settingsOps, now replaced by settingOps
/*
const settingsOps = {
    get: async (key) => {
        const res = await query('SELECT value FROM settings WHERE key = $1', [key]);
        return res.rows[0] ? res.rows[0].value : null;
    },
    set: async (key, value) => {
        await query('INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP', [key, value]);
    }
};
*/

module.exports = {
  initDatabase,
  query,
  user: userOps,
  category: categoryOps,
  menu: menuOps,
  order: orderOps,
  kot: kotOps,
  customerOps,
  settingOps,
  backupOps,
  inventory: inventoryOps,
  roles: {
    getAll: async () => {
        const res = await query('SELECT * FROM roles ORDER BY name');
        return res.rows;
    },
    create: async (name, description, permissions) => {
        const res = await query('INSERT INTO roles (name, description, permissions) VALUES ($1, $2, $3) RETURNING id', [name, description, JSON.stringify(permissions)]);
        return res.rows[0].id;
    },
    update: async (id, name, description, permissions) => {
        await query('UPDATE roles SET name = $1, description = $2, permissions = $3 WHERE id = $4', [name, description, JSON.stringify(permissions), id]);
    }
  },
  translations: {
    getAll: async (code) => {
        const res = await query('SELECT key, value FROM translations WHERE code = $1', [code]);
        return res.rows;
    },
    set: async (code, key, value, context) => {
        await query(`
            INSERT INTO translations (code, key, value, context, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (code, key)
            DO UPDATE SET value = $3, updated_at = CURRENT_TIMESTAMP
        `, [code, key, value, context]);
    }
  },
  tax: {
    getActive: async (location = null) => {
        let queryStr = 'SELECT * FROM tax_settings WHERE is_active = 1';
        let params = [];

        if (location) {
            queryStr += ' AND (location = $1 OR location = \'default\')';
            params.push(location);
        }

        const res = await query(queryStr, params);
        return res.rows;
    },
    getAll: async () => {
        const res = await query('SELECT * FROM tax_settings ORDER BY id');
        return res.rows;
    },
    create: async (data) => {
        const res = await query(`
            INSERT INTO tax_settings (name, rate, type, location, apply_to_all, specific_categories, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [data.name, data.rate, data.type, data.location || 'default', data.applyToAll, JSON.stringify(data.specificCategories), data.isActive ? 1 : 0]);
        return res.rows[0].id;
    },
    update: async (id, data) => {
        await query(`
            UPDATE tax_settings
            SET name = $1, rate = $2, type = $3, location = $4, apply_to_all = $5, specific_categories = $6, is_active = $7
            WHERE id = $8
        `, [data.name, data.rate, data.type, data.location || 'default', data.applyToAll, JSON.stringify(data.specificCategories), data.isActive ? 1 : 0, id]);
    }
  }
};
