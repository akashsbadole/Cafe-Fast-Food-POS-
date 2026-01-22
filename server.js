const express = require('express');
const path = require('path');
const cors = require('cors');
// const database = require('./js/database.js'); // Old sql.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // Import JWT
const { Parser } = require('json2csv');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });
require('dotenv').config();

// Import security middleware
const security = require('./js/security-middleware');
const logger = require('./js/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || security.SECURITY_CONFIG.jwtSecret;

// Middleware
app.use(cors());

// Apply security middleware in order
app.use(security.logActivity);
app.use(security.addSecurityHeaders);
app.use(security.helmet);
app.use(security.generalLimiter);
app.use(security.sanitizeInput);
app.use(security.preventSQLInjection);
app.use(security.preventXSS);
app.use(security.requestSizeLimiter('10mb'));

// Serve static files from the app directory
app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// RBAC Middleware with CASL
const { defineAbilityFor } = require('./js/abilities');

const checkPermission = (action, subject) => {
  return async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ error: 'Forbidden: Invalid token' });

      const ability = defineAbilityFor(user);

      // Check if user expects a specific permission string (Legacy support)
      // If 'action' is a string like 'manage_settings', we can map it or just check generic
      // But here we are moving to (action, subject) style usage.
      // However, existing routes use checkPermission('manage_settings'). 
      // We need to support that temporarily or update all routes.
      // Let's support both: if subject is undefined, assume action is a permission string check (Legacy)

      if (!subject) {
        // Legacy check: check if user has this permission in their list (or is admin)
        if (ability.can('manage', 'all') || (user.permissions && user.permissions.includes(action))) {
          req.user = user;
          req.ability = ability;
          return next();
        } else {
          return res.status(403).json({ error: `Forbidden: Missing permission ${action}` });
        }
      }

      if (ability.can(action, subject)) {
        req.user = user;
        req.ability = ability;
        next();
      } else {
        res.status(403).json({ error: `Forbidden: Cannot ${action} ${subject}` });
      }
    });
  };
};

let db = null; // Will be initialized asynchronously

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    const dbModule = require('./js/database.js');
    await dbModule.initDatabase();
    db = dbModule;

    console.log('Database initialized successfully');

    // Add MVP endpoints
    const mvpEndpoints = require('./js/mvp-endpoints.js');
    mvpEndpoints.addUserManagementEndpoints(app, db, checkPermission);
    mvpEndpoints.addRoleManagementEndpoints(app, db, checkPermission);
    mvpEndpoints.addCustomerManagementEndpoints(app, db, checkPermission);
    mvpEndpoints.addInventoryManagementEndpoints(app, db, checkPermission);
    mvpEndpoints.addReportingEndpoints(app, db, checkPermission);
    mvpEndpoints.addBackupEndpoints(app, db, checkPermission);

    // Add new enterprise endpoints
    mvpEndpoints.addTokenQueueEndpoints(app, db, checkPermission);
    mvpEndpoints.addSupplierEndpoints(app, db, checkPermission);
    mvpEndpoints.addPurchaseOrderEndpoints(app, db, checkPermission);
    mvpEndpoints.addReorderLevelEndpoints(app, db, checkPermission);
    mvpEndpoints.addInventoryAlertEndpoints(app, db, checkPermission);
    mvpEndpoints.addInventoryTransferEndpoints(app, db, checkPermission);
    mvpEndpoints.addOrderHoldEndpoints(app, db, checkPermission);
    mvpEndpoints.addInventoryReportEndpoints(app, db, checkPermission);

    console.log('All endpoints added successfully');

  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

// ================== SETTINGS ==================

