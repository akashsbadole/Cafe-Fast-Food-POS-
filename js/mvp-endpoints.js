// MVP Endpoints for Cafe POS System
// This file contains the additional endpoints needed for MVP features

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Parser } = require('json2csv');

// User Management Endpoints
function addUserManagementEndpoints(app, db, checkPermission) {

    // GET all users
    app.get('/api/users', checkPermission('manage_users'), async (req, res) => {
        try {
            const users = await db.user.getAll();
            res.json(users);
        } catch (error) {
            console.error('Error fetching users:', error);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    });

    // GET user by ID
    app.get('/api/users/:id', checkPermission('manage_users'), async (req, res) => {
        try {
            const user = await db.user.getById(req.params.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json(user);
        } catch (error) {
            console.error('Error fetching user:', error);
            res.status(500).json({ error: 'Failed to fetch user' });
        }
    });

    // POST create user
    app.post('/api/users', checkPermission('manage_users'), async (req, res) => {
        try {
            const { username, pin, password, role_id, full_name, permissions } = req.body;

            if (!username || !pin || !role_id) {
                return res.status(400).json({ error: 'Username, PIN, and Role are required' });
            }

            // Check if username exists
            const existing = await db.user.getByUsername(username);
            if (existing) {
                return res.status(400).json({ error: 'Username already exists' });
            }

            // Check if PIN is already in use
            const pinUser = await db.user.getByPin(pin);
            if (pinUser) {
                return res.status(400).json({ error: 'PIN is already in use by another user' });
            }

            const userData = {
                username,
                pin_hash: bcrypt.hashSync(pin, 10),
                password_hash: bcrypt.hashSync(password || 'default123', 10),
                role_id,
                full_name,
                permissions: permissions || []
            };

            const id = await db.user.create(userData);
            res.status(201).json({ success: true, id });

        } catch (error) {
            console.error('Error creating user:', error);
            res.status(500).json({ error: 'Failed to create user' });
        }
    });

    // PUT update user
    app.put('/api/users/:id', checkPermission('manage_users'), async (req, res) => {
        try {
            const { username, pin, password, role_id, full_name, permissions } = req.body;
            const userId = req.params.id;

            let updates = { username, role_id, full_name, permissions };

            if (pin) {
                // Check if PIN is already in use by another user
                const pinUser = await db.user.getByPin(pin);
                if (pinUser && pinUser.id != userId) {
                    return res.status(400).json({ error: 'PIN is already in use by another user' });
                }
                updates.pin_hash = bcrypt.hashSync(pin, 10);
            }

            if (password) {
                updates.password_hash = bcrypt.hashSync(password, 10);
            }

            await db.user.update(userId, updates);
            res.json({ success: true });
        } catch (error) {
            console.error('Error updating user:', error);
            res.status(500).json({ error: 'Failed to update user' });
        }
    });

    // DELETE user (soft delete)
    app.delete('/api/users/:id', checkPermission('manage_users'), async (req, res) => {
        try {
            const userId = req.params.id;

            // Don't allow deleting the last admin user
            const adminUsers = await db.user.getAll().filter(u => u.role === 'admin');
            const userToDelete = await db.user.getById(userId);

            if (userToDelete.role === 'admin' && adminUsers.length <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last admin user' });
            }

            await db.user.delete(userId);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    });
}

// Role Management Endpoints
function addRoleManagementEndpoints(app, db, checkPermission) {

    // GET all roles
    app.get('/api/roles', checkPermission('manage_users'), async (req, res) => {
        try {
            const roles = await db.role.getAll();
            res.json(roles);
        } catch (error) {
            console.error('Error fetching roles:', error);
            res.status(500).json({ error: 'Failed to fetch roles' });
        }
    });

    // POST create role
    app.post('/api/roles', checkPermission('manage_users'), async (req, res) => {
        try {
            const { name, description, permissions } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Role name is required' });
            }

            const id = await db.role.create(name, description, permissions);
            res.status(201).json({ success: true, id });
        } catch (error) {
            console.error('Error creating role:', error);
            res.status(500).json({ error: 'Failed to create role' });
        }
    });

    // PUT update role
    app.put('/api/roles/:id', checkPermission('manage_users'), async (req, res) => {
        try {
            const { name, description, permissions } = req.body;
            await db.role.update(req.params.id, name, description, permissions);
            res.json({ success: true });
        } catch (error) {
            console.error('Error updating role:', error);
            res.status(500).json({ error: 'Failed to update role' });
        }
    });

    // DELETE role
    app.delete('/api/roles/:id', checkPermission('manage_users'), async (req, res) => {
        try {
            await db.role.delete(req.params.id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting role:', error);
            res.status(500).json({ error: 'Failed to delete role' });
        }
    });
}

// Customer Management Endpoints
function addCustomerManagementEndpoints(app, db, checkPermission) {

    // GET search customers
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

    // GET all customers
    app.get('/api/customers', checkPermission('view_customers'), async (req, res) => {
        try {
            const customers = await db.customer.getAll();
            res.json(customers);
        } catch (error) {
            console.error('Error fetching customers:', error);
            res.status(500).json({ error: 'Failed to fetch customers' });
        }
    });

    // GET customer by ID
    app.get('/api/customers/:id', async (req, res) => {
        try {
            const customer = await db.customer.getById(req.params.id);
            if (!customer) {
                return res.status(404).json({ error: 'Customer not found' });
            }
            res.json(customer);
        } catch (error) {
            console.error('Error fetching customer:', error);
            res.status(500).json({ error: 'Failed to fetch customer' });
        }
    });

    // GET customer order history
    app.get('/api/customers/:id/orders', async (req, res) => {
        try {
            const orders = await db.customer.getOrderHistory(req.params.id);
            res.json(orders);
        } catch (error) {
            console.error('Error fetching customer orders:', error);
            res.status(500).json({ error: 'Failed to fetch customer orders' });
        }
    });

    // POST create customer
    app.post('/api/customers', async (req, res) => {
        try {
            const { name, phone, email } = req.body;

            if (!phone) {
                return res.status(400).json({ error: 'Phone number is required' });
            }

            // Check if customer already exists
            const existing = await db.customer.getByPhone(phone);
            if (existing) {
                return res.status(409).json({ error: 'Customer with this phone already exists', customer: existing });
            }

            const id = await db.customer.create(name, phone, email);
            const customer = await db.customer.getById(id);
            res.status(201).json(customer);
        } catch (error) {
            console.error('Error creating customer:', error);
            res.status(500).json({ error: 'Failed to create customer' });
        }
    });

    // PUT update customer
    app.put('/api/customers/:id', async (req, res) => {
        try {
            const { name, phone, email, notes } = req.body;
            await db.customer.update(req.params.id, { name, phone, email, notes });
            res.json({ success: true });
        } catch (error) {
            console.error('Error updating customer:', error);
            res.status(500).json({ error: 'Failed to update customer' });
        }
    });
}

// Inventory Management Endpoints
function addInventoryManagementEndpoints(app, db, checkPermission) {

    // PUT adjust stock
    app.put('/api/inventory/:itemId', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const { quantity, reason } = req.body;
            const itemId = req.params.itemId;
            const userId = req.user.id;

            if (quantity === undefined) {
                return res.status(400).json({ error: 'Quantity is required' });
            }

            await db.inventory.updateStock(itemId, quantity, reason, userId);

            const stockLevel = await db.inventory.getStockLevel(itemId);
            res.json({ success: true, new_stock: stockLevel.stock_quantity });
        } catch (error) {
            console.error('Error updating stock:', error);
            res.status(500).json({ error: 'Failed to update stock' });
        }
    });

    // GET low stock items
    app.get('/api/inventory/low-stock', checkPermission('view_inventory'), async (req, res) => {
        try {
            const items = await db.inventory.getLowStockItems();
            res.json(items);
        } catch (error) {
            console.error('Error fetching low stock items:', error);
            res.status(500).json({ error: 'Failed to fetch low stock items' });
        }
    });

    // GET inventory transaction history
    app.get('/api/inventory/history/:itemId', checkPermission('view_inventory'), async (req, res) => {
        try {
            const history = await db.inventory.getTransactionHistory(req.params.itemId);
            res.json(history);
        } catch (error) {
            console.error('Error fetching inventory history:', error);
            res.status(500).json({ error: 'Failed to fetch inventory history' });
        }
    });

    // PUT set low stock threshold
    app.put('/api/inventory/:itemId/threshold', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const { threshold } = req.body;
            await db.inventory.setLowStockThreshold(req.params.itemId, threshold);
            res.json({ success: true });
        } catch (error) {
            console.error('Error setting threshold:', error);
            res.status(500).json({ error: 'Failed to set threshold' });
        }
    });
}

