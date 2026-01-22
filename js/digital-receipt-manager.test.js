// Digital Receipt Manager Unit Tests
const assert = require('assert');
const sinon = require('sinon');
const { Database } = require('sqlite3').verbose();

// Mock database
class MockDB {
    constructor() {
        this.query = sinon.stub();
        this.run = sinon.stub();
    }
}

// Mock logger
class MockLogger {
    constructor() {
        this.info = sinon.stub();
        this.error = sinon.stub();
        this.debug = sinon.stub();
    }
}

describe('DigitalReceiptManager', () => {
    let DigitalReceiptManager;
    let db;
    let logger;
    let manager;

    before(async () => {
        // Load the module
        DigitalReceiptManager = require('./digital-receipt-manager');
    });

    beforeEach(() => {
        db = new MockDB();
        logger = new MockLogger();
        manager = new DigitalReceiptManager(db, logger);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Initialization', () => {
        it('should initialize without errors', async () => {
            db.query.withArgs('SELECT * FROM digital_receipt_templates WHERE is_default = 1 LIMIT 1').resolves({ rows: [] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['digital_receipt_auto_send']).resolves({ rows: [{ value: 'true' }] });
            
            await manager.init();
            
            assert.strictEqual(manager.isInitialized, true);
        });
    });

    describe('Template Management', () => {
        it('should create a template', async () => {
            const templateData = {
                name: 'Test Template',
                type: 'email',
                subject: 'Your Order Receipt',
                html_template: '<html>Test</html>',
                text_template: 'Test',
                is_default: true,
                is_active: true
            };

            db.run.resolves({ lastInsertRowid: 1 });
            db.query.withArgs('SELECT * FROM digital_receipt_templates WHERE id = ?', [1]).resolves({ rows: [templateData] });

            const result = await manager.createTemplate(templateData);

            assert.strictEqual(result.id, 1);
            assert.strictEqual(result.name, 'Test Template');
        });

        it('should get all templates', async () => {
            const templates = [
                { id: 1, name: 'Template 1', type: 'email' },
                { id: 2, name: 'Template 2', type: 'whatsapp' }
            ];

            db.query.resolves({ rows: templates });

            const result = await manager.getAllTemplates();

            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].name, 'Template 1');
        });

        it('should get template by ID', async () => {
            const template = { id: 1, name: 'Test Template', type: 'email' };

            db.query.withArgs('SELECT * FROM digital_receipt_templates WHERE id = ?', [1]).resolves({ rows: [template] });

            const result = await manager.getTemplateById(1);

            assert.strictEqual(result.id, 1);
            assert.strictEqual(result.name, 'Test Template');
        });

        it('should update a template', async () => {
            const templateData = {
                name: 'Updated Template',
                type: 'email',
                subject: 'Updated Subject',
                html_template: '<html>Updated</html>',
                text_template: 'Updated',
                is_default: false,
                is_active: true
            };

            db.run.resolves({});
            db.query.withArgs('SELECT * FROM digital_receipt_templates WHERE id = ?', [1]).resolves({ rows: [templateData] });

            const result = await manager.updateTemplate(1, templateData);

            assert.strictEqual(result.name, 'Updated Template');
        });

        it('should delete a template', async () => {
            db.run.resolves({});

            await manager.deleteTemplate(1);

            assert(db.run.calledOnce);
        });
    });

    describe('Customer Preferences', () => {
        it('should create customer preferences', async () => {
            const preferencesData = {
                customer_id: 1,
                email_enabled: true,
                whatsapp_enabled: true,
                sms_enabled: false,
                phone_number: '+1234567890',
                email_address: 'test@example.com'
            };

            db.run.resolves({ lastInsertRowid: 1 });
            db.query.withArgs('SELECT * FROM customer_communication_preferences WHERE id = ?', [1]).resolves({ rows: [preferencesData] });

            const result = await manager.createCustomerPreferences(preferencesData);

            assert.strictEqual(result.id, 1);
            assert.strictEqual(result.customer_id, 1);
        });

        it('should get customer preferences by ID', async () => {
            const preferences = {
                id: 1,
                customer_id: 1,
                email_enabled: true,
                whatsapp_enabled: true,
                phone_number: '+1234567890',
                email_address: 'test@example.com'
            };

            db.query.withArgs('SELECT * FROM customer_communication_preferences WHERE id = ?', [1]).resolves({ rows: [preferences] });

            const result = await manager.getCustomerPreferencesById(1);

            assert.strictEqual(result.id, 1);
            assert.strictEqual(result.customer_id, 1);
        });

        it('should update customer preferences', async () => {
            const preferencesData = {
                email_enabled: false,
                whatsapp_enabled: true,
                phone_number: '+1234567890'
            };

            db.run.resolves({});
            db.query.withArgs('SELECT * FROM customer_communication_preferences WHERE id = ?', [1]).resolves({ rows: [preferencesData] });

            const result = await manager.updateCustomerPreferences(1, preferencesData);

            assert.strictEqual(result.email_enabled, false);
        });

        it('should get customer preferences by customer ID', async () => {
            const preferences = {
                id: 1,
                customer_id: 1,
                email_enabled: true,
                whatsapp_enabled: true
            };

            db.query.withArgs('SELECT * FROM customer_communication_preferences WHERE customer_id = ?', [1]).resolves({ rows: [preferences] });

            const result = await manager.getCustomerPreferences(1);

            assert.strictEqual(result.id, 1);
        });
    });

    describe('Digital Receipt Sending', () => {
        it('should send digital receipt via email', async () => {
            const orderData = {
                id: 1,
                total_amount: 100.00,
                status: 'completed',
                created_at: '2023-01-01 12:00:00'
            };

            const customerData = {
                id: 1,
                name: 'Test Customer',
                email: 'test@example.com',
                phone: '+1234567890'
            };

            const items = [
                { id: 1, name: 'Item 1', quantity: 2, unit_price: 50.00, total_price: 100.00 }
            ];

            const payments = [
                { id: 1, amount: 100.00, payment_method: 'card' }
            ];

            const template = {
                id: 1,
                name: 'Email Template',
                type: 'email',
                subject: 'Your Order Receipt',
                html_template: '<html>{{order_number}} - {{total_amount}}</html>',
                text_template: '{{order_number}} - {{total_amount}}'
            };

            db.query.withArgs('SELECT * FROM orders WHERE id = ?', [1]).resolves({ rows: [orderData] });
            db.query.withArgs('SELECT c.* FROM customers c JOIN orders o ON c.id = o.customer_id WHERE o.id = ?', [1]).resolves({ rows: [customerData] });
            db.query.withArgs('SELECT * FROM order_items WHERE order_id = ?', [1]).resolves({ rows: items });
            db.query.withArgs('SELECT * FROM payments WHERE order_id = ?', [1]).resolves({ rows: payments });
            db.query.withArgs('SELECT * FROM digital_receipt_templates WHERE type = ? AND is_active = 1 ORDER BY is_default DESC, id LIMIT 1', ['email']).resolves({ rows: [template] });
            db.query.withArgs('SELECT * FROM customer_communication_preferences WHERE customer_id = ?', [1]).resolves({ rows: [{ email_enabled: true }] });
            db.run.resolves({ lastInsertRowid: 1 });
            db.query.withArgs('SELECT * FROM digital_receipt_history WHERE id = ?', [1]).resolves({ rows: [{ id: 1, status: 'sent' }] });

            const result = await manager.sendDigitalReceipt({
                orderId: 1,
                email: 'test@example.com',
                method: 'email'
            });

            assert.strictEqual(result.status, 'sent');
        });

        it('should send digital receipt via WhatsApp', async () => {
            const orderData = {
                id: 1,
                total_amount: 100.00,
                status: 'completed'
            };

            const customerData = {
                id: 1,
                name: 'Test Customer',
                phone: '+1234567890'
            };

            const template = {
                id: 2,
                name: 'WhatsApp Template',
                type: 'whatsapp',
                text_template: '{{order_number}} - {{total_amount}}'
            };

            db.query.withArgs('SELECT * FROM orders WHERE id = ?', [1]).resolves({ rows: [orderData] });
            db.query.withArgs('SELECT c.* FROM customers c JOIN orders o ON c.id = o.customer_id WHERE o.id = ?', [1]).resolves({ rows: [customerData] });
            db.query.withArgs('SELECT * FROM digital_receipt_templates WHERE type = ? AND is_active = 1 ORDER BY is_default DESC, id LIMIT 1', ['whatsapp']).resolves({ rows: [template] });
            db.query.withArgs('SELECT * FROM customer_communication_preferences WHERE customer_id = ?', [1]).resolves({ rows: [{ whatsapp_enabled: true }] });
            db.run.resolves({ lastInsertRowid: 1 });
            db.query.withArgs('SELECT * FROM digital_receipt_history WHERE id = ?', [1]).resolves({ rows: [{ id: 1, status: 'sent' }] });

            const result = await manager.sendDigitalReceipt({
                orderId: 1,
                phone: '+1234567890',
                method: 'whatsapp'
            });

            assert.strictEqual(result.status, 'sent');
        });

        it('should handle auto-detection of sending method', async () => {
            const orderData = {
                id: 1,
                total_amount: 100.00,
                status: 'completed'
            };

            const customerData = {
                id: 1,
                name: 'Test Customer',
                email: 'test@example.com',
                phone: '+1234567890'
            };

            const template = {
                id: 1,
                name: 'Email Template',
                type: 'email',
                subject: 'Your Order Receipt',
                html_template: '<html>{{order_number}} - {{total_amount}}</html>'
            };

            db.query.withArgs('SELECT * FROM orders WHERE id = ?', [1]).resolves({ rows: [orderData] });
            db.query.withArgs('SELECT c.* FROM customers c JOIN orders o ON c.id = o.customer_id WHERE o.id = ?', [1]).resolves({ rows: [customerData] });
            db.query.withArgs('SELECT * FROM digital_receipt_templates WHERE type = ? AND is_active = 1 ORDER BY is_default DESC, id LIMIT 1', ['email']).resolves({ rows: [template] });
            db.query.withArgs('SELECT * FROM customer_communication_preferences WHERE customer_id = ?', [1]).resolves({ rows: [{ email_enabled: true }] });
            db.run.resolves({ lastInsertRowid: 1 });
            db.query.withArgs('SELECT * FROM digital_receipt_history WHERE id = ?', [1]).resolves({ rows: [{ id: 1, status: 'sent' }] });

            const result = await manager.sendDigitalReceipt({
                orderId: 1,
                method: 'auto'
            });

            assert.strictEqual(result.status, 'sent');
        });
    });

    describe('Digital Receipt History', () => {
        it('should get digital receipt history', async () => {
            const history = [
                { id: 1, order_id: 1, status: 'sent', created_at: '2023-01-01' },
                { id: 2, order_id: 2, status: 'failed', created_at: '2023-01-02' }
            ];

            db.query.resolves({ rows: history });

            const result = await manager.getDigitalReceiptHistory({});

            assert.strictEqual(result.length, 2);
        });

        it('should get digital receipt history by ID', async () => {
            const history = { id: 1, order_id: 1, status: 'sent', created_at: '2023-01-01' };

            db.query.withArgs('SELECT * FROM digital_receipt_history WHERE id = ?', [1]).resolves({ rows: [history] });

            const result = await manager.getDigitalReceiptHistoryById(1);

            assert.strictEqual(result.id, 1);
        });

        it('should resend digital receipt', async () => {
            const history = { id: 1, order_id: 1, status: 'sent', created_at: '2023-01-01' };

            db.query.withArgs('SELECT * FROM digital_receipt_history WHERE id = ?', [1]).resolves({ rows: [history] });
            db.run.resolves({});
            db.query.withArgs('SELECT * FROM digital_receipt_history WHERE id = ?', [1]).resolves({ rows: [{ id: 1, status: 'resent' }] });

            const result = await manager.resendDigitalReceipt(1, 1);

            assert.strictEqual(result.status, 'resent');
        });

        it('should update digital receipt status', async () => {
            const history = { id: 1, order_id: 1, status: 'sent', delivery_status: 'delivered' };

            db.run.resolves({});
            db.query.withArgs('SELECT * FROM digital_receipt_history WHERE id = ?', [1]).resolves({ rows: [history] });

            const result = await manager.updateDigitalReceiptStatus(1, { status: 'sent', delivery_status: 'delivered' });

            assert.strictEqual(result.delivery_status, 'delivered');
        });
    });

    describe('Reports', () => {
        it('should get digital receipt summary', async () => {
            const summary = {
                total_sent: 100,
                total_failed: 10,
                success_rate: 90,
                email_sent: 80,
                whatsapp_sent: 20
            };

            db.query.resolves({ rows: [summary] });

            const result = await manager.getDigitalReceiptSummary('2023-01-01', '2023-01-31');

            assert.strictEqual(result.total_sent, 100);
        });

        it('should get digital receipt daily report', async () => {
            const dailyReport = [
                { date: '2023-01-01', sent: 10, failed: 1 },
                { date: '2023-01-02', sent: 15, failed: 2 }
            ];

            db.query.resolves({ rows: dailyReport });

            const result = await manager.getDigitalReceiptDailyReport('2023-01-01');

            assert.strictEqual(result.length, 2);
        });

        it('should get digital receipt delivery rate', async () => {
            const deliveryRate = {
                total_sent: 100,
                delivered: 90,
                read: 80,
                delivery_rate: 90,
                read_rate: 80
            };

            db.query.resolves({ rows: [deliveryRate] });

            const result = await manager.getDigitalReceiptDeliveryRate('2023-01-01', '2023-01-31');

            assert.strictEqual(result.delivery_rate, 90);
        });

        it('should get digital receipt method distribution', async () => {
            const methodDistribution = [
                { method: 'email', count: 80, percentage: 80 },
                { method: 'whatsapp', count: 20, percentage: 20 }
            ];

            db.query.resolves({ rows: methodDistribution });

            const result = await manager.getDigitalReceiptMethodDistribution('2023-01-01', '2023-01-31');

            assert.strictEqual(result.length, 2);
        });
    });

    describe('Template Rendering', () => {
        it('should render template with order data', async () => {
            const order = {
                id: 1,
                order_number: 'ORD-001',
                total_amount: 100.00,
                status: 'completed',
                created_at: '2023-01-01 12:00:00'
            };

            const customer = {
                id: 1,
                name: 'Test Customer',
                email: 'test@example.com'
            };

            const items = [
                { name: 'Item 1', quantity: 2, unit_price: 50.00, total_price: 100.00 }
            ];

            const payments = [
                { amount: 100.00, payment_method: 'card' }
            ];

            const template = '<html>{{order_number}} - {{total_amount}} - {{customer_name}}</html>';

            const result = manager.renderTemplate(template, order, customer, items, payments);

            assert(result.includes('ORD-001'));
            assert(result.includes('100.00'));
            assert(result.includes('Test Customer'));
        });

        it('should handle missing template variables', async () => {
            const order = {
                id: 1,
                order_number: 'ORD-001',
                total_amount: 100.00
            };

            const template = '<html>{{order_number}} - {{missing_variable}}</html>';

            const result = manager.renderTemplate(template, order, null, [], []);

            assert(result.includes('ORD-001'));
            assert(result.includes('{{missing_variable}}'));
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors', async () => {
            db.query.rejects(new Error('Database error'));

            try {
                await manager.getAllTemplates();
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Database error');
            }
        });

        it('should handle invalid template data', async () => {
            try {
                await manager.createTemplate({});
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Template name and type are required');
            }
        });

        it('should handle invalid customer preferences', async () => {
            try {
                await manager.createCustomerPreferences({});
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Customer ID is required');
            }
        });
    });
});

module.exports = DigitalReceiptManager;
