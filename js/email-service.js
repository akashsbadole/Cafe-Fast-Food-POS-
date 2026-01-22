/**
 * Email Service
 * 
 * Handles email sending functionality including SMTP configuration,
 * template rendering, and delivery tracking.
 */

const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { Database } = require('./database');
const { Logger } = require('./logger');
const { DigitalReceiptManager } = require('./digital-receipt-manager');

class EmailService {
    constructor() {
        this.db = new Database();
        this.logger = new Logger('EmailService');
        this.digitalReceiptManager = new DigitalReceiptManager();
        this.transporter = null;
        this.initTransporter();
    }

    /**
     * Initialize email transporter
     */
    initTransporter() {
        try {
            const config = this.getEmailConfig();
            
            if (!config || !config.host) {
                this.logger.warn('Email configuration not found, using default (sendmail)');
                this.transporter = nodemailer.createTransport({
                    sendmail: true,
                    newline: 'unix'
                });
                return;
            }

            this.transporter = nodemailer.createTransport({
                host: config.host,
                port: config.port || 587,
                secure: config.secure || false, // true for 465, false for other ports
                auth: {
                    user: config.auth?.user || process.env.EMAIL_USER,
                    pass: config.auth?.pass || process.env.EMAIL_PASSWORD
                },
                tls: config.tls || {
                    rejectUnauthorized: false
                },
                connectionTimeout: config.connectionTimeout || 10000,
                greetingTimeout: config.greetingTimeout || 10000,
                socketTimeout: config.socketTimeout || 10000
            });

            this.logger.info('Email transporter initialized');
        } catch (error) {
            this.logger.error(`Failed to initialize email transporter: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get email configuration from database
     * @returns {Object} Email configuration
     */
    getEmailConfig() {
        try {
            const config = {
                host: process.env.EMAIL_HOST,
                port: process.env.EMAIL_PORT,
                secure: process.env.EMAIL_SECURE === 'true',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                },
                from: process.env.EMAIL_FROM || 'noreply@cafe.com'
            };

            // Try to get from database if available
            try {
                const [dbConfig] = this.db.execute(
                    'SELECT * FROM system_settings WHERE key LIKE ?',
                    ['email_%']
                );

                if (dbConfig) {
                    // Parse JSON settings
                    const settings = JSON.parse(dbConfig.value || '{}');
                    if (settings.host) {
                        config.host = settings.host;
                    }
                    if (settings.port) {
                        config.port = settings.port;
                    }
                    if (settings.secure !== undefined) {
                        config.secure = settings.secure;
                    }
                    if (settings.from) {
                        config.from = settings.from;
                    }
                }
            } catch (error) {
                this.logger.warn(`Could not load email config from database: ${error.message}`);
            }

            return config;
        } catch (error) {
            this.logger.error(`Failed to get email config: ${error.message}`);
            return null;
        }
    }

    /**
     * Send email
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email
     * @param {string} options.subject - Email subject
     * @param {string} options.text - Plain text body
     * @param {string} [options.html] - HTML body
     * @param {number} options.orderId - Order ID
     * @param {number} [options.customerId] - Customer ID
     * @param {string} [options.historyId] - Receipt history ID
     * @param {Array} [options.attachments] - Attachments
     * @returns {Promise<Object>} Send result
     */
    async sendEmail(options) {
        try {
            const {
                to,
                subject,
                text,
                html = null,
                orderId,
                customerId = null,
                historyId = null,
                attachments = []
            } = options;

            if (!to || !subject || !text) {
                throw new Error('to, subject, and text are required');
            }

            const config = this.getEmailConfig();
            const from = config.from || 'noreply@cafe.com';

            const mailOptions = {
                from: from,
                to: to,
                subject: subject,
                text: text,
                attachments: attachments
            };

            if (html) {
                mailOptions.html = html;
            }

            this.logger.info(`Sending email to ${to} for order ${orderId}`);

            // Send email
            const result = await this.transporter.sendMail(mailOptions);

            this.logger.info(`Email sent to ${to}. Message ID: ${result.messageId}`);

            // Update receipt history if provided
            if (historyId) {
                await this.digitalReceiptManager.updateReceiptStatus(historyId, 'sent', {
                    message_id: result.messageId,
                    external_id: result.messageId,
                    sent_at: new Date().toISOString()
                });
            }

            return {
                success: true,
                status: 'sent',
                messageId: result.messageId,
                externalId: result.messageId,
                sentAt: new Date().toISOString(),
                accepted: result.accepted,
                rejected: result.rejected,
                envelope: result.envelope,
                messageSize: result.messageSize
            };
        } catch (error) {
            this.logger.error(`Failed to send email: ${error.message}`);

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
     * Send digital receipt email
     * @param {number} orderId - Order ID
     * @param {number} [templateId] - Optional template ID
     * @param {boolean} [force=false] - Force sending even if already sent
     * @returns {Promise<Object>} Send result
     */
    async sendDigitalReceiptEmail(orderId, templateId = null, force = false) {
        try {
            return await this.digitalReceiptManager.sendDigitalReceipt(orderId, 'email', templateId, force);
        } catch (error) {
            this.logger.error(`Failed to send digital receipt email for order ${orderId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Send test email
     * @param {string} to - Recipient email
     * @returns {Promise<Object>} Send result
     */
    async sendTestEmail(to) {
        try {
            const subject = 'Test Email from Cafe POS';
            const text = 'This is a test email from your Cafe POS system. If you received this, your email configuration is working correctly.';
            const html = `<html>
                <body>
                    <h1>Test Email from Cafe POS</h1>
                    <p>This is a test email from your Cafe POS system.</p>
                    <p>If you received this, your email configuration is working correctly.</p>
                </body>
            </html>`;

            return await this.sendEmail({
                to: to,
                subject: subject,
                text: text,
                html: html
            });
        } catch (error) {
            this.logger.error(`Failed to send test email: ${error.message}`);
            throw error;
        }
    }

    /**
     * Verify email configuration
     * @returns {Promise<Object>} Verification result
     */
    async verifyConfiguration() {
        try {
            const config = this.getEmailConfig();
            
            if (!config || !config.host) {
                return {
                    success: false,
                    message: 'Email configuration not found',
                    config: config || {}
                };
            }

            // Test connection
            await this.transporter.verify();

            return {
                success: true,
                message: 'Email configuration is valid',
                config: config
            };
        } catch (error) {
            this.logger.error(`Email configuration verification failed: ${error.message}`);
            return {
                success: false,
                message: error.message,
                config: this.getEmailConfig() || {}
            };
        }
    }

    /**
     * Update email configuration
     * @param {Object} config - Email configuration
     * @param {string} config.host - SMTP host
     * @param {number} config.port - SMTP port
     * @param {boolean} [config.secure=false] - Use SSL
     * @param {string} [config.user] - Username
     * @param {string} [config.password] - Password
     * @param {string} [config.from] - From email address
     * @returns {Promise<Object>} Update result
     */
    async updateConfiguration(config) {
        try {
            const settings = {
                host: config.host,
                port: config.port,
                secure: config.secure || false,
                from: config.from || 'noreply@cafe.com'
            };

            if (config.user) {
                settings.auth = {
                    user: config.user,
                    pass: config.password || ''
                };
            }

            // Save to database
            const [existing] = await this.db.execute(
                'SELECT * FROM system_settings WHERE key = ?',
                ['email_settings']
            );

            if (existing) {
                await this.db.execute(
                    'UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
                    [JSON.stringify(settings), 'email_settings']
                );
            } else {
                await this.db.execute(
                    'INSERT INTO system_settings (key, value, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
                    ['email_settings', JSON.stringify(settings)]
                );
            }

            // Reinitialize transporter
            this.initTransporter();

            return {
                success: true,
                message: 'Email configuration updated successfully'
            };
        } catch (error) {
            this.logger.error(`Failed to update email configuration: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate PDF attachment for receipt
     * @param {Object} receiptData - Receipt data
     * @returns {Promise<Object>} PDF attachment object
     */
    async generatePdfAttachment(receiptData) {
        try {
            // In a real implementation, this would use a PDF generation library
            // For now, we'll return a mock attachment
            
            this.logger.warn('PDF generation not fully implemented - returning mock attachment');

            return {
                filename: `receipt_${receiptData.order.id}.pdf`,
                content: Buffer.from('Mock PDF content'),
                contentType: 'application/pdf'
            };
        } catch (error) {
            this.logger.error(`Failed to generate PDF: ${error.message}`);
            throw error;
        }
    }
}

module.exports = { EmailService };