// Reporting Endpoints
function addReportingEndpoints(app, db, checkPermission) {

    // GET sales report
    app.get('/api/reports/sales', checkPermission('view_reports'), async (req, res) => {
        try {
            const { start_date, end_date } = req.query;

            if (!start_date || !end_date) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const report = await db.reports.getSalesReport(start_date, end_date);
            res.json(report);
        } catch (error) {
            console.error('Error fetching sales report:', error);
            res.status(500).json({ error: 'Failed to fetch sales report' });
        }
    });

    // GET daily summary
    app.get('/api/reports/daily-summary', checkPermission('view_reports'), async (req, res) => {
        try {
            const { date } = req.query;
            const reportDate = date || new Date().toISOString().split('T')[0];

            const summary = await db.reports.getDailySummary(reportDate);
            res.json(summary || {
                total_orders: 0,
                total_sales: 0,
                total_tax: 0,
                total_discounts: 0,
                average_order_value: 0
            });
        } catch (error) {
            console.error('Error fetching daily summary:', error);
            res.status(500).json({ error: 'Failed to fetch daily summary' });
        }
    });

    // GET top selling items
    app.get('/api/reports/top-items', checkPermission('view_reports'), async (req, res) => {
        try {
            const { start_date, end_date, limit } = req.query;

            if (!start_date || !end_date) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const items = await db.reports.getTopSellingItems(start_date, end_date, limit || 10);
            res.json(items);
        } catch (error) {
            console.error('Error fetching top items:', error);
            res.status(500).json({ error: 'Failed to fetch top items' });
        }
    });

    // GET tax report
    app.get('/api/reports/tax', checkPermission('view_reports'), async (req, res) => {
        try {
            const { start_date, end_date } = req.query;

            if (!start_date || !end_date) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const report = await db.reports.getTaxReport(start_date, end_date);
            res.json(report);
        } catch (error) {
            console.error('Error fetching tax report:', error);
            res.status(500).json({ error: 'Failed to fetch tax report' });
        }
    });

    // GET payment breakdown
    app.get('/api/reports/payment-breakdown', checkPermission('view_reports'), async (req, res) => {
        try {
            const { start_date, end_date } = req.query;

            if (!start_date || !end_date) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const breakdown = await db.reports.getPaymentBreakdown(start_date, end_date);
            res.json(breakdown);
        } catch (error) {
            console.error('Error fetching payment breakdown:', error);
            res.status(500).json({ error: 'Failed to fetch payment breakdown' });
        }
    });

    // GET export reports as CSV
    app.get('/api/reports/export/:type', checkPermission('view_reports'), async (req, res) => {
        try {
            const { type } = req.params;
            const { start_date, end_date } = req.query;

            if (!start_date || !end_date) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            let data, fields, filename;

            switch (type) {
                case 'sales':
                    data = await db.reports.getSalesReport(start_date, end_date);
                    fields = ['payment_mode', 'total_orders', 'total_sales', 'total_tax', 'total_discounts', 'average_order_value'];
                    filename = `sales-report-${start_date}-to-${end_date}.csv`;
                    break;
                case 'top-items':
                    data = await db.reports.getTopSellingItems(start_date, end_date, 50);
                    fields = ['name', 'price', 'total_quantity', 'total_revenue', 'order_count'];
                    filename = `top-items-${start_date}-to-${end_date}.csv`;
                    break;
                case 'tax':
                    data = await db.reports.getTaxReport(start_date, end_date);
                    fields = ['date', 'taxable_amount', 'tax_collected', 'tax_rate', 'transaction_count'];
                    filename = `tax-report-${start_date}-to-${end_date}.csv`;
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid report type' });
            }

            const json2csvParser = new Parser({ fields });
            const csvData = json2csvParser.parse(data);

            res.header('Content-Type', 'text/csv');
            res.header('Content-Disposition', `attachment; filename=${filename}`);
            res.send(csvData);
        } catch (error) {
            console.error('Export report error:', error);
            res.status(500).send('Failed to export report');
        }
    });
}

