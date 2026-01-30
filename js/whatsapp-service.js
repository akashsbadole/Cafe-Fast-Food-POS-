/**
 * WhatsApp Service
 * 
 * Handles WhatsApp messaging functionality including API integration,
 * message sending, and delivery tracking.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

class WhatsAppService {
    constructor(database, digitalReceiptManager) {
        this.db = database;
        this.logger = logger;
        this.digitalReceiptManager = digitalReceiptManager;
        this.apiConfig = this.getApiConfig();
    }

    /**
     * Get WhatsApp API configuration
     * @returns {Object} API configuration
     */
    getApiConfig() {
        try {
            const config = {
                apiUrl: process.env.WHATSAPP_API_URL,
                apiKey: process.env.WHATSAPP_API_KEY,
                phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
                fromPhone: process.env.WHATSAPP_FROM_PHONE,
                useSandbox: process.env.WHATSAPP_SANDBOX === 'true'
            };

            // Try to get from database if available
            try {
                const [dbConfig] = this.db.execute(
                    'SELECT * FROM system_settings WHERE key = ?',
                    ['whatsapp_settings']
                );

                if (dbConfig) {
                    const settings = JSON.parse(dbConfig.value || '{}');
                    if (settings.apiUrl) config.apiUrl = settings.apiUrl;
                    if (settings.phoneNumberId) config.phoneNumberId = settings.phoneNumberId;
                    if (settings.fromPhone) config.fromPhone = settings.fromPhone;
                    if (settings.useSandbox !== undefined) config.useSandbox = settings.useSandbox;
                }
            } catch (error) {
                this.logger.warn(`Could not load WhatsApp config from database: ${error.message}`);
            }

            return config;
        } catch (error) {
            this.logger.error(`Failed to get WhatsApp config: ${error.message}`);
            return null;
        }
    }

    /**
     * Send WhatsApp message
     * @param {Object} options - Message options
     * @param {string} options.to - Recipient phone number (with country code)
     * @param {string} options.message - Message text
     * @param {number} options.orderId - Order ID
     * @param {number} [options.customerId] - Customer ID
     * @param {string} [options.historyId] - Receipt history ID
     * @param {string} [options.type='text'] - Message type (text|image)
     * @param {Buffer} [options.imageData] - Image data for image messages
     * @returns {Promise<Object>} Send result
     */
    async sendWhatsAppMessage(options) {
        try {
            const {
                to,
                message,
                orderId,
                customerId = null,
                historyId = null,
                type = 'text',
                imageData = null
            } = options;

            if (!to || !message) {
                throw new Error('to and message are required');
            }

            const config = this.getApiConfig();
            
            if (!config || !config.apiUrl) {
                throw new Error('WhatsApp API configuration not found');
            }

            // Format phone number
            const formattedTo = this.formatPhoneNumber(to);

            // Prepare request body
            let requestBody = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: formattedTo
            };

            if (type === 'text') {
                requestBody.message = {
                    text: {
                        body: message
                    }
                };
            } else if (type === 'image') {
                if (!imageData) {
                    throw new Error('Image data is required for image messages');
                }

                requestBody.message = {
                    image: {
                        link: 'data:image/jpeg;base64,' + imageData.toString('base64')
                    }
                };
            }

            this.logger.info(`Sending WhatsApp ${type} message to ${formattedTo} for order ${orderId}`);

            // Send request to WhatsApp API
            const response = await axios.post(
                `${config.apiUrl}/messages`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${config.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            this.logger.info(`WhatsApp message sent to ${formattedTo}. Message ID: ${response.data.messages[0].id}`);

            // Update receipt history if provided
            if (historyId) {
                await this.digitalReceiptManager.updateReceiptStatus(historyId, 'sent', {
                    message_id: response.data.messages[0].id,
                    external_id: response.data.messages[0].id,
                    sent_at: new Date().toISOString()
                });
            }

            return {
                success: true,
                status: 'sent',
                messageId: response.data.messages[0].id,
                externalId: response.data.messages[0].id,
                sentAt: new Date().toISOString(),
                recipient: formattedTo
            };
        } catch (error) {
            this.logger.error(`Failed to send WhatsApp message: ${error.message}`);

            // Update receipt history if provided
            if (options.historyId) {
                await this.digitalReceiptManager.updateReceiptStatus(options.historyId, 'failed', {
                    errorMessage: error.message
                });
            }

            return {
                success: false,
                status: 'failed',
                error: error.message,
                sentAt: new Date().toISOString()
            };
        }
    }

    /**
     * Send SMS message
     * @param {Object} options - Message options
     * @param {string} options.to - Recipient phone number
     * @param {string} options.message - Message text
     * @param {number} options.orderId - Order ID
     * @param {number} [options.customerId] - Customer ID
     * @param {string} [options.historyId] - Receipt history ID
     * @returns {Promise<Object>} Send result
     */
    async sendSMS(options) {
        try {
            // For SMS, we'll use the same WhatsApp API but with different endpoint
            // In a real implementation, this would use a dedicated SMS provider
            
            const {
                to,
                message,
                orderId,
                customerId = null,
                historyId = null
            } = options;

            if (!to || !message) {
                throw new Error('to and message are required');
            }

            const config = this.getApiConfig();
            
            if (!config || !config.apiUrl) {
                throw new Error('SMS API configuration not found');
            }

            // Format phone number
            const formattedTo = this.formatPhoneNumber(to);

            // Prepare request body for SMS
            const requestBody = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: formattedTo,
                type: 'text',
                text: {
                    body: message
                }
            };

            this.logger.info(`Sending SMS to ${formattedTo} for order ${orderId}`);

            // Send request
            const response = await axios.post(
                `${config.apiUrl}/messages`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${config.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            this.logger.info(`SMS sent to ${formattedTo}. Message ID: ${response.data.messages[0].id}`);

            // Update receipt history if provided
            if (historyId) {
                await this.digitalReceiptManager.updateReceiptStatus(historyId, 'sent', {
                    message_id: response.data.messages[0].id,
                    external_id: response.data.messages[0].id,
                    sent_at: new Date().toISOString()
                });
            }

            return {
                success: true,
                status: 'sent',
                messageId: response.data.messages[0].id,
                externalId: response.data.messages[0].id,
                sentAt: new Date().toISOString(),
                recipient: formattedTo
            };
        } catch (error) {
            this.logger.error(`Failed to send SMS: ${error.message}`);

            // Update receipt history if provided
            if (options.historyId) {
                await this.digitalReceiptManager.updateReceiptStatus(options.historyId, 'failed', {
                    errorMessage: error.message
                });
            }

            return {
                success: false,
                status: 'failed',
                error: error.message,
                sentAt: new Date().toISOString()
            };
        }
    }

    /**
     * Send digital receipt via WhatsApp
     * @param {number} orderId - Order ID
     * @param {number} [templateId] - Optional template ID
     * @param {boolean} [force=false] - Force sending even if already sent
     * @returns {Promise<Object>} Send result
     */
    async sendDigitalReceiptWhatsApp(orderId, templateId = null, force = false) {
        try {
            return await this.digitalReceiptManager.sendDigitalReceipt(orderId, 'whatsapp', templateId, force);
        } catch (error) {
            this.logger.error(`Failed to send digital receipt via WhatsApp for order ${orderId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Send digital receipt via SMS
     * @param {number} orderId - Order ID
     * @param {number} [templateId] - Optional template ID
     * @param {boolean} [force=false] - Force sending even if already sent
     * @returns {Promise<Object>} Send result
     */
    async sendDigitalReceiptSMS(orderId, templateId = null, force = false) {
        try {
            return await this.digitalReceiptManager.sendDigitalReceipt(orderId, 'sms', templateId, force);
        } catch (error) {
            this.logger.error(`Failed to send digital receipt via SMS for order ${orderId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Format phone number for WhatsApp API
     * @param {string} phoneNumber - Phone number
     * @returns {string} Formatted phone number
     */
    formatPhoneNumber(phoneNumber) {
        // Remove all non-digit characters
        const digits = phoneNumber.replace(/\D/g, '');
        
        // Add country code if missing (default to 1 for US)
        if (!digits.startsWith('+')) {
            return `+1${digits}`;
        }
        
        return digits;
    }

    /**
     * Verify WhatsApp configuration
     * @returns {Promise<Object>} Verification result
     */
    async verifyConfiguration() {
        try {
            const config = this.getApiConfig();
            
            if (!config || !config.apiUrl) {
                return {
                    success: false,
                    message: 'WhatsApp API configuration not found',
                    config: config || {}
                };
            }

            // Test connection by making a simple request
            await axios.get(
                `${config.apiUrl}/config`,
                {
                    headers: {
                        'Authorization': `Bearer ${config.apiKey}`
                    },
                    timeout: 10000
                }
            );

            return {
                success: true,
                message: 'WhatsApp API configuration is valid',
                config: config
            };
        } catch (error) {
            this.logger.error(`WhatsApp API configuration verification failed: ${error.message}`);
            return {
                success: false,
                message: error.message,
                config: this.getApiConfig() || {}
            };
        }
    }

    /**
     * Update WhatsApp configuration
     * @param {Object} config - WhatsApp configuration
     * @param {string} config.apiUrl - API URL
     * @param {string} config.apiKey - API key
     * @param {string} config.phoneNumberId - Phone number ID
     * @param {string} config.fromPhone - From phone number
     * @param {boolean} [config.useSandbox=false] - Use sandbox mode
     * @returns {Promise<Object>} Update result
     */
    async updateConfiguration(config) {
        try {
            const settings = {
                apiUrl: config.apiUrl,
                apiKey: config.apiKey,
                phoneNumberId: config.phoneNumberId,
                fromPhone: config.fromPhone,
                useSandbox: config.useSandbox || false
            };

            // Save to database
            const [existing] = await this.db.execute(
                'SELECT * FROM system_settings WHERE key = ?',
                ['whatsapp_settings']
            );

            if (existing) {
                await this.db.execute(
                    'UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
                    [JSON.stringify(settings), 'whatsapp_settings']
                );
            } else {
                await this.db.execute(
                    'INSERT INTO system_settings (key, value, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
                    ['whatsapp_settings', JSON.stringify(settings)]
                );
            }

            // Update config
            this.apiConfig = settings;

            return {
                success: true,
                message: 'WhatsApp configuration updated successfully'
            };
        } catch (error) {
            this.logger.error(`Failed to update WhatsApp configuration: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check message delivery status
     * @param {string} messageId - Message ID
     * @returns {Promise<Object>} Delivery status
     */
    async checkDeliveryStatus(messageId) {
        try {
            const config = this.getApiConfig();
            
            if (!config || !config.apiUrl) {
                throw new Error('WhatsApp API configuration not found');
            }

            const response = await axios.get(
                `${config.apiUrl}/messages/${messageId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${config.apiKey}`
                    },
                    timeout: 10000
                }
            );

            return {
                success: true,
                status: response.data.status,
                timestamp: response.data.timestamp,
                errors: response.data.errors || []
            };
        } catch (error) {
            this.logger.error(`Failed to check delivery status: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send test WhatsApp message
     * @param {string} to - Recipient phone number
     * @returns {Promise<Object>} Send result
     */
    async sendTestMessage(to) {
        try {
            const message = 'This is a test message from your Cafe POS system. If you received this, your WhatsApp configuration is working correctly.';

            return await this.sendWhatsAppMessage({
                to: to,
                message: message
            });
        } catch (error) {
            this.logger.error(`Failed to send test WhatsApp message: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate image receipt for WhatsApp
     * @param {Object} receiptData - Receipt data
     * @returns {Promise<Buffer>} Image buffer
     */
    async generateImageReceipt(receiptData) {
        try {
            // In a real implementation, this would use a library like Puppeteer or similar
            // to generate an image from the receipt HTML
            
            this.logger.warn('Image generation not fully implemented - returning mock image');

            // Return a mock image (base64 encoded)
            const mockImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
            return mockImage;
        } catch (error) {
            this.logger.error(`Failed to generate image receipt: ${error.message}`);
            throw error;
        }
    }
}

module.exports = { WhatsAppService };
