// Unit tests for ESC/POS Driver
const assert = require('assert');
const { ESCPOSDriver } = require('./escpos-driver');

// Mock database and logger
describe('ESCPOSDriver', () => {
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
        
        driver = new ESCPOSDriver(mockDb, mockLogger);
    });
    
    describe('Initialization', () => {
        it('should initialize with database and logger', () => {
            assert.strictEqual(driver.db, mockDb);
            assert.strictEqual(driver.logger, mockLogger);
        });
    });
    
    describe('Text Formatting', () => {
        it('should format text as bold', () => {
            const result = driver.textBold('Hello');
            assert.strictEqual(result, '\x1B\x45\x1B\x46Hello\x1B\x45\x1B\x46');
        });
        
        it('should format text as italic', () => {
            const result = driver.textItalic('Hello');
            assert.strictEqual(result, '\x1B\x34\x1B\x35Hello\x1B\x34\x1B\x35');
        });
        
        it('should format text as underline', () => {
            const result = driver.textUnderline('Hello');
            assert.strictEqual(result, '\x1B\x2D\x1B\x2EHello\x1B\x2D\x1B\x2E');
        });
        
        it('should format text with multiple styles', () => {
            const result = driver.textBoldItalicUnderline('Hello');
            assert.strictEqual(result, '\x1B\x45\x1B\x46\x1B\x34\x1B\x35\x1B\x2D\x1B\x2EHello\x1B\x2D\x1B\x2E\x1B\x34\x1B\x35\x1B\x45\x1B\x46');
        });
        
        it('should format text with alignment', () => {
            const result = driver.textAlign('Hello', 'center');
            assert.strictEqual(result, '\x1B\x61\x01Hello\x1B\x61\x00');
        });
        
        it('should format text with font size', () => {
            const result = driver.textSize('Hello', 2, 2);
            assert.strictEqual(result, '\x1B\x21\x10Hello\x1B\x21\x00');
        });
    });
    
    describe('Barcode Generation', () => {
        it('should generate UPC-A barcode', () => {
            const result = driver.generateBarcode('123456789012', 'UPC-A');
            assert.strictEqual(result, '\x1D\x6B\x41\x00\x30\x31\x32\x33\x34\x35\x36\x37\x38\x39\x30\x31\x32\x00');
        });
        
        it('should generate QR code', () => {
            const result = driver.generateQRCode('https://example.com', 5, 'M');
            assert.strictEqual(result, '\x1D\x28\x6B\x03\x00\x31\x39\x30\x00\x03https://example.com\x1D\x28\x6B\x00');
        });
    });
    
    describe('Image Handling', () => {
        it('should format image data', () => {
            const mockImageData = Buffer.from([0x12, 0x34, 0x56]);
            const result = driver.formatImage(mockImageData, 80, 40);
            assert.strictEqual(result, '\x1D\x76\x30\x00\x1D\x2F\x00\x1D\x6B\x00\x12\x34\x56\x1D\x6B\x00');
        });
    });
    
    describe('Printer Control', () => {
        it('should generate cut paper command', () => {
            const result = driver.cutPaper();
            assert.strictEqual(result, '\x1D\x56\x42\x00');
        });
        
        it('should generate open cash drawer command', () => {
            const result = driver.openCashDrawer();
            assert.strictEqual(result, '\x1B\x70\x00\x1B\x6D\x00');
        });
        
        it('should generate feed paper command', () => {
            const result = driver.feedPaper(5);
            assert.strictEqual(result, '\x1B\x4A\x05');
        });
    });
    
    describe('Print Job Management', () => {
        it('should create a print job', async () => {
            mockDb.prepare = () => ({
                run: () => ({ lastInsertRowid: 1 })
            });
            
            const result = await driver.createPrintJob({
                device_id: 1,
                job_type: 'receipt',
                content: 'Test content',
                copies: 1,
                priority: false
            });
            
            assert.strictEqual(result.id, 1);
        });
        
        it('should get print job by ID', async () => {
            mockDb.prepare = () => ({
                get: () => ({ id: 1, device_id: 1, job_type: 'receipt', status: 'pending' })
            });
            
            const result = await driver.getPrintJob(1);
            assert.strictEqual(result.id, 1);
        });
        
        it('should update print job status', async () => {
            mockDb.prepare = () => ({
                run: () => {}
            });
            
            await driver.updatePrintJobStatus(1, 'completed');
            // Should not throw
        });
        
        it('should retry failed print job', async () => {
            mockDb.prepare = () => ({
                get: () => ({ id: 1, device_id: 1, job_type: 'receipt', status: 'failed', retry_count: 0 }),
                run: () => {}
            });
            
            await driver.retryPrintJob(1);
            // Should not throw
        });
        
        it('should cancel print job', async () => {
            mockDb.prepare = () => ({
                run: () => {}
            });
            
            await driver.cancelPrintJob(1);
            // Should not throw
        });
    });
    
    describe('Device Management', () => {
        it('should get device configuration', async () => {
            mockDb.prepare = () => ({
                get: () => ({ config: JSON.stringify({ paper_size: '80mm' }) })
            });
            
            const result = await driver.getDeviceConfig(1);
            assert.deepStrictEqual(result, { paper_size: '80mm' });
        });
        
        it('should update device configuration', async () => {
            mockDb.prepare = () => ({
                run: () => {}
            });
            
            await driver.updateDeviceConfig(1, { paper_size: '58mm' });
            // Should not throw
        });
        
        it('should get device status', async () => {
            mockDb.prepare = () => ({
                get: () => ({ status: 'connected', paper_level: 'normal' })
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
                await driver.getPrintJob(1);
                assert.fail('Should have thrown');
            } catch (error) {
                assert.strictEqual(error.message, 'Database error');
            }
        });
    });
});