// Backup and Data Export Endpoints
function addBackupEndpoints(app, db, checkPermission) {

    // GET database backup
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

    // POST restore database
    app.post('/api/restore', checkPermission('manage_settings'), async (req, res) => {
        try {
            const dumpData = req.body;

            if (!dumpData.version || !dumpData.data) {
                return res.status(400).json({ error: 'Invalid backup file format' });
            }

            await db.backup.restoreDatabase(dumpData);
            res.json({ success: true, message: 'Database restored successfully' });
        } catch (error) {
            console.error('Restore error:', error);
            res.status(500).json({ error: 'Restore failed: ' + error.message });
        }
    });
}

// Token/Queue Management Endpoints
function addTokenQueueEndpoints(app, db, checkPermission) {

    // GET token queue settings
    app.get('/api/token-queue/settings', checkPermission('manage_settings'), async (req, res) => {
        try {
            const settings = await db.tokenQueue.getSettings();
            res.json(settings || {});
        } catch (error) {
            console.error('Error fetching token queue settings:', error);
            res.status(500).json({ error: 'Failed to fetch settings' });
        }
    });

    // PUT update token queue settings
    app.put('/api/token-queue/settings', checkPermission('manage_settings'), async (req, res) => {
        try {
            const settings = req.body;
            await db.tokenQueue.updateSettings(settings);
            res.json({ success: true, message: 'Settings updated successfully' });
        } catch (error) {
            console.error('Error updating token queue settings:', error);
            res.status(500).json({ error: 'Failed to update settings' });
        }
    });

    // POST create new token
    app.post('/api/token-queue/tokens', checkPermission('manage_orders'), async (req, res) => {
        try {
            const { customer_name, customer_phone, notes } = req.body;
            const userId = req.user.id;

            const token = await db.tokenQueue.createToken(customer_name, customer_phone, notes, userId);
            res.status(201).json(token);
        } catch (error) {
            console.error('Error creating token:', error);
            res.status(500).json({ error: 'Failed to create token' });
        }
    });

    // GET all tokens
    app.get('/api/token-queue/tokens', checkPermission('view_orders'), async (req, res) => {
        try {
            const { status } = req.query;
            const tokens = await db.tokenQueue.getAllTokens(status);
            res.json(tokens);
        } catch (error) {
            console.error('Error fetching tokens:', error);
            res.status(500).json({ error: 'Failed to fetch tokens' });
        }
    });

    // GET active queue
    app.get('/api/token-queue/active', checkPermission('view_orders'), async (req, res) => {
        try {
            const queue = await db.tokenQueue.getActiveQueue();
            res.json(queue);
        } catch (error) {
            console.error('Error fetching active queue:', error);
            res.status(500).json({ error: 'Failed to fetch active queue' });
        }
    });

    // GET token by ID
    app.get('/api/token-queue/tokens/:id', checkPermission('view_orders'), async (req, res) => {
        try {
            const token = await db.tokenQueue.getToken(req.params.id);
            if (!token) {
                return res.status(404).json({ error: 'Token not found' });
            }
            res.json(token);
        } catch (error) {
            console.error('Error fetching token:', error);
            res.status(500).json({ error: 'Failed to fetch token' });
        }
    });

    // POST call next token
    app.post('/api/token-queue/call-next', checkPermission('manage_orders'), async (req, res) => {
        try {
            const userId = req.user.id;
            const token = await db.tokenQueue.callNextToken(userId);

            if (!token) {
                return res.json({ success: false, message: 'No tokens to call' });
            }

            res.json({ success: true, token });
        } catch (error) {
            console.error('Error calling next token:', error);
            res.status(500).json({ error: 'Failed to call token' });
        }
    });

    // POST call specific token
    app.post('/api/token-queue/tokens/:id/call', checkPermission('manage_orders'), async (req, res) => {
        try {
            const userId = req.user.id;
            const token = await db.tokenQueue.callToken(req.params.id, userId);
            res.json({ success: true, token });
        } catch (error) {
            console.error('Error calling token:', error);
            res.status(500).json({ error: error.message || 'Failed to call token' });
        }
    });

    // POST serve token
    app.post('/api/token-queue/tokens/:id/serve', checkPermission('manage_orders'), async (req, res) => {
        try {
            const userId = req.user.id;
            const result = await db.tokenQueue.serveToken(req.params.id, userId);
            res.json(result);
        } catch (error) {
            console.error('Error serving token:', error);
            res.status(500).json({ error: error.message || 'Failed to serve token' });
        }
    });

    // POST cancel token
    app.post('/api/token-queue/tokens/:id/cancel', checkPermission('manage_orders'), async (req, res) => {
        try {
            const { reason } = req.body;
            const userId = req.user.id;
            const result = await db.tokenQueue.cancelToken(req.params.id, userId, reason);
            res.json(result);
        } catch (error) {
            console.error('Error cancelling token:', error);
            res.status(500).json({ error: error.message || 'Failed to cancel token' });
        }
    });

    // GET token history
    app.get('/api/token-queue/history', checkPermission('view_reports'), async (req, res) => {
        try {
            const { limit, status } = req.query;
            const history = await db.tokenQueue.getTokenHistory(limit || 50, status);
            res.json(history);
        } catch (error) {
            console.error('Error fetching token history:', error);
            res.status(500).json({ error: 'Failed to fetch token history' });
        }
    });

    // GET token statistics
    app.get('/api/token-queue/stats', checkPermission('view_reports'), async (req, res) => {
        try {
            const stats = await db.tokenQueue.getStatistics();
            res.json(stats);
        } catch (error) {
            console.error('Error fetching token statistics:', error);
            res.status(500).json({ error: 'Failed to fetch statistics' });
        }
    });

    // POST reset queue (admin only)
    app.post('/api/token-queue/reset', checkPermission('manage_settings'), async (req, res) => {
        try {
            const userId = req.user.id;
            const result = await db.tokenQueue.resetQueue(userId);
            res.json(result);
        } catch (error) {
            console.error('Error resetting queue:', error);
            res.status(500).json({ error: 'Failed to reset queue' });
        }
    });
}