app.get('/api/settings', checkPermission('manage_settings'), async (req, res) => {
  try {
    const settings = await db.settingOps.getAll();
    res.json(settings);
  } catch (error) {
    logger.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.put('/api/settings', checkPermission('manage_settings'), async (req, res) => {
  try {
    const settings = req.body;
    await db.settingOps.updateMultiple(settings);
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    logger.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ================== BACKUP & RESTORE ==================

app.get('/api/backup', checkPermission('manage_settings'), async (req, res) => {
  try {
    const dump = await db.backup.getDatabaseDump();
    const filename = `backup-${new Date().toISOString().split('T')[0]}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: 'Backup failed' });
  }
});

app.post('/api/restore', checkPermission('manage_settings'), upload.single('backup_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No backup file provided' });
    }

    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const dumpData = JSON.parse(fileContent);

    // Basic validation
    if (!dumpData.version || !dumpData.data) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Invalid backup file format' });
    }

    await db.backup.restoreDatabase(dumpData);

    // Clean up
    fs.unlinkSync(filePath);

    res.json({ success: true, message: 'Database restored successfully' });
  } catch (error) {
    logger.error('Restore error:', error);
    res.status(500).json({ error: 'Restore failed: ' + error.message });
    // Try to clean up
    if (req.file && req.file.path) fs.unlinkSync(req.file.path);
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled Exception:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server is handled at the bottom via startServer()


// Auth: Verify PIN
app.post('/api/auth/verify-pin', async (req, res) => {
  if (!db) {
    logger.error('Database not initialized');
    return res.status(500).json({ error: 'Database not ready' });
  }
  try {
    const { pin } = req.body;

    // Use the built-in getByPin method which handles bcrypt comparison
    const matchedUser = await db.user.getByPin(pin);

    if (matchedUser) {
      await db.user.updateLastLogin(matchedUser.id);
      const permissions = await db.user.getPermissions(matchedUser.id);

      const token = jwt.sign(
        { id: matchedUser.id, username: matchedUser.username, role: matchedUser.role, role_id: matchedUser.role_id, permissions },
        JWT_SECRET,
        { expiresIn: '12h' }
      );

      return res.json({
        success: true,
        user: { id: matchedUser.id, username: matchedUser.username, role: matchedUser.role, permissions },
        token: token
      });
    }

    res.status(401).json({ error: 'Invalid PIN' });
  } catch (err) {
    logger.error('PIN verification error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ================== CATEGORIES ROUTES ==================

// GET all categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.category.getAll();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET category by ID
app.get('/api/categories/:id', async (req, res) => {
  try {
    const category = await db.category.getById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// POST new category
app.post('/api/categories', async (req, res) => {
  try {
    const { name, icon, display_order } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const id = await db.category.create(name, icon || '☕', display_order || 0);
    const category = await db.category.getById(id);

    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    if (error.message && error.message.includes('unique constraint')) {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT update category
app.put('/api/categories/:id', async (req, res) => {
  try {
    const { name, icon, display_order } = req.body;

    await db.category.update(req.params.id, name, icon, display_order);
    const category = await db.category.getById(req.params.id);

    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE category
app.delete('/api/categories/:id', async (req, res) => {
  try {
    await db.category.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// ================== MENU ITEMS ROUTES ==================

// GET all menu items
app.get('/api/menu-items', async (req, res) => {
  try {
    const { category, search } = req.query;

    let items;
    if (search) {
      items = await db.menu.search(search);
    } else if (category) {
      items = await db.menu.getByCategory(category);
    } else {
      items = await db.menu.getAll();
    }

    res.json(items);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// GET menu item by ID
app.get('/api/menu-items/:id', async (req, res) => {
  try {
    const item = await db.menu.getById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Error fetching menu item:', error);
    res.status(500).json({ error: 'Failed to fetch menu item' });
  }
});

// POST new menu item
app.post('/api/menu-items', checkPermission('manage_settings'), async (req, res) => {
  try {
    const { category_id, name, price, description, stock_quantity } = req.body;

    if (!category_id || !name || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = await db.menu.create(category_id, name, price, description, stock_quantity || 0);

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update menu item
app.put('/api/menu-items/:id', checkPermission('manage_settings'), async (req, res) => {
  try {
    const { category_id, name, price, description, is_available, stock_quantity } = req.body;

    await db.menu.update(req.params.id, category_id, name, price, description, is_available, stock_quantity || 0);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT toggle menu item availability
app.put('/api/menu-items/:id/toggle', async (req, res) => {
  try {
    await db.menu.toggleAvailability(req.params.id);
    const item = await db.menu.getById(req.params.id);
    res.json(item);
  } catch (error) {
    console.error('Error toggling availability:', error);
    res.status(500).json({ error: 'Failed to toggle availability' });
  }
});

// DELETE menu item
app.delete('/api/menu-items/:id', async (req, res) => {
  try {
    await db.menu.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// ================== ORDERS ROUTES ==================

// GET all orders
app.get('/api/orders', async (req, res) => {
  try {
    const { filter, search } = req.query;

    let orders;
    if (search) {
      orders = await db.order.searchByNumber(search);
    } else if (filter === 'today') {
      orders = await db.order.getTodayOrders();
    } else {
      orders = await db.order.getAllOrders();
    }

    // Enrich orders with items
    const enrichedOrders = await Promise.all(orders.map(async order => {
      const orderWithItems = await db.order.getWithItems(order.id);
      return orderWithItems;
    }));

    res.json(enrichedOrders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET order by ID
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await db.order.getWithItems(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST new order
app.post('/api/orders', async (req, res) => {
  try {
    const { items, subtotal, discountAmount, discountType, taxAmount, totalAmount, paymentMode, paymentStatus, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must have at least one item' });
    }

    const orderNumber = await db.order.generateOrderNumber();

    const orderId = await db.order.create({
      orderNumber,
      subtotal,
      discountAmount,
      discountType,
      taxAmount,
      totalAmount,
      paymentMode,
      paymentStatus,
      notes,
      status: paymentStatus === 'paid' ? 'completed' : 'pending'
    });

    // Add order items
    for (const item of items) {
      await db.order.addItem(orderId, {
        menuItemId: item.id,
        quantity: item.quantity,
        unitPrice: item.price,
        totalPrice: item.total,
        notes: item.notes || ''
      });
    }

    const order = await db.order.getWithItems(orderId);
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// ================== SEED DATA ROUTES ==================

// POST seed sample data
app.post('/api/seed', async (req, res) => {
  try {
    res.json({ success: true, message: 'Seed logic not fully implemented for web version yet' });
  } catch (error) {
    console.error('Error seeding data:', error);
    res.status(500).json({ error: 'Failed to seed sample data' });
  }
});

// GET users profile
app.get('/api/users/profile', async (req, res) => {
  try {
    const user = await db.user.getByUsername('admin');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ id: user.id, username: user.username, role: user.role, last_login: user.last_login });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// PUT update user PIN/password
app.put('/api/users/profile', async (req, res) => {
  try {
    const { currentPin, newPin, newPassword } = req.body;
    const user = await db.user.getByUsername('admin');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current PIN
    if (currentPin && !bcrypt.compareSync(currentPin, user.pin_hash)) {
      return res.status(400).json({ error: 'Current PIN is incorrect' });
    }

    // Update PIN if provided
    if (newPin) {
      const pinHash = bcrypt.hashSync(newPin, 10);
      await db.settings.set('user_pin_hash', pinHash);
    }

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// PUT update order status
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await db.order.updateStatus(req.params.id, status);
    const order = await db.order.getById(req.params.id);
    res.json(order);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// PUT update order payment
app.put('/api/orders/:id/payment', async (req, res) => {
  try {
    const { paymentMode, paymentStatus } = req.body;
    await db.order.updatePayment(req.params.id, paymentMode, paymentStatus);
    const order = await db.order.getById(req.params.id);
    res.json(order);
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// ================== KOT ROUTES ==================

// GET all KOT tickets
app.get('/api/kot', async (req, res) => {
  try {
    const tickets = await db.kot.getAll();
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching KOT tickets:', error);
    res.status(500).json({ error: 'Failed to fetch KOT tickets' });
  }
});

// GET KOT tickets by order ID
app.get('/api/kot/order/:orderId', async (req, res) => {
  try {
    const tickets = await db.kot.getByOrderId(req.params.orderId);
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching KOT tickets:', error);
    res.status(500).json({ error: 'Failed to fetch KOT tickets' });
  }
});

// POST create KOT ticket (also creates order)
app.post('/api/kot', async (req, res) => {
  try {
    const { items, subtotal, discountAmount, discountType, taxAmount, totalAmount, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'KOT must have at least one item' });
    }

    // Create order first
    const orderNumber = await db.order.generateOrderNumber();

    const orderId = await db.order.create({
      orderNumber,
      subtotal,
      discountAmount,
      discountType,
      taxAmount,
      totalAmount,
      totalAmount,
      paymentMode: 'pending',
      paymentStatus: 'unpaid',
      notes,
      status: 'pending'
    });

    // Add order items
    for (const item of items) {
      await db.order.addItem(orderId, {
        menuItemId: item.id,
        quantity: item.quantity,
        unitPrice: item.price,
        totalPrice: item.total,
        notes: item.notes || ''
      });
    }

    // Create KOT ticket
    const ticket = await db.kot.create(orderId, notes);

    res.status(201).json({
      orderNumber,
      ticketNumber: ticket.ticketNumber,
      orderId,
      ticketId: ticket.id
    });
  } catch (error) {
    console.error('Error creating KOT:', error);
    res.status(500).json({ error: 'Failed to create KOT' });
  }
});

// PUT update KOT status
app.put('/api/kot/:id', async (req, res) => {
  try {
    const { status } = req.body;
    await db.kot.updateStatus(req.params.id, status);
    const tickets = await db.kot.getAll();
    const ticket = tickets.find(t => t.id == req.params.id);
    res.json(ticket);
  } catch (error) {
    console.error('Error updating KOT status:', error);
    res.status(500).json({ error: 'Failed to update KOT status' });
  }
});

// ================== TAX ROUTES ==================

// GET tax settings
app.get('/api/tax', async (req, res) => {
  try {
    const { location } = req.query;
    const taxes = await db.tax.getActive(location); // Pass location if provided
    res.json(taxes);
  } catch (error) {
    console.error('Error fetching tax settings:', error);
    res.status(500).json({ error: 'Failed to fetch tax settings' });
  }
});

// POST create tax
app.post('/api/tax', checkPermission('manage_settings'), async (req, res) => {
  try {
    const id = await db.tax.create(req.body);
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    console.error('Error creating tax:', error);
    res.status(500).json({ error: 'Failed to create tax' });
  }
});

// ================== REPORTING ROUTES ==================

// GET sales report
app.get('/api/reports/sales', checkPermission('manage_settings'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const report = await db.order.getSalesReport(start_date, end_date);
    res.json(report);
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).json({ error: 'Failed to fetch sales report' });
  }
});

// GET top selling items
app.get('/api/reports/top-items', checkPermission('manage_settings'), async (req, res) => {
  try {
    const { start_date, end_date, limit } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const items = await db.order.getTopSellingItems(start_date, end_date, limit || 5);
    res.json(items);
  } catch (error) {
    console.error('Error fetching top items:', error);
    res.status(500).json({ error: 'Failed to fetch top items' });
  }
});

// ================== CUSTOMER ROUTES ==================

app.get('/api/customers/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const customers = await db.customer.search(q);
    res.json(customers);
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    try {
      const customer = await db.customer.create(name, phone);
      res.json(customer);
    } catch (err) {
      if (err.code === '23505') { // Unique violation
        return res.status(409).json({ error: 'Customer with this phone already exists' });
      }
      throw err;
    }
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// ================== ROLES & PERMISSIONS ==================

app.get('/api/roles', checkPermission('manage_settings'), async (req, res) => {
  try {
    const roles = await db.roles.getAll();
    res.json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

app.post('/api/roles', checkPermission('manage_settings'), async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const id = await db.roles.create(name, description, permissions);
    res.status(201).json({ id, name, description, permissions });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// ================== USER MANAGEMENT ROUTES ==================

// GET all users
app.get('/api/users', checkPermission('manage_settings'), async (req, res) => {
  try {
    const users = await db.user.getAll();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST create user
app.post('/api/users', checkPermission('manage_settings'), async (req, res) => {
  try {
    const { username, pin, role_id, full_name } = req.body;

    if (!username || !pin || !role_id) {
      return res.status(400).json({ error: 'Username, PIN, and Role are required' });
    }

    // Check if username exists
    const existing = await db.user.getByUsername(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if PIN exists (to avoid conflicts in pin-only login)
    const pinHash = bcrypt.hashSync(pin, 10);
    // Since we can't check hash easily against all, we might rely on the client or
    // iterate. Let's iterate here to be safe, or assume probability of collision low?
    // No, we must ensure unique PINs for the login logic: "Iterate all users and check bcrypt".
    // Wait, we can't easily check "Does this NEW pin match any EXISTING hash" without iterating all.
    // Yes, we must iteratively check.

    // Optimization: In real app, store a deterministic hash (SHA256) of PIN for uniqueness check, 
    // and Bcrypt for auth. For now, iterate.
    const allUsersResult = await db.query('SELECT pin_hash FROM users WHERE is_active = 1');
    const hasConflict = allUsersResult.rows.some(u => bcrypt.compareSync(pin, u.pin_hash));

    if (hasConflict) {
      // Technically bcrypt salt makes hash different, so 'compareSync(pin, oldHash)' checks if PIN is same.
      return res.status(400).json({ error: 'PIN is already in use by another user' });
    }

    const id = await db.user.create({
      username,
      pin_hash: pinHash,
      password_hash: bcrypt.hashSync('default123', 10), // temporary default
      role_id,
      full_name
    });

    res.status(201).json({ success: true, id });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT update user
app.put('/api/users/:id', checkPermission('manage_settings'), async (req, res) => {
  try {
    const { username, pin, role_id, full_name } = req.body;
    const userId = req.params.id;

    let updates = { username, role_id, full_name };

    if (pin) {
      // Check conflict
      const allUsersResult = await db.query('SELECT id, pin_hash FROM users WHERE is_active = 1 AND id != $1', [userId]);
      const hasConflict = allUsersResult.rows.some(u => bcrypt.compareSync(pin, u.pin_hash));
      if (hasConflict) {
        return res.status(400).json({ error: 'PIN is already in use by another user' });
      }
      updates.pin_hash = bcrypt.hashSync(pin, 10);
    }

    await db.user.update(userId, updates);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE user
app.delete('/api/users/:id', checkPermission('manage_settings'), async (req, res) => {
  try {
    // Prevent deleting self?
    if (req.user && req.user.id == req.params.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    await db.user.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ================== TRANSLATIONS ==================

app.get('/api/translations/:lang', async (req, res) => {
  try {
    const translations = await db.translations.getAll(req.params.lang);
    // Convert array to object {key: value}
    const result = translations.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(result);
  } catch (error) {
    console.error('Error fetching translations:', error);
    res.status(500).json({ error: 'Failed to fetch translations' });
  }
});

app.post('/api/translations', checkPermission('manage_settings'), async (req, res) => {
  try {
    const { code, key, value, context } = req.body;
    await db.translations.set(code, key, value, context);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving translation:', error);
    res.status(500).json({ error: 'Failed to save translation' });
  }
});
// ================== DATA MANAGEMENT (IMPORT/EXPORT) ==================

// EXPORT Menu Items
app.get('/api/export/menu-items', checkPermission('manage_settings'), async (req, res) => {
  try {
    const items = await db.menu.getAll();
    const fields = ['id', 'category_id', 'category_name', 'name', 'price', 'description', 'is_available'];
    const json2csvParser = new Parser({ fields });
    const csvData = json2csvParser.parse(items);

    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', 'attachment; filename=menu-items.csv');
    res.send(csvData);
  } catch (error) {
    console.error('Export menu items error:', error);
    res.status(500).send('Failed to export data');
  }
});

// EXPORT Users
app.get('/api/export/users', checkPermission('manage_settings'), async (req, res) => {
  try {
    const users = await db.user.getAll(); // Ensure getAll exists or use custom query
    // Sanitize: Exclude password hashes
    const sanitizedUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      last_login: u.last_login
    }));

    const fields = ['id', 'username', 'role', 'last_login'];
    const json2csvParser = new Parser({ fields });
    const csvData = json2csvParser.parse(sanitizedUsers);

    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', 'attachment; filename=users.csv');
    res.send(csvData);
  } catch (error) {
    console.error('Export users error:', error);
    res.status(500).send('Failed to export data');
  }
});

// EXPORT Orders (Reports)
app.get('/api/export/orders', checkPermission('manage_settings'), async (req, res) => {
  try {
    const orders = await db.order.getAllOrders();
    // basic order details
    const fields = ['id', 'order_number', 'subtotal', 'discount_amount', 'tax_amount', 'total_amount', 'payment_mode', 'status', 'created_at', 'notes'];
    const json2csvParser = new Parser({ fields });
    const csvData = json2csvParser.parse(orders);

    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', 'attachment; filename=orders-report.csv');
    res.send(csvData);
  } catch (error) {
    console.error('Export orders error:', error);
    res.status(500).send('Failed to export data');
  }
});

// IMPORT Menu Items
app.post('/api/import/menu-items', checkPermission('manage_settings'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        let successCount = 0;
        let errorCount = 0;

        for (const item of results) {
          // Validation: Check name, price, category_id
          if (item.name && item.price && item.category_id) {
            try {
              // Determine if we update or create. For simplicity, we create new or update if ID exists
              if (item.id) {
                await db.menu.update(item.id, item.category_id, item.name, item.price, item.description || '', item.is_available === 'true');
              } else {
                await db.menu.create(item.category_id, item.name, item.price, item.description || '');
              }
              successCount++;
            } catch (e) {
              console.error('Import row error', e);
              errorCount++;
            }
          } else {
            errorCount++;
          }
        }

        // Clean up file
        fs.unlinkSync(req.file.path);

        res.json({ success: true, message: `Imported ${successCount} items. Failed: ${errorCount}` });
      } catch (error) {
        console.error('Import processing error:', error);
        res.status(500).json({ error: 'Failed to process import' });
      }
    });
});


// ================== START SERVER ==================

let server = null;

async function startServer() {
  // Initialize database first
  try {
    // Try PostgreSQL first, fallback to SQLite
    let database;
    try {
      database = require('./js/database-postgres.js');
      await database.initDatabase();
      console.log('PostgreSQL database initialized successfully');
    } catch (pgError) {
      console.log('PostgreSQL not available, using SQLite:', pgError.message);
      database = require('./js/database.js');
      await database.initDatabase();
      console.log('SQLite database initialized successfully');
    }

    db = database;

    // Add MVP endpoints
    const mvpEndpoints = require('./js/mvp-endpoints.js');
    mvpEndpoints.addUserManagementEndpoints(app, db, checkPermission);
    mvpEndpoints.addRoleManagementEndpoints(app, db, checkPermission);
    mvpEndpoints.addCustomerManagementEndpoints(app, db, checkPermission);
    mvpEndpoints.addInventoryManagementEndpoints(app, db, checkPermission);
    mvpEndpoints.addReportingEndpoints(app, db, checkPermission);
    mvpEndpoints.addBackupEndpoints(app, db, checkPermission);

    // Add enterprise endpoints
    const enterpriseEndpoints = require('./js/enterprise-endpoints.js');
    app.use(enterpriseEndpoints);

    // Add modifier endpoints
    const modifierEndpoints = require('./js/modifier-endpoints.js');
    app.use(modifierEndpoints);

    // Add combo endpoints
    const comboEndpoints = require('./js/combo-endpoints.js');
    app.use(comboEndpoints);

    // Add weight endpoints
    const weightEndpoints = require('./js/weight-endpoints.js');
    app.use(weightEndpoints);

    // Add split bill endpoints
    const splitBillEndpoints = require('./js/split-bill-endpoints.js');
    app.use(splitBillEndpoints);

    // Add void/refund endpoints
    const voidRefundEndpoints = require('./js/void-refund-endpoints.js');
    app.use(voidRefundEndpoints);

    // Add KDS endpoints
    const kdsEndpoints = require('./js/kds-endpoints.js');
    app.use(kdsEndpoints);

    // Add hardware endpoints
    const hardwareEndpoints = require('./js/hardware-endpoints.js');
    app.use(hardwareEndpoints);

    // Add digital receipt endpoints
    const digitalReceiptEndpoints = require('./js/digital-receipt-endpoints.js');
    app.use(digitalReceiptEndpoints);

    // Add loyalty endpoints
    const loyaltyEndpoints = require('./js/loyalty-endpoints.js');
    app.use(loyaltyEndpoints);

    // Add online order endpoints
    const onlineOrderEndpoints = require('./js/online-order-endpoints.js');
    app.use(onlineOrderEndpoints);

    // Add recipe endpoints
    const recipeEndpoints = require('./js/recipe-endpoints.js');
    app.use(recipeEndpoints);

    // Add cash drawer endpoints
    const cashDrawerEndpoints = require('./js/cash-drawer-endpoints.js');
    app.use(cashDrawerEndpoints);

    // Add buzzer endpoints
    const buzzerEndpoints = require('./js/buzzer-endpoints.js');
    app.use(buzzerEndpoints);

    // Add table endpoints
    const tableEndpoints = require('./js/table-endpoints.js');
    app.use(tableEndpoints);

    // Add offline/sync endpoints
    const offlineEndpoints = require('./js/offline-endpoints.js');
    app.use(offlineEndpoints);

    console.log('All endpoints added successfully');

  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Cafe POS API Server running on http://127.0.0.1:${PORT}`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please close any existing servers.`);
      }
      reject(err);
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('Cafe POS API Server stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Export for use in Electron
module.exports = { app, startServer, stopServer };

// Start server if run directly
if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
