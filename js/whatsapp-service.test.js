// WhatsApp Service Unit Tests
const assert = require('assert');
const sinon = require('sinon');
const axios = require('axios');

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

describe('WhatsAppService', () => {
    let WhatsAppService;
    let db;
    let logger;
    let service;
    let axiosInstance;

    before(async () => {
        // Load the module
        WhatsAppService = require('./whatsapp-service');
    });

    beforeEach(() => {
        db = new MockDB();
        logger = new MockLogger();
        service = new WhatsAppService(db, logger);
        
        // Mock axios
        axiosInstance = {
            post: sinon.stub(),
            get: sinon.stub()
        };
        
        sinon.stub(axios, 'create').returns(axiosInstance);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Initialization', () => {
        it('should initialize with default configuration', async () => {
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_api_url']).resolves({ rows: [{ value: 'https://api.whatsapp.com' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_api_key']).resolves({ rows: [{ value: 'test-api-key' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_phone_number_id']).resolves({ rows: [{ value: '12345' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_from_number']).resolves({ rows: [{ value: '+1234567890' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_message_template_name']).resolves({ rows: [{ value: 'receipt_template' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_is_sandbox']).resolves({ rows: [{ value: 'true' }] });

            await service.init();

            assert.strictEqual(service.isInitialized, true);
            assert.strictEqual(service.config.api_url, 'https://api.whatsapp.com');
        });

        it('should initialize with empty configuration if no settings exist', async () => {
            db.query.resolves({ rows: [] });

            await service.init();

            assert.strictEqual(service.isInitialized, true);
            assert.strictEqual(service.config.api_url, '');
        });
    });

    describe('Configuration Management', () => {
        it('should get configuration', async () => {
            const config = {
                api_url: 'https://api.whatsapp.com',
                api_key: 'test-api-key',
                phone_number_id: '12345',
                from_number: '+1234567890',
                message_template_name: 'receipt_template',
                is_sandbox: true
            };

            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_api_url']).resolves({ rows: [{ value: 'https://api.whatsapp.com' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_api_key']).resolves({ rows: [{ value: 'test-api-key' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_phone_number_id']).resolves({ rows: [{ value: '12345' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_from_number']).resolves({ rows: [{ value: '+1234567890' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_message_template_name']).resolves({ rows: [{ value: 'receipt_template' }] });
            db.query.withArgs('SELECT * FROM settings WHERE key = ?', ['whatsapp_is_sandbox']).resolves({ rows: [{ value: 'true' }] });

            const result = await service.getConfiguration();

            assert.strictEqual(result.api_url, 'https://api.whatsapp.com');
            assert.strictEqual(result.phone_number_id, '12345');
        });

        it('should update configuration', async () => {
            const newConfig = {
                api_url: 'https://new-api.whatsapp.com',
                api_key: 'new-api-key',
                phone_number_id: '67890',
                from_number: '+9876543210',
                message_template_name: 'new_template',
                is_sandbox: false
            };

            db.run.resolves({});

            await service.updateConfiguration(newConfig);

            assert(db.run.callCount, 6);
        });

        it('should verify configuration', async () => {
            service.config = {
                api_url: 'https://api.whatsapp.com',
                api_key: 'test-api-key',
                phone_number_id: '12345',
                from_number: '+1234567890'
            };

            axiosInstance.get.resolves({ data: { status: 'active' } });

            const result = await service.verifyConfiguration();

            assert.strictEqual(result.success, true);
        });

        it('should fail verification with invalid configuration', async () => {
            service.config = {
                api_url: '',
                api_key: ''
            };

            try {
                await service.verifyConfiguration();
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'WhatsApp configuration is not properly set');
            }
        });
    });

    describe('Message Sending', () => {
        it('should send WhatsApp message', async () => {
            service.config = {
                api_url: 'https://api.whatsapp.com',
                api_key: 'test-api-key',
                phone_number_id: '12345',
                from_number: '+1234567890'
            };

            axiosInstance.post.resolves({ data: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.HBgLM...' }] } });

            const result = await service.sendMessage({
                to: '+9876543210',
                body: 'Test message'
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.messageId, 'wamid.HBgLM...');
        });

        it('should send WhatsApp message with template', async () => {
            service.config = {
                api_url: 'https://api.whatsapp.com',
                api_key: 'test-api-key',
                phone_number_id: '12345',
                from_number: '+1234567890',
                message_template_name: 'receipt_template'
            };

            axiosInstance.post.resolves({ data: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.HBgLM...' }] } });

            const result = await service.sendMessage({
                to: '+9876543210',
                template: {
                    name: 'receipt_template',
                    language: { code: 'en_US' },
                    components: [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: 'ORD-001' },
                                { type: 'text', text: '100.00' }
                            ]
                        }
                    ]
                }
            });

            assert.strictEqual(result.success, true);
        });

        it('should send SMS message', async () => {
            service.config = {
                api_url: 'https://api.whatsapp.com',
                api_key: 'test-api-key',
                phone_number_id: '12345',
                from_number: '+1234567890'
            };

            axiosInstance.post.resolves({ data: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.HBgLM...' }] } });

            const result = await service.sendSMS({
                to: '+9876543210',
                body: 'Test SMS message'
            });

            assert.strictEqual(result.success, true);
        });

        it('should handle message sending errors', async () => {
            service.config = {
                api_url: 'https://api.whatsapp.com',
                api_key: 'test-api-key',
                phone_number_id: '12345',
                from_number: '+1234567890'
            };

            axiosInstance.post.rejects(new Error('API request failed'));

            try {
                await service.sendMessage({
                    to: '+9876543210',
                    body: 'Test message'
                });
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'API request failed');
            }
        });

        it('should send digital receipt via WhatsApp', async () => {
            service.config = {
                api_url: 'https://api.whatsapp.com',
                api_key: 'test-api-key',
                phone_number_id: '12345',
                from_number: '+1234567890',
                message_template_name: 'receipt_template'
            };

            axiosInstance.post.resolves({ data: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.HBgLM...' }] } });

            const result = await service.sendDigitalReceiptMessage({
                to: '+9876543210',
                orderNumber: 'ORD-001',
                totalAmount: 100.00,
                template: '{{order_number}} - {{total_amount}}',
                orderData: { order_number: 'ORD-001', total_amount: 100.00 },
                customerData: { name: 'Test Customer' },
                items: [{ name: 'Item 1', quantity: 2, total_price: 100.00 }],
                payments: [{ amount: 100.00, payment_method: 'card' }]
            });

            assert.strictEqual(result.success, true);
        });

        it('should test WhatsApp configuration', async () => {
            service.config = {
                api_url: 'https://api.whatsapp.com',
                api_key: 'test-api-key',
                phone_number_id: '12345',
                from_number: '+1234567890'
            };

            axiosInstance.post.resolves({ data: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.HBgLM...' }] } });

            const result = await service.testMessage('+9876543210', 'Test message');

            assert.strictEqual(result.success, true);
        });
    });

    describe('Template Rendering', () => {
        it('should render WhatsApp template', async () => {
            const template = '{{order_number}} - {{total_amount}} - {{customer_name}}';
            const orderData = { order_number: 'ORD-001', total_amount: 100.00 };
            const customerData = { name: 'Test Customer' };
            const items = [{ name: 'Item 1', quantity: 2, total_price: 100.00 }];
            const payments = [{ amount: 100.00, payment_method: 'card' }];

            const result = service.renderWhatsAppTemplate(template, orderData, customerData, items, payments);

            assert(result.includes('ORD-001'));
            assert(result.includes('100.00'));
            assert(result.includes('Test Customer'));
        });

        it('should handle missing template variables', async () => {
            const template = '{{order_number}} - {{missing_variable}}';
            const orderData = { order_number: 'ORD-001' };

            const result = service.renderWhatsAppTemplate(template, orderData, null, [], []);

            assert(result.includes('ORD-001'));
            assert(result.includes('{{missing_variable}}'));
        });

        it('should create WhatsApp template parameters', async () => {
            const orderData = { order_number: 'ORD-001', total_amount: 100.00 };
            const customerData = { name: 'Test Customer' };
            const items = [{ name: 'Item 1', quantity: 2, total_price: 100.00 }];
            const payments = [{ amount: 100.00, payment_method: 'card' }];

            const result = service.createWhatsAppTemplateParameters(orderData, customerData, items, payments);

            assert.strictEqual(result.length, 4);
            assert.strictEqual(result[0].type, 'text');
            assert.strictEqual(result[0].text, 'ORD-001');
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

        it('should handle invalid message data', async () => {
            try {
                await service.sendMessage({});
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Recipient phone number is required');
            }
        });

        it('should handle API errors', async () => {
            service.config = {
                api_url: 'https://api.whatsapp.com',
                api_key: 'test-api-key',
                phone_number_id: '12345',
                from_number: '+1234567890'
            };

            axiosInstance.post.rejects(new Error('API error'));

            try {
                await service.sendMessage({
                    to: '+9876543210',
                    body: 'Test message'
                });
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'API error');
            }
        });

        it('should handle rate limiting', async () => {
            service.config = {
                api_url: 'https://api.whatsapp.com',
                api_key: 'test-api-key',
                phone_number_id: '12345',
                from_number: '+1234567890'
            };

            axiosInstance.post.rejects({
                response: {
                    data: {
                        error: {
                            code: 429,
                            message: 'Too many requests'
                        }
                    }
                }
            });

            try {
                await service.sendMessage({
                    to: '+9876543210',
                    body: 'Test message'
                });
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Too many requests');
            }
        });
    });

    describe('Utility Methods', () => {
        it('should format phone number', async () => {
            const result = service.formatPhoneNumber('+1234567890');
            assert.strictEqual(result, '+1234567890');
        });

        it('should format phone number without country code', async () => {
            const result = service.formatPhoneNumber('1234567890');
            assert.strictEqual(result, '1234567890');
        });

        it('should create message payload', async () => {
            const payload = service.createMessagePayload('+9876543210', 'Test message');

            assert.strictEqual(payload.messaging_product, 'whatsapp');
            assert.strictEqual(payload.to, '+9876543210');
            assert.strictEqual(payload.type, 'text');
            assert.strictEqual(payload.text.body, 'Test message');
        });

        it('should create template message payload', async () => {
            const template = {
                name: 'receipt_template',
                language: { code: 'en_US' },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: 'ORD-001' }
                        ]
                    }
                ]
            };

            const payload = service.createTemplateMessagePayload('+9876543210', template);

            assert.strictEqual(payload.messaging_product, 'whatsapp');
            assert.strictEqual(payload.to, '+9876543210');
            assert.strictEqual(payload.type, 'template');
            assert.strictEqual(payload.template.name, 'receipt_template');
        });
    });
});

module.exports = WhatsAppService;