// Supplier Management Endpoints
function addSupplierEndpoints(app, db, checkPermission) {

    // GET all suppliers
    app.get('/api/suppliers', checkPermission('view_inventory'), async (req, res) => {
        try {
            const { active } = req.query;
            const suppliers = await db.inventoryManager.getAllSuppliers(active !== 'false');
            res.json(suppliers);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            res.status(500).json({ error: 'Failed to fetch suppliers' });
        }
    });

    // GET supplier by ID
    app.get('/api/suppliers/:id', checkPermission('view_inventory'), async (req, res) => {
        try {
            const supplier = await db.inventoryManager.getSupplier(req.params.id);
            if (!supplier) {
                return res.status(404).json({ error: 'Supplier not found' });
            }
            res.json(supplier);
        } catch (error) {
            console.error('Error fetching supplier:', error);
            res.status(500).json({ error: 'Failed to fetch supplier' });
        }
    });

    // POST create supplier
    app.post('/api/suppliers', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const supplierData = req.body;
            const userId = req.user.id;
            const supplier = await db.inventoryManager.createSupplier(supplierData, userId);
            res.status(201).json(supplier);
        } catch (error) {
            console.error('Error creating supplier:', error);
            res.status(500).json({ error: 'Failed to create supplier' });
        }
    });

    // PUT update supplier
    app.put('/api/suppliers/:id', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const supplierData = req.body;
            const userId = req.user.id;
            const supplier = await db.inventoryManager.updateSupplier(req.params.id, supplierData, userId);
            res.json(supplier);
        } catch (error) {
            console.error('Error updating supplier:', error);
            res.status(500).json({ error: 'Failed to update supplier' });
        }
    });

    // DELETE supplier
    app.delete('/api/suppliers/:id', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const userId = req.user.id;
            const result = await db.inventoryManager.deleteSupplier(req.params.id, userId);
            res.json(result);
        } catch (error) {
            console.error('Error deleting supplier:', error);
            res.status(500).json({ error: 'Failed to delete supplier' });
        }
    });

    // GET search suppliers
    app.get('/api/suppliers/search', async (req, res) => {
        try {
            const { q } = req.query;
            if (!q) return res.json([]);
            const suppliers = await db.inventoryManager.searchSuppliers(q);
            res.json(suppliers);
        } catch (error) {
            console.error('Error searching suppliers:', error);
            res.status(500).json({ error: 'Search failed' });
        }
    });
}

