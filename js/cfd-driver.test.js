// Unit tests for Customer Facing Display (CFD) Driver
const assert = require('assert');
const { CFDDriver } = require('./cfd-driver');

// Mock database and logger
describe('CFDDriver', () => {
    let driver;
    let mockDb;
    let mockLogger;
    
    beforeEach(() => {
        mockDb = {
            prepare: () => ({
                all: () => [],
                run: () => {},
                get: () => null
            }),
            query: () => ({ rows: [] })
        };
        
        mockLogger = {
            info: () => {},
            error: () => {},
            debug: () => {}
        };
        
        driver = new CFDDriver(mockDb, mockLogger);
    });
    
    describe('Initialization', () => {
        it('should initialize with database and logger', () => {
            assert.strictEqual(driver.db, mockDb);
            assert.strictEqual(driver.logger, mockLogger);
        });
    });
    
    describe('Content Formatting', () => {
        it('should format order information', () => {
            const order = {
                id: 1,
                table: 'Table 5',
                items: [
                    { name: 'Coffee', quantity: 2, price: 3.50 },
                    { name: 'Sandwich', quantity: 1, price: 5.00 }
                ],
                total: 12.00
            };
            
            const result = driver.formatOrderInfo(order);
            assert.strictEqual(result.content_type, 'order_info');
            assert.strictEqual(result.content_data.table, 'Table 5');
            assert.strictEqual(result.content_data.items.length, 2);
        });
        
        it('should format payment information', () => {
            const payment = {
                amount: 12.00,
                method: 'card',
                transaction_id: 'TXN12345',
                change: 0.00
            };
            
            const result = driver.formatPaymentInfo(payment);
            assert.strictEqual(result.content_type, 'payment_info');
            assert.strictEqual(result.content_data.amount, 12.00);
            assert.strictEqual(result.content_data.method, 'card');
        });
        
        it('should format loyalty points', () => {
            const loyalty = {
                customer_name: 'John Doe',
                points: 150,
                redeemed: 50,
                remaining: 100
            };
            
            const result = driver.formatLoyaltyPoints(loyalty);
            assert.strictEqual(result.content_type, 'loyalty');
            assert.strictEqual(result.content_data.customer_name, 'John Doe');
            assert.strictEqual(result.content_data.points, 150);
        });
        
        it('should format promotional message', () => {
            const promo = {
                message: 'Buy 1 Get 1 Free!',
                duration: 30
            };
            
            const result = driver.formatPromotionalMessage(promo);
            assert.strictEqual(result.content_type, 'promotion');
            assert.strictEqual(result.content_data.message, 'Buy 1 Get 1 Free!');
        });
        
        it('should format custom content', () => {
            const custom = {
                html: '<h1>Welcome</h1>',
                duration: 10
            };
            
            const result = driver.formatCustomContent(custom);
            assert.strictEqual(result.content_type, 'custom');
            assert.strictEqual(result.content_data.html, '<h1>Welcome</h1>');
        });
    });
    
    describe('Content Management', () => {
        it('should create CFD content', async () => {
            mockDb.prepare = () => ({
                run: () => ({ lastInsertRowid: 1 })
            });
            
            const result = await driver.createCFDContent({
                device_id: 1,
                content_type: 'order_info',
                content_data: { table: 'Table 5' },
                display_duration: 30
            });
            
            assert.strictEqual(result.id, 1);
        });
        
        it('should get CFD content by device ID', async () => {
            mockDb.prepare = () => ({
                get: () => ({
                    id: 1,
                    device_id: 1,
                    content_type: 'order_info',
                    content_data: JSON.stringify({ table: 'Table 5' }),
                    display_duration: 30
                })
            });
            
            const result = await driver.getCFDContent(1);
            assert.strictEqual(result.device_id, 1);
            assert.strictEqual(result.content_type, 'order_info');
        });
        
        it('should update CFD content', async () => {
            mockDb.prepare = () => ({
                run: () => {}
            });
            
            await driver.updateCFDContent(1, {
                content_type: 'payment_info',
                content_data: { amount: 12.00 },
                display_duration: 20
            });
            // Should not throw
        });
        
        it('should clear CFD content', async () => {
            mockDb.prepare = () => ({
                run: () => {}
            });
            
            await driver.clearCFDContent(1);
            // Should not throw
        });
    });
    
    describe('Connection Management', () => {
        it('should test device connection', async () => {
            mockDb.prepare = () => ({
                get: () => ({ status: 'connected' })
            });
            
            const result = await driver.testDeviceConnection(1);
            assert.strictEqual(result.connected, true);
        });
        
        it('should send test message', async () => {
            mockDb.prepare = () => ({
                get: () => ({ status: 'connected' }),
                run: () => {}
            });
            
            const result = await driver.sendTestMessage(1);
            assert.strictEqual(result.success, true);
        });
        
        it('should handle connection errors', async () => {
            mockDb.prepare = () => ({
                get: () => ({ status: 'disconnected' })
            });
            
            const result = await driver.testDeviceConnection(1);
            assert.strictEqual(result.connected, false);
        });
    });
    
    describe('Device Management', () => {
        it('should get device configuration', async () => {
            mockDb.prepare = () => ({
                get: () => ({ config: JSON.stringify({ screen_size: '1080p' }) })
            });
            
            const result = await driver.getDeviceConfig(1);
            assert.deepStrictEqual(result, { screen_size: '1080p' });
        });
        
        it('should update device configuration', async () => {
            mockDb.prepare = () => ({
                run: () => {}
            });
            
            await driver.updateDeviceConfig(1, { screen_size: '720p' });
            // Should not throw
        });
        
        it('should get device status', async () => {
            mockDb.prepare = () => ({
                get: () => ({ status: 'connected', last_ping: '2024-01-01 12:00:00' })
            });
            
            const result = await driver.getDeviceStatus(1);
            assert.strictEqual(result.status, 'connected');
        });
        
        it('should update device status', async () => {
            mockDb.prepare = () => ({
                run: () => {}
            });
            
            await driver.updateDeviceStatus(1, 'disconnected');
            // Should not throw
        });
    });
    
    describe('Error Handling', () => {
        it('should handle database errors', async () => {
            mockDb.prepare = () => ({
                get: () => { throw new Error('Database error'); }
            });
            
            try {
                await driver.getCFDContent(1);
                assert.fail('Should have thrown');
            } catch (error) {
                assert.strictEqual(error.message, 'Database error');
            }
        });
        
        it('should handle invalid content data', () => {
            try {
                driver.formatOrderInfo(null);
                assert.fail('Should have thrown');
            } catch (error) {
                assert.strictEqual(error.message, 'Order data is required');
            }
        });
    });
});
