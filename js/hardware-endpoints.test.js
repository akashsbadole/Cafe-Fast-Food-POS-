// Integration tests for Hardware API Endpoints
const assert = require('assert');
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Import the router
const router = require('./enterprise-endpoints');

// Mock database and managers
let mockDb;
let mockHardwareManager;
let mockReportingManager;

// Create test app
function createTestApp() {
    const app = express();
    app.use(express.json());
    
    // Mock dependencies
    mockDb = {
        prepare: () => ({
            all: () => [],
            run: () => ({ lastInsertRowid: 1 }),
            get: () => null
        }),
        query: () => ({ rows: [] })
    };
    
    mockReportingManager = {
        logAudit: async () => {},
        getHardwareDeviceSummary: async () => ({ totalDevices: 0, devices: [] }),
        getPrinterUsageReport: async () => [],
        getCFDUsageReport: async () => [],
        getPrintJobHistory: async () => [],
        getDeviceStatusHistory: async () => [],
        getHardwareErrorReport: async () => [],
        getHardwareConnectivityReport: async () => [],
        getHardwareDailyActivityReport: async () => []
    };
    
    mockHardwareManager = {
        init: async () => {},
        getAllDevices: async () => [],
        getDeviceById: async () => null,
        createDevice: async (data) => ({ id: 1, ...data }),
        updateDevice: async (id, data) => ({ id, ...data }),
        deleteDevice: async () => {},
        getDeviceConfig: async () => ({}),
        updateDeviceConfig: async () => ({}),
        getDeviceStatus: async () => ({}),
        getAllDeviceStatuses: async () => [],
        testDeviceConnection: async () => ({ success: true }),
        getDeviceLogs: async () => [],
        clearDeviceLogs: async () => {},
        getPrinters: async () => [],
        getPrinterById: async () => null,
        testPrinterConnection: async () => ({ success: true }),
        printTestPage: async () => ({ success: true }),
        getPrintJobs: async () => [],
        createPrintJob: async (data) => ({ id: 1, ...data }),
        getPrintJob: async () => null,
        retryPrintJob: async () => ({ success: true }),
        cancelPrintJob: async () => ({ success: true }),
        getCFDs: async () => [],
        getCFDById: async () => null,
        testCFDConnection: async () => ({ success: true }),
        sendTestMessageToCFD: async () => ({ success: true }),
        getCFDContent: async () => ({}),
        updateCFDContent: async () => ({ success: true }),
        clearCFDContent: async () => ({ success: true })
    };
    
    // Mock modules
    jest.mock('./database', () => ({
        getDatabase: () => mockDb
    }));
    
    jest.mock('./logger', () => ({
        info: () => {},
        error: () => {},
        debug: () => {}
    }));
    
    jest.mock('./reporting-manager', () => mockReportingManager);
    jest.mock('./hardware-manager', () => mockHardwareManager);
    
    // Use the router
    app.use(router);
    
    return app;
}

