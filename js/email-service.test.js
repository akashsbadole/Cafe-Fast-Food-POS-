// Email Service Unit Tests
const assert = require('assert');
const sinon = require('sinon');
const nodemailer = require('nodemailer');

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

describe('EmailService', () => {
    let EmailService;
    let db;
    let logger;
    let service;
    let transporter;

    before(async () => {
        // Load the module
        EmailService = require('./email-service');
    });

    beforeEach(() => {
        db = new MockDB();
        logger = new MockLogger();
        service = new EmailService(db, logger);
        
        // Mock nodemailer
        transporter = {
            sendMail: sinon.stub()
        };
        
        sinon.stub(nodemailer, 'createTransport').returns(transporter);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Initialization', () => {
        it('should initialize with default configuration', async () => {
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_host']).resolves({ rows: [{ value: 'smtp.example.com' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_port']).resolves({ rows: [{ value: '587' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_secure']).resolves({ rows: [{ value: 'true' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_auth']).resolves({ rows: [{ value: '{"user":"test@example.com","pass":"password"}' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_from']).resolves({ rows: [{ value: 'noreply@example.com' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_reply_to']).resolves({ rows: [{ value: 'support@example.com' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_signature']).resolves({ rows: [{ value: 'Best regards' }] });

            await service.init();

            assert.strictEqual(service.isInitialized, true);
            assert.strictEqual(service.config.host, 'smtp.example.com');
        });

        it('should initialize with empty configuration if no settings exist', async () => {
            db.query.resolves({ rows: [] });

            await service.init();

            assert.strictEqual(service.isInitialized, true);
            assert.strictEqual(service.config.host, '');
        });
    });

    describe('Configuration Management', () => {
        it('should get configuration', async () => {
            const config = {
                host: 'smtp.example.com',
                port: 587,
                secure: true,
                auth: { user: 'test@example.com', pass: 'password' },
                from: 'noreply@example.com',
                reply_to: 'support@example.com',
                signature: 'Best regards'
            };

            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_host']).resolves({ rows: [{ value: 'smtp.example.com' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_port']).resolves({ rows: [{ value: '587' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_secure']).resolves({ rows: [{ value: 'true' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_auth']).resolves({ rows: [{ value: '{"user":"test@example.com","pass":"password"}' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_from']).resolves({ rows: [{ value: 'noreply@example.com' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_reply_to']).resolves({ rows: [{ value: 'support@example.com' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['email_signature']).resolves({ rows: [{ value: 'Best regards' }] });

            const result = await service.getConfiguration();

            assert.strictEqual(result.host, 'smtp.example.com');
            assert.strictEqual(result.from, 'noreply@example.com');
        });

        it('should update configuration', async () => {
            const newConfig = {
                host: 'new-smtp.example.com',
                port: 465,
                secure: true,
                auth: { user: 'new@example.com', pass: 'newpassword' },
                from: 'new@example.com',
                reply_to: 'new-support@example.com',
                signature: 'New signature'
            };

            db.run.resolves({});

            await service.updateConfiguration(newConfig);

            assert(db.run.callCount, 8);
        });

        it('should verify configuration', async () => {
            service.config = {
                host: 'smtp.example.com',
                port: 587,
                secure: true,
                auth: { user: 'test@example.com', pass: 'password' }
            };

            transporter.sendMail.resolves({ messageId: '123' });

            const result = await service.verifyConfiguration();

            assert.strictEqual(result.success, true);
        });

        it('should fail verification with invalid configuration', async () => {
            service.config = {
                host: '',
                port: 587
            };

            try {
                await service.verifyConfiguration();
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Email configuration is not properly set');
            }
        });
    });

    describe('Email Sending', () => {
        it('should send email', async () => {
            service.config = {
                host: 'smtp.example.com',
                port: 587,
                secure: true,
                auth: { user: 'test@example.com', pass: 'password' },
                from: 'noreply@example.com'
            };

            transporter.sendMail.resolves({ messageId: '123' });

            const result = await service.sendEmail({
                to: 'recipient@example.com',
                subject: 'Test Email',
                html: '<html>Test content</html>',
                text: 'Test content'
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.messageId, '123');
        });

        it('should send email with attachments', async () => {
            service.config = {
                host: 'smtp.example.com',
                port: 587,
                secure: true,
                auth: { user: 'test@example.com', pass: 'password' },
                from: 'noreply@example.com'
            };

            transporter.sendMail.resolves({ messageId: '123' });

            const result = await service.sendEmail({
                to: 'recipient@example.com',
                subject: 'Test Email',
                html: '<html>Test content</html>',
                attachments: [
                    { filename: 'receipt.pdf', content: Buffer.from('PDF content'), encoding: 'base64' }
                ]
            });

            assert.strictEqual(result.success, true);
        });

        it('should handle email sending errors', async () => {
            service.config = {
                host: 'smtp.example.com',
                port: 587,
                secure: true,
                auth: { user: 'test@example.com', pass: 'password' },
                from: 'noreply@example.com'
            };

            transporter.sendMail.rejects(new Error('SMTP connection failed'));

            try {
                await service.sendEmail({
                    to: 'recipient@example.com',
                    subject: 'Test Email',
                    html: '<html>Test content</html>'
                });
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'SMTP connection failed');
            }
        });

        it('should send digital receipt email', async () => {
            service.config = {
                host: 'smtp.example.com',
                port: 587,
                secure: true,
                auth: { user: 'test@example.com', pass: 'password' },
                from: 'noreply@example.com',
                signature: 'Best regards'
            };

            transporter.sendMail.resolves({ messageId: '123' });

            const result = await service.sendDigitalReceiptEmail({
                to: 'recipient@example.com',
                orderNumber: 'ORD-001',
                totalAmount: 100.00,
                template: '<html>{{order_number}} - {{total_amount}}</html>',
                orderData: { order_number: 'ORD-001', total_amount: 100.00 },
                customerData: { name: 'Test Customer' },
                items: [{ name: 'Item 1', quantity: 2, total_price: 100.00 }],
                payments: [{ amount: 100.00, payment_method: 'card' }],
                attachments: ['receipt.pdf']
            });

            assert.strictEqual(result.success, true);
        });

        it('should test email configuration', async () => {
            service.config = {
                host: 'smtp.example.com',
                port: 587,
                secure: true,
                auth: { user: 'test@example.com', pass: 'password' },
                from: 'noreply@example.com'
            };

            transporter.sendMail.resolves({ messageId: '123' });

            const result = await service.testEmail('test@example.com', 'Test Subject', 'Test Body');

            assert.strictEqual(result.success, true);
        });
    });

    describe('Template Rendering', () => {
        it('should render email template', async () => {
            const template = '<html>{{order_number}} - {{total_amount}} - {{customer_name}}</html>';
            const orderData = { order_number: 'ORD-001', total_amount: 100.00 };
            const customerData = { name: 'Test Customer' };
            const items = [{ name: 'Item 1', quantity: 2, total_price: 100.00 }];
            const payments = [{ amount: 100.00, payment_method: 'card' }];

            const result = service.renderEmailTemplate(template, orderData, customerData, items, payments);

            assert(result.includes('ORD-001'));
            assert(result.includes('100.00'));
            assert(result.includes('Test Customer'));
        });

        it('should handle missing template variables', async () => {
            const template = '<html>{{order_number}} - {{missing_variable}}</html>';
            const orderData = { order_number: 'ORD-001' };

            const result = service.renderEmailTemplate(template, orderData, null, [], []);

            assert(result.includes('ORD-001'));
            assert(result.includes('{{missing_variable}}'));
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors', async () => {
            db.query.rejects(new Error('Database error'));

            try {
                await service.getConfiguration();
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Database error');
            }
        });

        it('should handle invalid email data', async () => {
            try {
                await service.sendEmail({});
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Recipient email is required');
            }
        });

        it('should handle transporter errors', async () => {
            service.config = {
                host: 'smtp.example.com',
                port: 587,
                secure: true,
                auth: { user: 'test@example.com', pass: 'password' },
                from: 'noreply@example.com'
            };

            transporter.sendMail.rejects(new Error('Transporter error'));

            try {
                await service.sendEmail({
                    to: 'recipient@example.com',
                    subject: 'Test Email',
                    html: '<html>Test content</html>'
                });
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Transporter error');
            }
        });
    });
});

module.exports = EmailService;