// Purchase Order Endpoints
function addPurchaseOrderEndpoints(app, db, checkPermission) {

    // GET all purchase orders
    app.get('/api/purchase-orders', checkPermission('view_inventory'), async (req, res) => {
        try {
            const { status } = req.query;
            const orders = await db.inventoryManager.getAllPurchaseOrders(status);
            res.json(orders);
        } catch (error) {
            console.error('Error fetching purchase orders:', error);
            res.status(500).json({ error: 'Failed to fetch purchase orders' });
        }
    });

    // GET purchase order by ID
    app.get('/api/purchase-orders/:id', checkPermission('view_inventory'), async (req, res) => {
        try {
            const order = await db.inventoryManager.getPurchaseOrder(req.params.id);
            if (!order) {
                return res.status(404).json({ error: 'Purchase order not found' });
            }
            res.json(order);
        } catch (error) {
            console.error('Error fetching purchase order:', error);
            res.status(500).json({ error: 'Failed to fetch purchase order' });
        }
    });

    // POST create purchase order
    app.post('/api/purchase-orders', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const poData = req.body;
            const userId = req.user.id;
            const order = await db.inventoryManager.createPurchaseOrder(poData, userId);
            res.status(201).json(order);
        } catch (error) {
            console.error('Error creating purchase order:', error);
            res.status(500).json({ error: 'Failed to create purchase order' });
        }
    });

    // PUT update purchase order status
    app.put('/api/purchase-orders/:id/status', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const { status } = req.body;
            const userId = req.user.id;
            const order = await db.inventoryManager.updatePOStatus(req.params.id, status, userId);
            res.json(order);
        } catch (error) {
            console.error('Error updating purchase order status:', error);
            res.status(500).json({ error: 'Failed to update status' });
        }
    });

    // POST add item to purchase order
    app.post('/api/purchase-orders/:id/items', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const itemData = req.body;
            const userId = req.user.id;
            const item = await db.inventoryManager.addPurchaseOrderItem(req.params.id, itemData, userId);
            res.status(201).json(item);
        } catch (error) {
            console.error('Error adding item to purchase order:', error);
            res.status(500).json({ error: 'Failed to add item' });
        }
    });

    // PUT update purchase order item
    app.put('/api/purchase-orders/items/:id', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const itemData = req.body;
            const userId = req.user.id;
            const item = await db.inventoryManager.updatePurchaseOrderItem(req.params.id, itemData, userId);
            res.json(item);
        } catch (error) {
            console.error('Error updating purchase order item:', error);
            res.status(500).json({ error: 'Failed to update item' });
        }
    });

    // DELETE purchase order item
    app.delete('/api/purchase-orders/items/:id', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const userId = req.user.id;
            const result = await db.inventoryManager.deletePurchaseOrderItem(req.params.id, userId);
            res.json(result);
        } catch (error) {
            console.error('Error deleting purchase order item:', error);
            res.status(500).json({ error: 'Failed to delete item' });
        }
    });

    // POST receive purchase order items
    app.post('/api/purchase-orders/:id/receive', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const { items } = req.body;
            const userId = req.user.id;
            const result = await db.inventoryManager.receivePOItems(req.params.id, items, userId);
            res.json(result);
        } catch (error) {
            console.error('Error receiving purchase order items:', error);
            res.status(500).json({ error: 'Failed to receive items' });
        }
    });
}

