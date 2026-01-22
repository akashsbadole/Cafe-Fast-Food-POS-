/**
 * Hardware Manager - Manages ESC/POS printers and Customer Facing Displays
 * 
 * @module hardware-manager
 */

const database = require('./database');
const logger = require('./logger');
const ESCPOSDriver = require('./escpos-driver');
const CFDDriver = require('./cfd-driver');

class HardwareManager {
    /**
     * Initialize Hardware Manager
     */
    constructor() {
        this.database = database;
        this.logger = logger;
        this.devices = {};
        this.drivers = {};
        this.printQueue = [];
        this.isProcessingQueue = false;
        this.cfdContentCache = {};
        this.deviceStatusInterval = null;
    }

    /**
     * Initialize hardware manager and discover devices
     */
    async initialize() {
        this.logger.info('Initializing Hardware Manager');
        await this.loadDevices();
        await this.startStatusMonitoring();
        this.processPrintQueue();
    }

    /**
     * Load devices from database
     */
    async loadDevices() {
        try {
            const devices = await this.database.query(
                'SELECT * FROM hardware_devices WHERE is_active = 1'
            );
            
            devices.forEach(device => {
                this.devices[device.id] = device;
                this.logger.info(`Loaded device: ${device.device_name} (${device.device_type})`);
            });
            
            this.logger.info(`Loaded ${devices.length} active hardware devices`);
        } catch (error) {
            this.logger.error('Failed to load devices', error);
        }
    }

    /**
     * Register a new hardware device
     * @param {Object} deviceData - Device information
     * @returns {Object} Registered device
     */
    async registerDevice(deviceData) {
        try {
            const { device_type, device_name, device_identifier, connection_type, 
                    connection_string, device_model, manufacturer, serial_number, 
                    ip_address, port, baud_rate, paper_size, character_set } = deviceData;
            
            const existing = await this.database.query(
                'SELECT * FROM hardware_devices WHERE device_identifier = ?',
                [device_identifier]
            );
            
            if (existing.length > 0) {
                throw new Error('Device with this identifier already exists');
            }
            
            const result = await this.database.insert(
                'hardware_devices', {
                    device_type,
                    device_name,
                    device_identifier,
                    connection_type,
                    connection_string,
                    device_model,
                    manufacturer,
                    serial_number,
                    ip_address,
                    port,
                    baud_rate,
                    paper_size,
                    character_set,
                    status: 'disconnected'
                }
            );
            
            const device = await this.database.get(
                'hardware_devices', result.lastID
            );
            
            this.devices[device.id] = device;
            this.logger.info(`Registered new device: ${device_name} (${device_type})`);
            
            return device;
        } catch (error) {
            this.logger.error('Failed to register device', error);
            throw error;
        }
    }

    /**
     * Update device configuration
     * @param {number} deviceId - Device ID
     * @param {Object} config - Configuration key-value pairs
     */
    async updateDeviceConfig(deviceId, config) {
        try {
            const device = this.devices[deviceId];
            if (!device) {
                throw new Error('Device not found');
            }
            
            // Update in database
            for (const [key, value] of Object.entries(config)) {
                await this.database.upsert(
                    'hardware_device_configs',
                    { device_id: deviceId, config_key: key, config_value: value }
                );
            }
            
            // Update device properties
            Object.assign(device, config);
            
            this.logger.info(`Updated config for device ${deviceId}`);
        } catch (error) {
            this.logger.error('Failed to update device config', error);
            throw error;
        }
    }

    /**
     * Get device configuration
     * @param {number} deviceId - Device ID
     * @returns {Object} Device configuration
     */
    async getDeviceConfig(deviceId) {
        try {
            const configs = await this.database.query(
                'SELECT config_key, config_value FROM hardware_device_configs WHERE device_id = ?',
                [deviceId]
            );
            
            return configs.reduce((acc, { config_key, config_value }) => {
                acc[config_key] = config_value;
                return acc;
            }, {});
        } catch (error) {
            this.logger.error('Failed to get device config', error);
            throw error;
        }
    }

    /**
     * Get ESC/POS printer driver
     * @param {number} deviceId - Device ID
     * @returns {ESCPOSDriver} ESC/POS Driver instance
     */
    getESCPOSDriver(deviceId) {
        if (!this.drivers[deviceId]) {
            const device = this.devices[deviceId];
            if (!device || device.device_type !== 'escpos_printer') {
                throw new Error('Invalid ESC/POS printer device');
            }
            
            this.drivers[deviceId] = new ESCPOSDriver(device);
        }
        
        return this.drivers[deviceId];
    }