describe('Hardware API Endpoints', () => {
    let app;
    let token;
    
    beforeEach(() => {
        app = createTestApp();
        
        // Create JWT token for authentication
        token = jwt.sign(
            { id: 1, username: 'testuser', permissions: ['manage_settings', 'view_reports', 'manage_orders'] },
            'cafe-pos-secret',
            { expiresIn: '1h' }
        );
    });
    
    describe('GET /api/hardware/devices', () => {
        it('should return list of hardware devices', async () => {
            mockHardwareManager.getAllDevices = async () => [
                { id: 1, device_name: 'Printer 1', device_type: 'escpos_printer' },
                { id: 2, device_name: 'CFD 1', device_type: 'cfd_display' }
            ];
            
            const res = await request(app)
                .get('/api/hardware/devices')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.length, 2);
        });
        
        it('should filter devices by type', async () => {
            mockHardwareManager.getAllDevices = async (filters) => {
                if (filters.deviceType === 'escpos_printer') {
                    return [{ id: 1, device_name: 'Printer 1', device_type: 'escpos_printer' }];
                }
                return [];
            };
            
            const res = await request(app)
                .get('/api/hardware/devices?deviceType=escpos_printer')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.length, 1);
        });
    });
    
    describe('GET /api/hardware/devices/:id', () => {
        it('should return a single device', async () => {
            mockHardwareManager.getDeviceById = async () => ({
                id: 1,
                device_name: 'Printer 1',
                device_type: 'escpos_printer',
                device_identifier: '/dev/usb/lp0'
            });
            
            const res = await request(app)
                .get('/api/hardware/devices/1')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.id, 1);
        });
        
        it('should return 404 for non-existent device', async () => {
            mockHardwareManager.getDeviceById = async () => null;
            
            const res = await request(app)
                .get('/api/hardware/devices/999')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 404);
        });
    });
    
    describe('POST /api/hardware/devices', () => {
        it('should create a new device', async () => {
            mockHardwareManager.createDevice = async (data) => ({
                id: 1,
                ...data
            });
            
            const res = await request(app)
                .post('/api/hardware/devices')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    device_name: 'Test Printer',
                    device_type: 'escpos_printer',
                    device_identifier: '/dev/usb/lp1',
                    connection_type: 'usb',
                    location_id: 1,
                    is_active: true,
                    config: { paper_size: '80mm' }
                });
            
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.device_name, 'Test Printer');
        });
        
        it('should return 400 for missing required fields', async () => {
            const res = await request(app)
                .post('/api/hardware/devices')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    device_name: 'Test Printer'
                    // Missing required fields
                });
            
            assert.strictEqual(res.status, 400);
        });
    });
    
    describe('PUT /api/hardware/devices/:id', () => {
        it('should update a device', async () => {
            mockHardwareManager.getDeviceById = async () => ({ id: 1, device_name: 'Old Name' });
            mockHardwareManager.updateDevice = async (id, data) => ({
                id,
                ...data
            });
            
            const res = await request(app)
                .put('/api/hardware/devices/1')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    device_name: 'Updated Printer',
                    is_active: false
                });
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.device_name, 'Updated Printer');
        });
        
        it('should return 404 for non-existent device', async () => {
            mockHardwareManager.getDeviceById = async () => null;
            
            const res = await request(app)
                .put('/api/hardware/devices/999')
                .set('Authorization', `Bearer ${token}`)
                .send({ device_name: 'Updated' });
            
            assert.strictEqual(res.status, 404);
        });
    });
    
    describe('DELETE /api/hardware/devices/:id', () => {
        it('should delete a device', async () => {
            mockHardwareManager.getDeviceById = async () => ({ id: 1, device_name: 'Test Printer' });
            mockHardwareManager.deleteDevice = async () => {};
            
            const res = await request(app)
                .delete('/api/hardware/devices/1')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Hardware device deleted successfully');
        });
        
        it('should return 404 for non-existent device', async () => {
            mockHardwareManager.getDeviceById = async () => null;
            
            const res = await request(app)
                .delete('/api/hardware/devices/999')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 404);
        });
    });
    
    describe('GET /api/hardware/devices/:id/config', () => {
        it('should return device configuration', async () => {
            mockHardwareManager.getDeviceConfig = async () => ({
                paper_size: '80mm',
                character_set: 'UTF-8'
            });
            
            const res = await request(app)
                .get('/api/hardware/devices/1/config')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.paper_size, '80mm');
        });
    });
    
    describe('PUT /api/hardware/devices/:id/config', () => {
        it('should update device configuration', async () => {
            mockHardwareManager.getDeviceConfig = async () => ({ paper_size: '80mm' });
            mockHardwareManager.updateDeviceConfig = async () => ({ paper_size: '58mm' });
            
            const res = await request(app)
                .put('/api/hardware/devices/1/config')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    config: {
                        paper_size: '58mm',
                        character_set: 'UTF-8'
                    }
                });
            
            assert.strictEqual(res.status, 200);
        });
    });
    
    describe('GET /api/hardware/devices/:id/status', () => {
        it('should return device status', async () => {
            mockHardwareManager.getDeviceStatus = async () => ({
                status: 'connected',
                paper_level: 'normal',
                last_ping: '2024-01-01 12:00:00'
            });
            
            const res = await request(app)
                .get('/api/hardware/devices/1/status')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.status, 'connected');
        });
    });
    
    describe('POST /api/hardware/devices/:id/test', () => {
        it('should test device connection', async () => {
            mockHardwareManager.testDeviceConnection = async () => ({
                success: true,
                message: 'Device is connected'
            });
            
            const res = await request(app)
                .post('/api/hardware/devices/1/test')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
        });
    });
    
    describe('GET /api/hardware/printers', () => {
        it('should return list of printers', async () => {
            mockHardwareManager.getPrinters = async () => [
                { id: 1, device_name: 'Printer 1', device_type: 'escpos_printer' },
                { id: 2, device_name: 'Printer 2', device_type: 'escpos_printer' }
            ];
            
            const res = await request(app)
                .get('/api/hardware/printers')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.length, 2);
        });
    });
    
    describe('POST /api/hardware/printers/:id/jobs', () => {
        it('should create a print job', async () => {
            mockHardwareManager.createPrintJob = async (data) => ({
                id: 1,
                ...data
            });
            
            const res = await request(app)
                .post('/api/hardware/printers/1/jobs')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    job_type: 'receipt',
                    content: 'Test receipt content',
                    copies: 1,
                    priority: false
                });
            
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.job_type, 'receipt');
        });
        
        it('should return 400 for missing required fields', async () => {
            const res = await request(app)
                .post('/api/hardware/printers/1/jobs')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    job_type: 'receipt'
                    // Missing content
                });
            
            assert.strictEqual(res.status, 400);
        });
    });
    
    describe('GET /api/hardware/print-jobs/:id', () => {
        it('should return a print job', async () => {
            mockHardwareManager.getPrintJob = async () => ({
                id: 1,
                device_id: 1,
                job_type: 'receipt',
                status: 'completed'
            });
            
            const res = await request(app)
                .get('/api/hardware/print-jobs/1')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.id, 1);
        });
        
        it('should return 404 for non-existent job', async () => {
            mockHardwareManager.getPrintJob = async () => null;
            
            const res = await request(app)
                .get('/api/hardware/print-jobs/999')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 404);
        });
    });
    
    describe('POST /api/hardware/print-jobs/:id/retry', () => {
        it('should retry a failed print job', async () => {
            mockHardwareManager.retryPrintJob = async () => ({
                success: true,
                message: 'Print job retried'
            });
            
            const res = await request(app)
                .post('/api/hardware/print-jobs/1/retry')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
        });
    });
    
    describe('POST /api/hardware/print-jobs/:id/cancel', () => {
        it('should cancel a print job', async () => {
            mockHardwareManager.cancelPrintJob = async () => ({
                success: true,
                message: 'Print job cancelled'
            });
            
            const res = await request(app)
                .post('/api/hardware/print-jobs/1/cancel')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
        });
    });
    
    describe('GET /api/hardware/cfds', () => {
        it('should return list of CFD displays', async () => {
            mockHardwareManager.getCFDs = async () => [
                { id: 1, device_name: 'CFD 1', device_type: 'cfd_display' },
                { id: 2, device_name: 'CFD 2', device_type: 'cfd_display' }
            ];
            
            const res = await request(app)
                .get('/api/hardware/cfds')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.length, 2);
        });
    });
    
    describe('GET /api/hardware/cfds/:id/content', () => {
        it('should return CFD content', async () => {
            mockHardwareManager.getCFDContent = async () => ({
                content_type: 'order_info',
                content_data: { table: 'Table 5' },
                display_duration: 30
            });
            
            const res = await request(app)
                .get('/api/hardware/cfds/1/content')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.content_type, 'order_info');
        });
    });
    
    describe('PUT /api/hardware/cfds/:id/content', () => {
        it('should update CFD content', async () => {
            mockHardwareManager.updateCFDContent = async () => ({
                success: true,
                message: 'Content updated'
            });
            
            const res = await request(app)
                .put('/api/hardware/cfds/1/content')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    content_type: 'payment_info',
                    content_data: { amount: 12.00 },
                    display_duration: 20
                });
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
        });
        
        it('should return 400 for missing required fields', async () => {
            const res = await request(app)
                .put('/api/hardware/cfds/1/content')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    content_type: 'payment_info'
                    // Missing content_data
                });
            
            assert.strictEqual(res.status, 400);
        });
    });
    
    describe('DELETE /api/hardware/cfds/:id/content', () => {
        it('should clear CFD content', async () => {
            mockHardwareManager.clearCFDContent = async () => ({
                success: true,
                message: 'Content cleared'
            });
            
            const res = await request(app)
                .delete('/api/hardware/cfds/1/content')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'CFD content cleared successfully');
        });
    });
    
    describe('Hardware Reports', () => {
        describe('GET /api/reports/hardware/device-summary', () => {
            it('should return hardware device summary', async () => {
                mockReportingManager.getHardwareDeviceSummary = async () => ({
                    totalDevices: 3,
                    devices: [
                        { type: 'escpos_printer', total: 2, connected: 2 },
                        { type: 'cfd_display', total: 1, connected: 1 }
                    ]
                });
                
                const res = await request(app)
                    .get('/api/reports/hardware/device-summary')
                    .set('Authorization', `Bearer ${token}`);
                
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.totalDevices, 3);
            });
        });
        
        describe('GET /api/reports/hardware/printer-usage', () => {
            it('should return printer usage report', async () => {
                mockReportingManager.getPrinterUsageReport = async () => [
                    {
                        device_id: 1,
                        device_name: 'Printer 1',
                        total_jobs: 100,
                        completed_jobs: 95,
                        failed_jobs: 5
                    }
                ];
                
                const res = await request(app)
                    .get('/api/reports/hardware/printer-usage?startDate=2024-01-01&endDate=2024-01-31')
                    .set('Authorization', `Bearer ${token}`);
                
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.length, 1);
            });
        });
        
        describe('GET /api/reports/hardware/cfd-usage', () => {
            it('should return CFD usage report', async () => {
                mockReportingManager.getCFDUsageReport = async () => [
                    {
                        device_id: 1,
                        device_name: 'CFD 1',
                        content_count: 50,
                        order_info_count: 30,
                        payment_info_count: 20
                    }
                ];
                
                const res = await request(app)
                    .get('/api/reports/hardware/cfd-usage?startDate=2024-01-01&endDate=2024-01-31')
                    .set('Authorization', `Bearer ${token}`);
                
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.length, 1);
            });
        });
        
        describe('GET /api/reports/hardware/print-jobs', () => {
            it('should return print job history', async () => {
                mockReportingManager.getPrintJobHistory = async () => [
                    {
                        job_id: 1,
                        device_id: 1,
                        device_name: 'Printer 1',
                        job_type: 'receipt',
                        status: 'completed'
                    }
                ];
                
                const res = await request(app)
                    .get('/api/reports/hardware/print-jobs?deviceId=1&limit=10')
                    .set('Authorization', `Bearer ${token}`);
                
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.length, 1);
            });
        });
        
        describe('GET /api/reports/hardware/device-status', () => {
            it('should return device status history', async () => {
                mockReportingManager.getDeviceStatusHistory = async () => [
                    {
                        status_id: 1,
                        device_id: 1,
                        device_name: 'Printer 1',
                        status: 'connected',
                        last_ping: '2024-01-01 12:00:00'
                    }
                ];
                
                const res = await request(app)
                    .get('/api/reports/hardware/device-status?deviceId=1&limit=10')
                    .set('Authorization', `Bearer ${token}`);
                
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.length, 1);
            });
        });
        
        describe('GET /api/reports/hardware/errors', () => {
            it('should return hardware error report', async () => {
                mockReportingManager.getHardwareErrorReport = async () => [
                    {
                        log_id: 1,
                        device_id: 1,
                        device_name: 'Printer 1',
                        log_level: 'error',
                        message: 'Paper jam detected'
                    }
                ];
                
                const res = await request(app)
                    .get('/api/reports/hardware/errors?limit=10')
                    .set('Authorization', `Bearer ${token}`);
                
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.length, 1);
            });
        });
        
        describe('GET /api/reports/hardware/connectivity', () => {
            it('should return hardware connectivity report', async () => {
                mockReportingManager.getHardwareConnectivityReport = async () => [
                    {
                        device_id: 1,
                        device_name: 'Printer 1',
                        device_type: 'escpos_printer',
                        uptime_percentage: 95.5
                    }
                ];
                
                const res = await request(app)
                    .get('/api/reports/hardware/connectivity')
                    .set('Authorization', `Bearer ${token}`);
                
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.length, 1);
            });
        });
        
        describe('GET /api/reports/hardware/daily-activity', () => {
            it('should return hardware daily activity report', async () => {
                mockReportingManager.getHardwareDailyActivityReport = async () => [
                    {
                        device_type: 'escpos_printer',
                        device_count: 2,
                        connected_devices: 2,
                        print_jobs: 50
                    }
                ];
                
                const res = await request(app)
                    .get('/api/reports/hardware/daily-activity?date=2024-01-01')
                    .set('Authorization', `Bearer ${token}`);
                
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.length, 1);
            });
            
            it('should return 400 for missing date', async () => {
                const res = await request(app)
                    .get('/api/reports/hardware/daily-activity')
                    .set('Authorization', `Bearer ${token}`);
                
                assert.strictEqual(res.status, 400);
            });
        });
    });
});