// Reorder Level Endpoints
function addReorderLevelEndpoints(app, db, checkPermission) {

    // GET items needing reorder
    app.get('/api/inventory/reorder', checkPermission('view_inventory'), async (req, res) => {
        try {
            const items = await db.inventoryManager.getItemsNeedingReorder();
            res.json(items);
        } catch (error) {
            console.error('Error fetching items needing reorder:', error);
            res.status(500).json({ error: 'Failed to fetch items' });
        }
    });

    // GET reorder level for item
    app.get('/api/inventory/reorder/:itemId', checkPermission('view_inventory'), async (req, res) => {
        try {
            const level = await db.inventoryManager.getReorderLevel(req.params.itemId);
            res.json(level || {});
        } catch (error) {
            console.error('Error fetching reorder level:', error);
            res.status(500).json({ error: 'Failed to fetch reorder level' });
        }
    });

    // PUT set reorder level
    app.put('/api/inventory/reorder/:itemId', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const { threshold, lead_time_days, supplier_id } = req.body;
            const result = await db.inventoryManager.setReorderLevel(
                req.params.itemId,
                threshold,
                lead_time_days,
                supplier_id
            );
            res.json(result);
        } catch (error) {
            console.error('Error setting reorder level:', error);
            res.status(500).json({ error: 'Failed to set reorder level' });
        }
    });
}

// Inventory Alert Endpoints
function addInventoryAlertEndpoints(app, db, checkPermission) {

    // GET all inventory alerts
    app.get('/api/inventory/alerts', checkPermission('view_inventory'), async (req, res) => {
        try {
            const { resolved } = req.query;
            const alerts = await db.inventoryManager.getAllAlerts(resolved === 'true' ? true : null);
            res.json(alerts);
        } catch (error) {
            console.error('Error fetching inventory alerts:', error);
            res.status(500).json({ error: 'Failed to fetch alerts' });
        }
    });

    // POST create inventory alert
    app.post('/api/inventory/alerts', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const { item_id, alert_type, message } = req.body;
            const userId = req.user.id;
            const alert = await db.inventoryManager.createAlert(item_id, alert_type, message, userId);
            res.status(201).json(alert);
        } catch (error) {
            console.error('Error creating inventory alert:', error);
            res.status(500).json({ error: 'Failed to create alert' });
        }
    });

    // POST resolve inventory alert
    app.post('/api/inventory/alerts/:id/resolve', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const userId = req.user.id;
            const result = await db.inventoryManager.resolveAlert(req.params.id, userId);
            res.json(result);
        } catch (error) {
            console.error('Error resolving inventory alert:', error);
            res.status(500).json({ error: 'Failed to resolve alert' });
        }
    });
}

// Inventory Transfer Endpoints
function addInventoryTransferEndpoints(app, db, checkPermission) {

    // GET all inventory transfers
    app.get('/api/inventory/transfers', checkPermission('view_inventory'), async (req, res) => {
        try {
            const transfers = await db.inventoryManager.getAllTransfers();
            res.json(transfers);
        } catch (error) {
            console.error('Error fetching inventory transfers:', error);
            res.status(500).json({ error: 'Failed to fetch transfers' });
        }
    });

    // GET inventory transfer by ID
    app.get('/api/inventory/transfers/:id', checkPermission('view_inventory'), async (req, res) => {
        try {
            const transfer = await db.inventoryManager.getTransfer(req.params.id);
            if (!transfer) {
                return res.status(404).json({ error: 'Transfer not found' });
            }
            res.json(transfer);
        } catch (error) {
            console.error('Error fetching inventory transfer:', error);
            res.status(500).json({ error: 'Failed to fetch transfer' });
        }
    });

    // POST create inventory transfer
    app.post('/api/inventory/transfers', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const transferData = req.body;
            const userId = req.user.id;
            const transfer = await db.inventoryManager.createTransfer(transferData, userId);
            res.status(201).json(transfer);
        } catch (error) {
            console.error('Error creating inventory transfer:', error);
            res.status(500).json({ error: 'Failed to create transfer' });
        }
    });

    // POST complete inventory transfer
    app.post('/api/inventory/transfers/:id/complete', checkPermission('manage_inventory'), async (req, res) => {
        try {
            const userId = req.user.id;
            const result = await db.inventoryManager.completeTransfer(req.params.id, userId);
            res.json(result);
        } catch (error) {
            console.error('Error completing inventory transfer:', error);
            res.status(500).json({ error: 'Failed to complete transfer' });
        }
    });
}