    /**
     * Get CFD driver
     * @param {number} deviceId - Device ID
     * @returns {CFDDriver} CFD Driver instance
     */
    getCFDDriver(deviceId) {
        if (!this.drivers[deviceId]) {
            const device = this.devices[deviceId];
            if (!device || device.device_type !== 'cfd_display') {
                throw new Error('Invalid CFD display device');
            }
            
            this.drivers[deviceId] = new CFDDriver(device);
        }
        
        return this.drivers[deviceId];
    }

    /**
     * Print receipt using ESC/POS printer
     * @param {number} deviceId - Device ID
     * @param {Object} receiptData - Receipt data
     * @param {number} [copies=1] - Number of copies
     */
    async printReceipt(deviceId, receiptData, copies = 1) {
        try {
            const driver = this.getESCPOSDriver(deviceId);
            const jobId = await this.createPrintJob(deviceId, 'receipt', receiptData);
            
            await driver.printReceipt(receiptData, copies);
            
            await this.updatePrintJobStatus(jobId, 'completed');
            this.logger.info(`Print job ${jobId} completed for device ${deviceId}`);
        } catch (error) {
            this.logger.error(`Failed to print receipt on device ${deviceId}`, error);
            throw error;
        }
    }

    /**
     * Print KOT (Kitchen Order Ticket)
     * @param {number} deviceId - Device ID
     * @param {Object} kotData - KOT data
     */
    async printKOT(deviceId, kotData) {
        try {
            const driver = this.getESCPOSDriver(deviceId);
            const jobId = await this.createPrintJob(deviceId, 'kot', kotData);
            
            await driver.printKOT(kotData);
            
            await this.updatePrintJobStatus(jobId, 'completed');
            this.logger.info(`KOT print job ${jobId} completed for device ${deviceId}`);
        } catch (error) {
            this.logger.error(`Failed to print KOT on device ${deviceId}`, error);
            throw error;
        }
    }

    /**
     * Display content on CFD
     * @param {number} deviceId - Device ID
     * @param {Object} contentData - Content data
     */
    async displayOnCFD(deviceId, contentData) {
        try {
            const driver = this.getCFDDriver(deviceId);
            
            // Cache content for this device
            this.cfdContentCache[deviceId] = contentData;
            
            await driver.displayContent(contentData);
            this.logger.info(`Displayed content on CFD device ${deviceId}`);
        } catch (error) {
            this.logger.error(`Failed to display content on CFD device ${deviceId}`, error);
            throw error;
        }
    }

    /**
     * Create a print job record
     * @param {number} deviceId - Device ID
     * @param {string} jobType - Job type (receipt, kot, label, report)
     * @param {Object} content - Job content
     * @returns {number} Print job ID
     */
    async createPrintJob(deviceId, jobType, content) {
        try {
            const result = await this.database.insert(
                'print_jobs', {
                    device_id: deviceId,
                    job_type: jobType,
                    status: 'pending',
                    content: JSON.stringify(content),
                    content_type: 'application/json'
                }
            );
            
            return result.lastID;
        } catch (error) {
            this.logger.error('Failed to create print job', error);
            throw error;
        }
    }

    /**
     * Update print job status
     * @param {number} jobId - Print job ID
     * @param {string} status - New status
     * @param {string} [errorMessage] - Error message if failed
     */
    async updatePrintJobStatus(jobId, status, errorMessage = null) {
        try {
            const updateData = { status };
            if (errorMessage) {
                updateData.error_message = errorMessage;
            }
            if (status === 'completed') {
                updateData.completed_at = new Date().toISOString();
            }
            
            await this.database.update(
                'print_jobs',
                jobId,
                updateData
            );
        } catch (error) {
            this.logger.error('Failed to update print job status', error);
            throw error;
        }
    }

    /**
     * Start device status monitoring
     */
    async startStatusMonitoring() {
        if (this.deviceStatusInterval) {
            clearInterval(this.deviceStatusInterval);
        }
        
        // Check status every 30 seconds
        this.deviceStatusInterval = setInterval(async () => {
            try {
                for (const deviceId in this.devices) {
                    const device = this.devices[deviceId];
                    
                    if (device.device_type === 'escpos_printer') {
                        const driver = this.getESCPOSDriver(deviceId);
                        const status = await driver.getStatus();
                        
                        await this.database.insert('hardware_device_status', {
                            device_id: deviceId,
                            status: status.status,
                            status_details: JSON.stringify(status.details),
                            paper_level: status.paper_level,
                            ink_level: status.ink_level,
                            error_code: status.error_code,
                            last_ping: new Date().toISOString()
                        });
                        
                        // Update device status
                        device.status = status.status;
                        device.last_seen = new Date().toISOString();
                    }
                }
            } catch (error) {
                this.logger.error('Status monitoring error', error);
            }
        }, 30000);
    }

