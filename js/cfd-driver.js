/**
 * Customer Facing Display (CFD) Driver
 * 
 * Handles communication with customer facing displays
 * 
 * @module cfd-driver
 */

const { Logger } = require('./logger');
const net = require('net');
const WebSocket = require('ws');

class CFDDriver {
    /**
     * Initialize CFD Driver
     * @param {Object} device - Device configuration
     */
    constructor(device) {
        this.device = device;
        this.logger = new Logger(`CFD-${device.device_name}`);
        this.connection = null;
        this.isConnected = false;
        this.currentContent = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.heartbeatInterval = null;
    }

    /**
     * Connect to the CFD
     */
    async connect() {
        try {
            this.logger.info(`Connecting to ${this.device.device_name} (${this.device.connection_type})`);
            
            switch (this.device.connection_type) {
                case 'network':
                    await this.connectNetwork();
                    break;
                case 'websocket':
                    await this.connectWebSocket();
                    break;
                case 'serial':
                    await this.connectSerial();
                    break;
                default:
                    throw new Error(`Unsupported connection type: ${this.device.connection_type}`);
            }
            
            this.isConnected = true;
            this.device.status = 'connected';
            this.retryCount = 0;
            
            // Start heartbeat
            this.startHeartbeat();
            
            this.logger.info(`Connected to ${this.device.device_name}`);
        } catch (error) {
            this.logger.error(`Connection failed: ${error.message}`);
            this.isConnected = false;
            this.device.status = 'disconnected';
            
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                this.logger.info(`Retrying connection (${this.retryCount}/${this.maxRetries})...`);
                setTimeout(() => this.connect(), 5000);
            }
            
            throw error;
        }
    }

    /**
     * Connect via network (TCP/IP)
     */
    async connectNetwork() {
        return new Promise((resolve, reject) => {
            this.connection = net.createConnection({
                host: this.device.ip_address,
                port: this.device.port || 8080
            }, () => {
                this.logger.info(`Network connection established to ${this.device.ip_address}:${this.device.port}`);
                
                // Set up event handlers
                this.setupConnectionHandlers();
                
                resolve();
            });
            
            this.connection.on('error', (err) => {
                reject(new Error(`Network connection error: ${err.message}`));
            });
        });
    }

    /**
     * Connect via WebSocket
     */
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            const wsUrl = `ws://${this.device.ip_address}:${this.device.port || 8080}/ws`;
            this.connection = new WebSocket(wsUrl);
            
            this.connection.on('open', () => {
                this.logger.info(`WebSocket connection established to ${wsUrl}`);
                
                // Set up event handlers
                this.setupWebSocketHandlers();
                
                resolve();
            });
            
            this.connection.on('error', (err) => {
                reject(new Error(`WebSocket connection error: ${err.message}`));
            });
        });
    }

    /**
     * Connect via Serial
     */
    async connectSerial() {
        const serialport = require('serialport');
        
        return new Promise((resolve, reject) => {
            this.connection = new serialport(this.device.connection_string, {
                baudRate: this.device.baud_rate || 9600,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                flowControl: false,
                autoOpen: false
            });
            
            this.connection.on('error', (err) => {
                reject(new Error(`Serial connection error: ${err.message}`));
            });
            
            this.connection.open((err) => {
                if (err) {
                    reject(new Error(`Failed to open serial port: ${err.message}`));
                    return;
                }
                
                this.logger.info('Serial connection established');
                
                // Set up event handlers
                this.setupConnectionHandlers();
                
                resolve();
            });
        });
    }

    /**
     * Set up connection event handlers
     */
    setupConnectionHandlers() {
        this.connection.on('close', () => {
            this.logger.info('Connection closed');
            this.isConnected = false;
            this.device.status = 'disconnected';
        });
        
        this.connection.on('error', (err) => {
            this.logger.error('Connection error:', err);
            this.isConnected = false;
            this.device.status = 'error';
        });
    }

    /**
     * Set up WebSocket event handlers
     */
    setupWebSocketHandlers() {
        this.connection.on('close', () => {
            this.logger.info('WebSocket connection closed');
            this.isConnected = false;
            this.device.status = 'disconnected';
        });
        
        this.connection.on('error', (err) => {
            this.logger.error('WebSocket error:', err);
            this.isConnected = false;
            this.device.status = 'error';
        });
        
        this.connection.on('message', (message) => {
            try {
                const data = typeof message === 'string' ? JSON.parse(message) : message;
                this.logger.debug('Received message:', data);
                
                // Handle acknowledgments
                if (data.type === 'ack') {
                    this.logger.info(`Acknowledgment received for: ${data.reference}`);
                }
            } catch (err) {
                this.logger.error('Error processing message:', err);
            }
        });
    }

    /**
     * Disconnect from CFD
     */
    disconnect() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        if (this.connection) {
            if (this.connection instanceof WebSocket) {
                this.connection.close();
            } else if (typeof this.connection.end === 'function') {
                this.connection.end();
            } else if (typeof this.connection.close === 'function') {
                this.connection.close();
            }
        }
        
        this.isConnected = false;
        this.logger.info('Disconnected from CFD');
    }

    /**
     * Start heartbeat to keep connection alive
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.sendHeartbeat();
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Send heartbeat
     */
    async sendHeartbeat() {
        try {
            const message = {
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
                deviceId: this.device.id
            };
            
            await this.sendMessage(message);
        } catch (error) {
            this.logger.error('Heartbeat failed:', error);
        }
    }

    /**
     * Send message to CFD
     * @param {Object} message - Message to send
     */
    async sendMessage(message) {
        if (!this.isConnected) {
            await this.connect();
        }
        
        return new Promise((resolve, reject) => {
            try {
                const data = typeof message === 'string' ? message : JSON.stringify(message);
                
                if (this.connection instanceof WebSocket) {
                    this.connection.send(data, (err) => {
                        if (err) {
                            reject(new Error(`WebSocket send failed: ${err.message}`));
                        } else {
                            resolve();
                        }
                    });
                } else {
                    this.connection.write(data, (err) => {
                        if (err) {
                            reject(new Error(`Send failed: ${err.message}`));
                        } else {
                            resolve();
                        }
                    });
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Display content on CFD
     * @param {Object} contentData - Content data
     */
    async displayContent(contentData) {
        if (!this.isConnected) {
            await this.connect();
        }
        
        this.currentContent = contentData;
        
        const message = {
            type: 'display',
            contentType: contentData.type,
            content: contentData,
            timestamp: new Date().toISOString(),
            deviceId: this.device.id
        };
        
        await this.sendMessage(message);
        this.logger.info(`Displayed ${contentData.type} on CFD`);
    }

    /**
     * Display order information
     * @param {Object} orderData - Order data
     */
    async displayOrderInfo(orderData) {
        const content = {
            type: 'order_info',
            orderNumber: orderData.orderNumber,
            tableNumber: orderData.tableNumber,
            items: orderData.items,
            total: orderData.total,
            status: orderData.status,
            estimatedWaitTime: orderData.estimatedWaitTime
        };
        
        await this.displayContent(content);
    }

    /**
     * Display payment information
     * @param {Object} paymentData - Payment data
     */
    async displayPaymentInfo(paymentData) {
        const content = {
            type: 'payment_info',
            orderNumber: paymentData.orderNumber,
            amount: paymentData.amount,
            paymentMethod: paymentData.paymentMethod,
            change: paymentData.change,
            loyaltyPoints: paymentData.loyaltyPoints,
            discount: paymentData.discount
        };
        
        await this.displayContent(content);
    }

    /**
     * Display loyalty points information
     * @param {Object} loyaltyData - Loyalty data
     */
    async displayLoyaltyInfo(loyaltyData) {
        const content = {
            type: 'loyalty',
            customerName: loyaltyData.customerName,
            customerId: loyaltyData.customerId,
            currentPoints: loyaltyData.currentPoints,
            pointsEarned: loyaltyData.pointsEarned,
            pointsRedeemed: loyaltyData.pointsRedeemed,
            nextReward: loyaltyData.nextReward,
            message: loyaltyData.message
        };
        
        await this.displayContent(content);
    }

    /**
     * Display promotional message
     * @param {Object} promoData - Promotion data
     */
    async displayPromotion(promoData) {
        const content = {
            type: 'promotion',
            title: promoData.title,
            message: promoData.message,
            discount: promoData.discount,
            validUntil: promoData.validUntil,
            imageUrl: promoData.imageUrl
        };
        
        await this.displayContent(content);
    }

    /**
     * Display custom content
     * @param {Object} customData - Custom content data
     */
    async displayCustom(customData) {
        const content = {
            type: 'custom',
            html: customData.html,
            css: customData.css,
            js: customData.js
        };
        
        await this.displayContent(content);
    }

    /**
     * Clear display
     */
    async clearDisplay() {
        if (!this.isConnected) {
            await this.connect();
        }
        
        const message = {
            type: 'clear',
            timestamp: new Date().toISOString(),
            deviceId: this.device.id
        };
        
        await this.sendMessage(message);
        this.currentContent = null;
        this.logger.info('Display cleared');
    }

    /**
     * Get display status
     * @returns {Object} Display status
     */
    async getStatus() {
        if (!this.isConnected) {
            return {
                status: 'disconnected',
                details: 'CFD is not connected',
                currentContent: null,
                lastUpdate: null
            };
        }
        
        // In a real implementation, we would query the CFD for status
        // For now, we'll return simulated status
        
        return {
            status: 'connected',
            details: 'CFD is active',
            currentContent: this.currentContent,
            lastUpdate: new Date().toISOString()
        };
    }

    /**
     * Test CFD connection
     * @returns {boolean} True if connection is working
     */
    async testConnection() {
        try {
            if (!this.isConnected) {
                await this.connect();
            }
            
            // Send a test message
            const testMessage = {
                type: 'test',
                message: 'Connection test',
                timestamp: new Date().toISOString()
            };
            
            await this.sendMessage(testMessage);
            
            return true;
        } catch (error) {
            this.logger.error('Connection test failed:', error);
            return false;
        }
    }

    /**
     * Update display brightness
     * @param {number} level - Brightness level (0-100)
     */
    async setBrightness(level) {
        if (!this.isConnected) {
            await this.connect();
        }
        
        const message = {
            type: 'config',
            action: 'set_brightness',
            value: Math.min(Math.max(level, 0), 100),
            timestamp: new Date().toISOString(),
            deviceId: this.device.id
        };
        
        await this.sendMessage(message);
        this.logger.info(`Brightness set to ${level}%`);
    }

    /**
     * Update display orientation
     * @param {string} orientation - Orientation (portrait, landscape)
     */
    async setOrientation(orientation) {
        if (!this.isConnected) {
            await this.connect();
        }
        
        const message = {
            type: 'config',
            action: 'set_orientation',
            value: orientation,
            timestamp: new Date().toISOString(),
            deviceId: this.device.id
        };
        
        await this.sendMessage(message);
        this.logger.info(`Orientation set to ${orientation}`);
    }

    /**
     * Request acknowledgment from CFD
     * @param {string} reference - Reference ID for acknowledgment
     */
    async requestAck(reference) {
        if (!this.isConnected) {
            await this.connect();
        }
        
        const message = {
            type: 'ack_request',
            reference: reference,
            timestamp: new Date().toISOString(),
            deviceId: this.device.id
        };
        
        await this.sendMessage(message);
    }

    /**
     * Handle incoming acknowledgment
     * @param {Object} ackData - Acknowledgment data
     */
    handleAck(ackData) {
        this.logger.info(`Acknowledgment received for ${ackData.reference}: ${ackData.status}`);
        
        // Update device status
        if (ackData.status === 'success') {
            this.device.status = 'connected';
        } else {
            this.device.status = 'error';
        }
    }
}

module.exports = CFDDriver;