// Order Hold Endpoints
function addOrderHoldEndpoints(app, db, checkPermission) {

    // GET hold timeout settings
    app.get('/api/order-hold/settings', checkPermission('manage_settings'), async (req, res) => {
        try {
            const settings = await db.orderHold.getHoldTimeoutSettings();
            res.json(settings || {});
        } catch (error) {
            console.error('Error fetching hold timeout settings:', error);
            res.status(500).json({ error: 'Failed to fetch settings' });
        }
    });

    // PUT update hold timeout settings
    app.put('/api/order-hold/settings', checkPermission('manage_settings'), async (req, res) => {
        try {
            const settings = req.body;
            const result = await db.orderHold.updateHoldTimeoutSettings(settings);
            res.json(result);
        } catch (error) {
            console.error('Error updating hold timeout settings:', error);
            res.status(500).json({ error: 'Failed to update settings' });
        }
    });

    // GET all cancellation reasons
    app.get('/api/order-hold/cancellation-reasons', checkPermission('view_orders'), async (req, res) => {
        try {
            const reasons = await db.orderHold.getAllCancellationReasons();
            res.json(reasons);
        } catch (error) {
            console.error('Error fetching cancellation reasons:', error);
            res.status(500).json({ error: 'Failed to fetch cancellation reasons' });
        }
    });

    // POST add cancellation reason
    app.post('/api/order-hold/cancellation-reasons', checkPermission('manage_settings'), async (req, res) => {
        try {
            const { reason } = req.body;
            const result = await db.orderHold.addCancellationReason(reason);
            res.status(201).json(result);
        } catch (error) {
            console.error('Error adding cancellation reason:', error);
            res.status(500).json({ error: 'Failed to add cancellation reason' });
        }
    });

    // PUT update cancellation reason
    app.put('/api/order-hold/cancellation-reasons/:id', checkPermission('manage_settings'), async (req, res) => {
        try {
            const { reason, is_active } = req.body;
            const result = await db.orderHold.updateCancellationReason(req.params.id, reason, is_active);
            res.json(result);
        } catch (error) {
            console.error('Error updating cancellation reason:', error);
            res.status(500).json({ error: 'Failed to update cancellation reason' });
        }
    });

    // POST hold order
    app.post('/api/orders/:id/hold', checkPermission('manage_orders'), async (req, res) => {
        try {
            const { reason, notes, timeout_minutes } = req.body;
            const userId = req.user.id;
            const result = await db.orderHold.holdOrder(req.params.id, reason, notes, timeout_minutes, userId);
            res.json(result);
        } catch (error) {
            console.error('Error holding order:', error);
            res.status(500).json({ error: error.message || 'Failed to hold order' });
        }
    });

    // POST release order from hold
    app.post('/api/orders/:id/release', checkPermission('manage_orders'), async (req, res) => {
        try {
            const userId = req.user.id;
            const result = await db.orderHold.releaseOrder(req.params.id, userId);
            res.json(result);
        } catch (error) {
            console.error('Error releasing order:', error);
            res.status(500).json({ error: error.message || 'Failed to release order' });
        }
    });

    // GET held orders
    app.get('/api/orders/held', checkPermission('view_orders'), async (req, res) => {
        try {
            const orders = await db.orderHold.getHeldOrders();
            res.json(orders);
        } catch (error) {
            console.error('Error fetching held orders:', error);
            res.status(500).json({ error: 'Failed to fetch held orders' });
        }
    });

    // POST extend hold time
    app.post('/api/orders/:id/extend-hold', checkPermission('manage_orders'), async (req, res) => {
        try {
            const { additional_minutes } = req.body;
            const userId = req.user.id;
            const result = await db.orderHold.extendHold(req.params.id, additional_minutes, userId);
            res.json(result);
        } catch (error) {
            console.error('Error extending hold:', error);
            res.status(500).json({ error: error.message || 'Failed to extend hold' });
        }
    });

    // POST cancel order with reason
    app.post('/api/orders/:id/cancel', checkPermission('manage_orders'), async (req, res) => {
        try {
            const { cancellation_reason_id, custom_reason, refund_amount, notes } = req.body;
            const userId = req.user.id;
            const result = await db.orderHold.cancelOrder(
                req.params.id,
                cancellation_reason_id,
                custom_reason,
                refund_amount,
                notes,
                userId
            );
            res.json(result);
        } catch (error) {
            console.error('Error cancelling order:', error);
            res.status(500).json({ error: error.message || 'Failed to cancel order' });
        }
    });

    // GET cancelled orders
    app.get('/api/orders/cancelled', checkPermission('view_orders'), async (req, res) => {
        try {
            const orders = await db.orderHold.getCancelledOrders();
            res.json(orders);
        } catch (error) {
            console.error('Error fetching cancelled orders:', error);
            res.status(500).json({ error: 'Failed to fetch cancelled orders' });
        }
    });

    // GET hold/cancel statistics
    app.get('/api/order-hold/stats', checkPermission('view_reports'), async (req, res) => {
        try {
            const stats = await db.orderHold.getHoldCancelStatistics();
            res.json(stats);
        } catch (error) {
            console.error('Error fetching hold/cancel statistics:', error);
            res.status(500).json({ error: 'Failed to fetch statistics' });
        }
    });

    // GET hold/cancel report
    app.get('/api/reports/hold-cancel', checkPermission('view_reports'), async (req, res) => {
        try {
            const { start_date, end_date } = req.query;
            if (!start_date || !end_date) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }
            const report = await db.orderHold.getHoldCancelReport(start_date, end_date);
            res.json(report);
        } catch (error) {
            console.error('Error fetching hold/cancel report:', error);
            res.status(500).json({ error: 'Failed to fetch report' });
        }
    });

    // GET cancellation reasons report
    app.get('/api/reports/cancellation-reasons', checkPermission('view_reports'), async (req, res) => {
        try {
            const { start_date, end_date } = req.query;
            if (!start_date || !end_date) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }
            const report = await db.orderHold.getCancellationReasonsReport(start_date, end_date);
            res.json(report);
        } catch (error) {
            console.error('Error fetching cancellation reasons report:', error);
            res.status(500).json({ error: 'Failed to fetch report' });
        }
    });

    // GET hold duration distribution
    app.get('/api/reports/hold-duration', checkPermission('view_reports'), async (req, res) => {
        try {
            const report = await db.orderHold.getHoldDurationDistribution();
            res.json(report);
        } catch (error) {
            console.error('Error fetching hold duration distribution:', error);
            res.status(500).json({ error: 'Failed to fetch report' });
        }
    });
}