    /**
     * Process print queue
     */
    async processPrintQueue() {
        if (this.isProcessingQueue) return;
        
        this.isProcessingQueue = true;
        
        while (this.printQueue.length > 0) {
            const job = this.printQueue[0];
            
            try {
                const device = this.devices[job.deviceId];
                if (!device || device.status !== 'connected') {
                    this.printQueue.shift();
                    continue;
                }
                
                const driver = this.getESCPOSDriver(job.deviceId);
                await driver.printRaw(job.content);
                
                await this.updatePrintJobStatus(job.id, 'completed');
                this.printQueue.shift();
            } catch (error) {
                this.logger.error(`Failed to process print job ${job.id}`, error);
                
                // Retry up to 3 times
                if (job.retryCount < 3) {
                    job.retryCount++;
                    // Move to end of queue for retry
                    this.printQueue.push(this.printQueue.shift());
                } else {
                    await this.updatePrintJobStatus(job.id, 'failed', error.message);
                    this.printQueue.shift();
                }
            }
        }
        
        this.isProcessingQueue = false;
    }

    /**
     * Get device status
     * @param {number} deviceId - Device ID
     * @returns {Object} Device status
     */
    async getDeviceStatus(deviceId) {
        try {
            const device = this.devices[deviceId];
            if (!device) {
                throw new Error('Device not found');
            }
            
            const status = await this.database.query(
                'SELECT * FROM hardware_device_status WHERE device_id = ? ORDER BY created_at DESC LIMIT 1',
                [deviceId]
            );
            
            return {
                ...device,
                ...(status[0] || {})
            };
        } catch (error) {
            this.logger.error('Failed to get device status', error);
            throw error;
        }
    }

    /**
     * Get hardware usage report
     * @param {Object} [options] - Report options
     * @param {string} [options.startDate] - Start date
     * @param {string} [options.endDate] - End date
     * @param {string} [options.deviceType] - Device type filter
     * @returns {Object} Usage report
     */
    async getUsageReport(options = {}) {
        try {
            const { startDate, endDate, deviceType } = options;
            
            let query = `SELECT
                hd.device_type,
                hd.device_name,
                COUNT(pj.id) as total_jobs,
                SUM(CASE WHEN pj.status = "completed" THEN 1 ELSE 0 END) as completed_jobs,
                SUM(CASE WHEN pj.status = "failed" THEN 1 ELSE 0 END) as failed_jobs,
                SUM(CASE WHEN pj.job_type = "receipt" THEN 1 ELSE 0 END) as receipt_count,
                SUM(CASE WHEN pj.job_type = "kot" THEN 1 ELSE 0 END) as kot_count
                FROM hardware_devices hd
                LEFT JOIN print_jobs pj ON hd.id = pj.device_id`;
            
            const params = [];
            
            if (startDate || endDate) {
                query += ' WHERE pj.created_at BETWEEN ? AND ?';
                params.push(startDate || '1970-01-01');
                params.push(endDate || '2999-12-31');
            }
            
            if (deviceType) {
                if (params.length > 0) {
                    query += ' AND hd.device_type = ?';
                } else {
                    query += ' WHERE hd.device_type = ?';
                }
                params.push(deviceType);
            }
            
            query += ' GROUP BY hd.id, hd.device_type, hd.device_name';
            
            const results = await this.database.query(query, params);
            
            return {
                totalDevices: results.length,
                devices: results,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error('Failed to generate usage report', error);
            throw error;
        }
    }

    /**
     * Log device event
     * @param {number} deviceId - Device ID
     * @param {string} logLevel - Log level (info, warning, error, debug)
     * @param {string} message - Log message
     * @param {Object} [details] - Additional details
     */
    async logDeviceEvent(deviceId, logLevel, message, details = {}) {
        try {
            await this.database.insert('hardware_device_logs', {
                device_id: deviceId,
                log_level: logLevel,
                message: message,
                details: JSON.stringify(details)
            });
        } catch (error) {
            this.logger.error('Failed to log device event', error);
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.deviceStatusInterval) {
            clearInterval(this.deviceStatusInterval);
        }
        
        for (const deviceId in this.drivers) {
            const driver = this.drivers[deviceId];
            if (driver && typeof driver.disconnect === 'function') {
                driver.disconnect();
            }
        }
    }
}

// Export singleton instance
const hardwareManager = new HardwareManager();

module.exports = hardwareManager;
