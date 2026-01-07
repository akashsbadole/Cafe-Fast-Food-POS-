// MVP Endpoints for Cafe POS Web Application
// This file contains the additional endpoints needed for MVP features

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Parser } = require('json2csv');

// User Management Endpoints
function addUserManagementEndpoints(app, db, checkPermission) {

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

    // GET user by ID
    app.get('/api/users/:id', checkPermission('manage_settings'), async (req, res) => {
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
    app.post('/api/users', checkPermission('manage_settings'), async (req, res) => {
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
    app.put('/api/users/:id', checkPermission('manage_settings'), async (req, res) => {
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
    app.delete('/api/users/:id', checkPermission('manage_settings'), async (req, res) => {
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
    app.get('/api/roles', checkPermission('manage_settings'), async (req, res) => {
        try {
            const roles = await db.role.getAll();
            res.json(roles);
        } catch (error) {
            console.error('Error fetching roles:', error);
            res.status(500).json({ error: 'Failed to fetch roles' });
        }
    });

    // POST create role
    app.post('/api/roles', checkPermission('manage_settings'), async (req, res) => {
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
    app.put('/api/roles/:id', checkPermission('manage_settings'), async (req, res) => {
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
    app.delete('/api/roles/:id', checkPermission('manage_settings'), async (req, res) => {
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
    app.get('/api/customers', checkPermission('manage_settings'), async (req, res) => {
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
    app.put('/api/inventory/:itemId', checkPermission('manage_settings'), async (req, res) => {
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
    app.get('/api/inventory/low-stock', checkPermission('manage_settings'), async (req, res) => {
        try {
            const items = await db.inventory.getLowStockItems();
            res.json(items);
        } catch (error) {
            console.error('Error fetching low stock items:', error);
            res.status(500).json({ error: 'Failed to fetch low stock items' });
        }
    });

    // GET inventory transaction history
    app.get('/api/inventory/history/:itemId', checkPermission('manage_settings'), async (req, res) => {
        try {
            const history = await db.inventory.getTransactionHistory(req.params.itemId);
            res.json(history);
        } catch (error) {
            console.error('Error fetching inventory history:', error);
            res.status(500).json({ error: 'Failed to fetch inventory history' });
        }
    });

    // PUT set low stock threshold
    app.put('/api/inventory/:itemId/threshold', checkPermission('manage_settings'), async (req, res) => {
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
    app.get('/api/reports/sales', checkPermission('manage_settings'), async (req, res) => {
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
    app.get('/api/reports/daily-summary', checkPermission('manage_settings'), async (req, res) => {
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
    app.get('/api/reports/top-items', checkPermission('manage_settings'), async (req, res) => {
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
    app.get('/api/reports/tax', checkPermission('manage_settings'), async (req, res) => {
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
    app.get('/api/reports/payment-breakdown', checkPermission('manage_settings'), async (req, res) => {
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
    app.get('/api/reports/export/:type', checkPermission('manage_settings'), async (req, res) => {
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

module.exports = {
    addUserManagementEndpoints,
    addRoleManagementEndpoints,
    addCustomerManagementEndpoints,
    addInventoryManagementEndpoints,
    addReportingEndpoints,
    addBackupEndpoints
};