// Inventory Report Endpoints
function addInventoryReportEndpoints(app, db, checkPermission) {

    // GET inventory summary report
    app.get('/api/reports/inventory-summary', checkPermission('view_reports'), async (req, res) => {
        try {
            const summary = await db.inventoryManager.getInventorySummary();
            res.json(summary);
        } catch (error) {
            console.error('Error fetching inventory summary:', error);
            res.status(500).json({ error: 'Failed to fetch inventory summary' });
        }
    });

    // GET stock movement report
    app.get('/api/reports/stock-movement', checkPermission('view_reports'), async (req, res) => {
        try {
            const { start_date, end_date } = req.query;
            if (!start_date || !end_date) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }
            const report = await db.inventoryManager.getStockMovementReport(start_date, end_date);
            res.json(report);
        } catch (error) {
            console.error('Error fetching stock movement report:', error);
            res.status(500).json({ error: 'Failed to fetch stock movement report' });
        }
    });

    // GET purchase order report
    app.get('/api/reports/purchase-orders', checkPermission('view_reports'), async (req, res) => {
        try {
            const { start_date, end_date, status } = req.query;
            if (!start_date || !end_date) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }
            const report = await db.inventoryManager.getPurchaseOrderReport(start_date, end_date, status);
            res.json(report);
        } catch (error) {
            console.error('Error fetching purchase order report:', error);
            res.status(500).json({ error: 'Failed to fetch purchase order report' });
        }
    });

    // GET supplier performance report
    app.get('/api/reports/supplier-performance', checkPermission('view_reports'), async (req, res) => {
        try {
            const { start_date, end_date } = req.query;
            if (!start_date || !end_date) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }
            const report = await db.inventoryManager.getSupplierPerformanceReport(start_date, end_date);
            res.json(report);
        } catch (error) {
            console.error('Error fetching supplier performance report:', error);
            res.status(500).json({ error: 'Failed to fetch supplier performance report' });
        }
    });
}

module.exports = {
    addUserManagementEndpoints,
    addRoleManagementEndpoints,
    addCustomerManagementEndpoints,
    addInventoryManagementEndpoints,
    addReportingEndpoints,
    addBackupEndpoints,
    addTokenQueueEndpoints,
    addSupplierEndpoints,
    addPurchaseOrderEndpoints,
    addReorderLevelEndpoints,
    addInventoryAlertEndpoints,
    addInventoryTransferEndpoints,
    addOrderHoldEndpoints,
    addInventoryReportEndpoints
};