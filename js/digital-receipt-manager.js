/**
 * Digital Receipt Manager
 * 
 * Handles digital receipt operations including template management,
 * receipt generation, sending via email/WhatsApp, and tracking delivery status.
 */

console.log('Loading DigitalReceiptManager module');

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

console.log('DigitalReceiptManager dependencies loaded');

class DigitalReceiptManager {
    constructor(database) {
        this.db = database;
        this.emailService = null;
        this.whatsappService = null;
        this.logger = logger;
    }

    /**
     * Create a new digital receipt template
     * @param {Object} templateData - Template data
     * @param {string} templateData.name - Template name
     * @param {string} templateData.description - Template description
     * @param {string} templateData.templateType - Template type (email|whatsapp|sms)
     * @param {string} [templateData.subjectTemplate] - Subject template (email only)
     * @param {string} templateData.bodyTemplate - Body template
     * @param {string} [templateData.htmlTemplate] - HTML template (email only)
     * @param {boolean} [templateData.isDefault=false] - Whether this is the default template
     * @param {boolean} [templateData.isActive=true] - Whether template is active
     * @param {number} [templateData.businessId] - Business ID
     * @returns {Promise<Object>} Created template
     */
    async createTemplate(templateData) {
        try {
            const { 
                name, 
                description = '', 
                templateType, 
                subjectTemplate = '', 
                bodyTemplate, 
                htmlTemplate = '', 
                isDefault = false, 
                isActive = true, 
                businessId = null
            } = templateData;

            if (!name || !templateType || !bodyTemplate) {
                throw new Error('Name, templateType, and bodyTemplate are required');
            }

            const [template] = await this.db.execute(
                `INSERT INTO digital_receipt_templates 
                 (name, description, template_type, subject_template, body_template, html_template, 
                  is_default, is_active, business_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                 RETURNING *`,
                [
                    name,
                    description,
                    templateType,
                    subjectTemplate,
                    bodyTemplate,
                    htmlTemplate,
                    isDefault,
                    isActive,
                    businessId
                ]
            );

            this.logger.info(`Created digital receipt template: ${name} (${templateType})`);
            return template;
        } catch (error) {
            this.logger.error(`Failed to create template: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get a template by ID
     * @param {number} templateId - Template ID
     * @returns {Promise<Object>} Template
     */
    async getTemplate(templateId) {
        try {
            const [template] = await this.db.execute(
                'SELECT * FROM digital_receipt_templates WHERE id = ?',
                [templateId]
            );
            return template || null;
        } catch (error) {
            this.logger.error(`Failed to get template ${templateId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get template by type (email, whatsapp, sms)
     * @param {string} templateType - Template type
     * @param {boolean} [getDefault=true] - Get default template
     * @param {number} [businessId=null] - Business ID
     * @returns {Promise<Object>} Template
     */
    async getTemplateByType(templateType, getDefault = true, businessId = null) {
        try {
            let query = 'SELECT * FROM digital_receipt_templates WHERE template_type = ?';
            const params = [templateType];

            if (getDefault) {
                query += ' AND is_default = 1';
            }

            if (businessId !== null) {
                query += ' AND business_id = ?';
                params.push(businessId);
            }

            query += ' ORDER BY is_default DESC, updated_at DESC LIMIT 1';

            const [template] = await this.db.execute(query, params);
            return template || null;
        } catch (error) {
            this.logger.error(`Failed to get ${templateType} template: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update a template
     * @param {number} templateId - Template ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated template
     */
    async updateTemplate(templateId, updates) {
        try {
            const updateFields = [];
            const params = [];

            if (updates.name !== undefined) {
                updateFields.push('name = ?');
                params.push(updates.name);
            }
            if (updates.description !== undefined) {
                updateFields.push('description = ?');
                params.push(updates.description);
            }
            if (updates.templateType !== undefined) {
                updateFields.push('template_type = ?');
                params.push(updates.templateType);
            }
            if (updates.subjectTemplate !== undefined) {
                updateFields.push('subject_template = ?');
                params.push(updates.subjectTemplate);
            }
            if (updates.bodyTemplate !== undefined) {
                updateFields.push('body_template = ?');
                params.push(updates.bodyTemplate);
            }
            if (updates.htmlTemplate !== undefined) {
                updateFields.push('html_template = ?');
                params.push(updates.htmlTemplate);
            }
            if (updates.isDefault !== undefined) {
                updateFields.push('is_default = ?');
                params.push(updates.isDefault);
            }
            if (updates.isActive !== undefined) {
                updateFields.push('is_active = ?');
                params.push(updates.isActive);
            }
            if (updates.businessId !== undefined) {
                updateFields.push('business_id = ?');
                params.push(updates.businessId);
            }

            updateFields.push('updated_at = CURRENT_TIMESTAMP');

            if (updateFields.length === 0) {
                throw new Error('No fields to update');
            }

            params.push(templateId);

            const query = `UPDATE digital_receipt_templates SET ${updateFields.join(', ')} WHERE id = ? RETURNING *`;
            const [template] = await this.db.execute(query, params);

            if (!template) {
                throw new Error(`Template ${templateId} not found`);
            }

            this.logger.info(`Updated digital receipt template: ${templateId}`);
            return template;
        } catch (error) {
            this.logger.error(`Failed to update template ${templateId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete a template
     * @param {number} templateId - Template ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteTemplate(templateId) {
        try {
            const result = await this.db.execute(
                'DELETE FROM digital_receipt_templates WHERE id = ?',
                [templateId]
            );
            return result.changes > 0;
        } catch (error) {
            this.logger.error(`Failed to delete template ${templateId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * List all templates
     * @param {Object} [options] - Query options
     * @param {string} [options.templateType] - Filter by type
     * @param {boolean} [options.activeOnly=true] - Only active templates
     * @param {number} [options.businessId] - Business ID
     * @param {number} [options.limit=100] - Limit
     * @param {number} [options.offset=0] - Offset
     * @returns {Promise<Array>} Templates
     */
    async listTemplates(options = {}) {
        try {
            const {
                templateType = null,
                activeOnly = true,
                businessId = null,
                limit = 100,
                offset = 0
            } = options;

            let query = 'SELECT * FROM digital_receipt_templates';
            const params = [];

            const conditions = [];
            if (templateType) {
                conditions.push('template_type = ?');
                params.push(templateType);
            }
            if (activeOnly) {
                conditions.push('is_active = 1');
            }
            if (businessId !== null) {
                conditions.push('business_id = ?');
                params.push(businessId);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY is_default DESC, updated_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const templates = await this.db.execute(query, params);
            return templates;
        } catch (error) {
            this.logger.error(`Failed to list templates: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create or update customer communication preferences
     * @param {number} customerId - Customer ID
     * @param {Object} preferences - Communication preferences
     * @param {string} [preferences.email] - Email address
     * @param {string} [preferences.phone] - Phone number
     * @param {boolean} [preferences.whatsappEnabled=false] - WhatsApp enabled
     * @param {boolean} [preferences.emailEnabled=false] - Email enabled
     * @param {boolean} [preferences.smsEnabled=false] - SMS enabled
     * @param {string} [preferences.preferredLanguage='en'] - Preferred language
     * @returns {Promise<Object>} Updated preferences
     */
    async updateCustomerPreferences(customerId, preferences) {
        try {
            const {
                email = null,
                phone = null,
                whatsappEnabled = false,
                emailEnabled = false,
                smsEnabled = false,
                preferredLanguage = 'en'
            } = preferences;

            // Check if preferences exist
            const [existing] = await this.db.execute(
                'SELECT * FROM customer_communication_preferences WHERE customer_id = ?',
                [customerId]
            );

            if (existing) {
                // Update existing
                const updateFields = [];
                const params = [];

                if (email !== null) {
                    updateFields.push('email = ?');
                    params.push(email);
                }
                if (phone !== null) {
                    updateFields.push('phone = ?');
                    params.push(phone);
                }
                updateFields.push('whatsapp_enabled = ?');
                params.push(whatsappEnabled);
                updateFields.push('email_enabled = ?');
                params.push(emailEnabled);
                updateFields.push('sms_enabled = ?');
                params.push(smsEnabled);
                updateFields.push('preferred_language = ?');
                params.push(preferredLanguage);
                updateFields.push('last_updated = CURRENT_TIMESTAMP');

                params.push(customerId);

                const query = `UPDATE customer_communication_preferences SET ${updateFields.join(', ')} WHERE customer_id = ? RETURNING *`;
                const [prefs] = await this.db.execute(query, params);
                return prefs;
            } else {
                // Create new
                const [prefs] = await this.db.execute(
                    `INSERT INTO customer_communication_preferences 
                     (customer_id, email, phone, whatsapp_enabled, email_enabled, sms_enabled, 
                      preferred_language, last_updated, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                     RETURNING *`,
                    [
                        customerId,
                        email,
                        phone,
                        whatsappEnabled,
                        emailEnabled,
                        smsEnabled,
                        preferredLanguage
                    ]
                );
                return prefs;
            }
        } catch (error) {
            this.logger.error(`Failed to update customer preferences: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get customer communication preferences
     * @param {number} customerId - Customer ID
     * @returns {Promise<Object>} Preferences or null
     */
    async getCustomerPreferences(customerId) {
        try {
            const [prefs] = await this.db.execute(
                'SELECT * FROM customer_communication_preferences WHERE customer_id = ?',
                [customerId]
            );
            return prefs || null;
        } catch (error) {
            this.logger.error(`Failed to get customer preferences: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate receipt content from template
     * @param {Object} template - Receipt template
     * @param {Object} order - Order data
     * @param {Object} [customer] - Customer data
     * @param {string} [language='en'] - Language for localization
     * @returns {Promise<Object>} Generated receipt content
     */
    async generateReceiptContent(template, order, customer = null, language = 'en') {
        try {
            if (!template || !order) {
                throw new Error('Template and order are required');
            }

            // Get order items
            const orderItems = await this.orderManager.getOrderItems(order.id);

            // Prepare data for template rendering
            const receiptData = {
                order: {
                    id: order.id,
                    order_number: order.order_number || `#${order.id}`,
                    date: new Date(order.created_at).toLocaleString(),
                    time: new Date(order.created_at).toLocaleTimeString(),
                    status: order.status,
                    total_amount: order.total_amount,
                    tax_amount: order.tax_amount || 0,
                    discount_amount: order.discount_amount || 0,
                    subtotal: order.subtotal || (order.total_amount - (order.tax_amount || 0) + (order.discount_amount || 0)),
                    payment_method: order.payment_method,
                    payment_status: order.payment_status,
                    notes: order.notes || ''
                },
                customer: customer || {
                    name: 'Guest',
                    email: '',
                    phone: ''
                },
                items: orderItems.map(item => ({
                    name: item.product_name,
                    quantity: item.quantity,
                    price: item.price,
                    total: item.total_amount,
                    modifiers: item.modifiers || []
                })),
                business: {
                    name: 'Cafe POS',
                    address: '123 Main Street',
                    city: 'City',
                    state: 'State',
                    zip: '12345',
                    phone: '555-123-4567',
                    email: 'info@cafe.com'
                },
                loyalty: {
                    points_earned: order.loyalty_points_earned || 0,
                    points_redeemed: order.loyalty_points_redeemed || 0,
                    total_points: (customer?.loyalty_points || 0) + (order.loyalty_points_earned || 0) - (order.loyalty_points_redeemed || 0)
                },
                language: language,
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString()
            };

            // Render template
            let subject = '';
            let body = '';
            let html = '';

            if (template.subject_template && template.template_type === 'email') {
                subject = this.renderTemplate(template.subject_template, receiptData);
            }

            body = this.renderTemplate(template.body_template, receiptData);

            if (template.html_template && template.template_type === 'email') {
                html = this.renderTemplate(template.html_template, receiptData);
            }

            return {
                subject,
                body,
                html,
                data: receiptData
            };
        } catch (error) {
            this.logger.error(`Failed to generate receipt content: ${error.message}`);
            throw error;
        }
    }

    /**
     * Render template with data
     * @param {string} template - Template string
     * @param {Object} data - Data to interpolate
     * @returns {string} Rendered template
     */
    renderTemplate(template, data) {
        return template.replace(/\{\{(\w+(\.\w+)*)\}\}/g, (match, key) => {
            const keys = key.split('.');
            let value = data;
            for (const k of keys) {
                if (value === undefined || value === null) {
                    return '';
                }
                value = value[k];
            }
            return value !== undefined ? String(value) : '';
        });
    }

    /**
     * Send digital receipt
     * @param {number} orderId - Order ID
     * @param {string} receiptType - Receipt type (email|whatsapp|sms)
     * @param {number} [templateId] - Optional template ID
     * @param {boolean} [force=false] - Force sending even if already sent
     * @returns {Promise<Object>} Receipt history record
     */
    async sendDigitalReceipt(orderId, receiptType, templateId = null, force = false) {
        try {
            // Get order
            const order = await this.orderManager.getOrder(orderId);
            if (!order) {
                throw new Error(`Order ${orderId} not found`);
            }

            // Check if already sent (unless forcing)
            if (!force) {
                const columnMap = {
                    email: 'digital_receipt_email_sent',
                    whatsapp: 'digital_receipt_whatsapp_sent',
                    sms: 'digital_receipt_sms_sent'
                };
                const column = columnMap[receiptType];

                if (order[column]) {
                    throw new Error(`Digital receipt already sent for order ${orderId} via ${receiptType}`);
                }
            }

            // Get customer
            let customer = null;
            if (order.customer_id) {
                customer = await this.orderManager.getCustomer(order.customer_id);
            }

            // Get template
            let template = null;
            if (templateId) {
                template = await this.getTemplate(templateId);
                if (!template) {
                    throw new Error(`Template ${templateId} not found`);
                }
            } else {
                template = await this.getTemplateByType(receiptType);
                if (!template) {
                    throw new Error(`No default ${receiptType} template found`);
                }
            }

            // Get customer preferences
            let preferences = null;
            if (customer) {
                preferences = await this.getCustomerPreferences(customer.id);
            }

            // Determine recipient
            let recipient = null;
            let recipientEmail = null;
            let recipientPhone = null;

            if (receiptType === 'email') {
                recipientEmail = customer?.email || preferences?.email || order.customer_email;
                if (!recipientEmail) {
                    throw new Error('No email address available for customer');
                }
                recipient = recipientEmail;
            } else if (receiptType === 'whatsapp' || receiptType === 'sms') {
                recipientPhone = customer?.phone || preferences?.phone || order.customer_phone;
                if (!recipientPhone) {
                    throw new Error('No phone number available for customer');
                }
                recipient = recipientPhone;
            }

            // Check if customer has enabled this communication method
            if (preferences) {
                const enabledField = `${receiptType}_enabled`;
                if (preferences[enabledField] === 0) {
                    throw new Error(`Customer has not enabled ${receiptType} receipts`);
                }
            }

            // Generate receipt content
            const content = await this.generateReceiptContent(template, order, customer);

            // Create receipt history record (pending)
            const historyId = uuidv4();
            const [history] = await this.db.execute(
                `INSERT INTO digital_receipt_history 
                 (id, order_id, customer_id, template_id, receipt_type, status, 
                  subject, message, recipient_email, recipient_phone, 
                  created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                 RETURNING *`,
                [
                    historyId,
                    orderId,
                    customer?.id || null,
                    template.id,
                    receiptType,
                    'pending',
                    content.subject || '',
                    content.body,
                    recipientEmail || null,
                    recipientPhone || null
                ]
            );

            // Send receipt based on type
            let sendResult = null;
            if (receiptType === 'email') {
                sendResult = await this.emailService.sendEmail({
                    to: recipientEmail,
                    subject: content.subject,
                    text: content.body,
                    html: content.html,
                    orderId,
                    customerId: customer?.id,
                    historyId
                });
            } else if (receiptType === 'whatsapp') {
                sendResult = await this.whatsappService.sendWhatsAppMessage({
                    to: recipientPhone,
                    message: content.body,
                    orderId,
                    customerId: customer?.id,
                    historyId
                });
            } else if (receiptType === 'sms') {
                sendResult = await this.whatsappService.sendSMS({
                    to: recipientPhone,
                    message: content.body,
                    orderId,
                    customerId: customer?.id,
                    historyId
                });
            }

            // Update history with send result
            const updateData = {
                status: sendResult.status,
                message_id: sendResult.messageId || null,
                external_id: sendResult.externalId || null,
                error_message: sendResult.error || null,
                sent_at: sendResult.sentAt || new Date().toISOString()
            };

            const [updatedHistory] = await this.db.execute(
                `UPDATE digital_receipt_history SET 
                 status = ?, message_id = ?, external_id = ?, error_message = ?, 
                 sent_at = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ? RETURNING *`,
                [
                    updateData.status,
                    updateData.message_id,
                    updateData.external_id,
                    updateData.error_message,
                    updateData.sent_at,
                    historyId
                ]
            );

            // Update order status
            if (sendResult.status === 'sent' || sendResult.status === 'delivered') {
                const updateColumn = {
                    email: 'digital_receipt_email_sent',
                    whatsapp: 'digital_receipt_whatsapp_sent',
                    sms: 'digital_receipt_sms_sent'
                };

                await this.db.execute(
                    `UPDATE orders SET 
                     ${updateColumn[receiptType]} = 1, 
                     digital_receipt_status = ?, 
                     digital_receipt_last_sent_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [sendResult.status, orderId]
                );
            }

            this.logger.info(`Sent ${receiptType} receipt for order ${orderId}`);
            return updatedHistory;
        } catch (error) {
            this.logger.error(`Failed to send ${receiptType} receipt for order ${orderId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Send all digital receipts for an order
     * @param {number} orderId - Order ID
     * @param {boolean} [force=false] - Force sending even if already sent
     * @returns {Promise<Array>} Array of receipt history records
     */
    async sendAllDigitalReceipts(orderId, force = false) {
        try {
            const results = [];

            // Try to send email
            try {
                const emailResult = await this.sendDigitalReceipt(orderId, 'email', null, force);
                results.push(emailResult);
            } catch (error) {
                this.logger.warn(`Could not send email receipt: ${error.message}`);
            }

            // Try to send WhatsApp
            try {
                const whatsappResult = await this.sendDigitalReceipt(orderId, 'whatsapp', null, force);
                results.push(whatsappResult);
            } catch (error) {
                this.logger.warn(`Could not send WhatsApp receipt: ${error.message}`);
            }

            // Try to send SMS
            try {
                const smsResult = await this.sendDigitalReceipt(orderId, 'sms', null, force);
                results.push(smsResult);
            } catch (error) {
                this.logger.warn(`Could not send SMS receipt: ${error.message}`);
            }

            return results;
        } catch (error) {
            this.logger.error(`Failed to send all digital receipts for order ${orderId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get receipt history for an order
     * @param {number} orderId - Order ID
     * @param {Object} [options] - Query options
     * @param {string} [options.receiptType] - Filter by type
     * @param {string} [options.status] - Filter by status
     * @param {number} [options.limit=100] - Limit
     * @param {number} [options.offset=0] - Offset
     * @returns {Promise<Array>} Receipt history records
     */
    async getReceiptHistory(orderId, options = {}) {
        try {
            const {
                receiptType = null,
                status = null,
                limit = 100,
                offset = 0
            } = options;

            let query = 'SELECT * FROM digital_receipt_history WHERE order_id = ?';
            const params = [orderId];

            const conditions = [];
            if (receiptType) {
                conditions.push('receipt_type = ?');
                params.push(receiptType);
            }
            if (status) {
                conditions.push('status = ?');
                params.push(status);
            }

            if (conditions.length > 0) {
                query += ' AND ' + conditions.join(' AND ');
            }

            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const history = await this.db.execute(query, params);
            return history;
        } catch (error) {
            this.logger.error(`Failed to get receipt history for order ${orderId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get receipt history for a customer
     * @param {number} customerId - Customer ID
     * @param {Object} [options] - Query options
     * @param {string} [options.receiptType] - Filter by type
     * @param {string} [options.status] - Filter by status
     * @param {number} [options.limit=100] - Limit
     * @param {number} [options.offset=0] - Offset
     * @returns {Promise<Array>} Receipt history records
     */
    async getCustomerReceiptHistory(customerId, options = {}) {
        try {
            const {
                receiptType = null,
                status = null,
                limit = 100,
                offset = 0
            } = options;

            let query = 'SELECT * FROM digital_receipt_history WHERE customer_id = ?';
            const params = [customerId];

            const conditions = [];
            if (receiptType) {
                conditions.push('receipt_type = ?');
                params.push(receiptType);
            }
            if (status) {
                conditions.push('status = ?');
                params.push(status);
            }

            if (conditions.length > 0) {
                query += ' AND ' + conditions.join(' AND ');
            }

            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const history = await this.db.execute(query, params);
            return history;
        } catch (error) {
            this.logger.error(`Failed to get receipt history for customer ${customerId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update receipt status
     * @param {string} historyId - Receipt history ID
     * @param {string} status - New status
     * @param {Object} [data] - Additional data
     * @param {string} [data.errorMessage] - Error message
     * @param {string} [data.deliveredAt] - Delivery timestamp
     * @param {string} [data.readAt] - Read timestamp
     * @returns {Promise<Object>} Updated history record
     */
    async updateReceiptStatus(historyId, status, data = {}) {
        try {
            const {
                errorMessage = null,
                deliveredAt = null,
                readAt = null
            } = data;

            const updateFields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
            const params = [status];

            if (errorMessage !== null) {
                updateFields.push('error_message = ?');
                params.push(errorMessage);
            }
            if (deliveredAt !== null) {
                updateFields.push('delivered_at = ?');
                params.push(deliveredAt);
            }
            if (readAt !== null) {
                updateFields.push('read_at = ?');
                params.push(readAt);
            }

            params.push(historyId);

            const query = `UPDATE digital_receipt_history SET ${updateFields.join(', ')} WHERE id = ? RETURNING *`;
            const [history] = await this.db.execute(query, params);

            if (!history) {
                throw new Error(`Receipt history ${historyId} not found`);
            }

            return history;
        } catch (error) {
            this.logger.error(`Failed to update receipt status ${historyId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Retry failed receipts
     * @param {number} [orderId] - Optional order ID to filter by
     * @param {string} [receiptType] - Optional receipt type to filter by
     * @param {number} [maxRetries=3] - Maximum retry count
     * @returns {Promise<Array>} Array of retry results
     */
    async retryFailedReceipts(orderId = null, receiptType = null, maxRetries = 3) {
        try {
            let query = 'SELECT * FROM digital_receipt_history WHERE status = ? AND retry_count < ?';
            const params = ['failed', maxRetries];

            const conditions = [];
            if (orderId) {
                conditions.push('order_id = ?');
                params.push(orderId);
            }
            if (receiptType) {
                conditions.push('receipt_type = ?');
                params.push(receiptType);
            }

            if (conditions.length > 0) {
                query += ' AND ' + conditions.join(' AND ');
            }

            query += ' ORDER BY created_at ASC';

            const failedReceipts = await this.db.execute(query, params);
            const results = [];

            for (const receipt of failedReceipts) {
                try {
                    this.logger.info(`Retrying ${receipt.receipt_type} receipt for order ${receipt.order_id}`);

                    // Increment retry count
                    await this.db.execute(
                        'UPDATE digital_receipt_history SET retry_count = retry_count + 1 WHERE id = ?',
                        [receipt.id]
                    );

                    // Send receipt
                    const result = await this.sendDigitalReceipt(
                        receipt.order_id,
                        receipt.receipt_type,
                        receipt.template_id,
                        true // force retry
                    );

                    results.push(result);
                } catch (error) {
                    this.logger.error(`Failed to retry receipt ${receipt.id}: ${error.message}`);
                    results.push({
                        success: false,
                        receiptId: receipt.id,
                        orderId: receipt.order_id,
                        error: error.message
                    });
                }
            }

            return results;
        } catch (error) {
            this.logger.error(`Failed to retry failed receipts: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get digital receipt reports
     * @param {Object} [options] - Query options
     * @param {string} [options.startDate] - Start date
     * @param {string} [options.endDate] - End date
     * @param {string} [options.receiptType] - Filter by type
     * @param {string} [options.status] - Filter by status
     * @returns {Promise<Array>} Report data
     */
    async getDigitalReceiptReports(options = {}) {
        try {
            const {
                startDate = null,
                endDate = null,
                receiptType = null,
                status = null
            } = options;

            let query = 'SELECT * FROM vw_digital_receipt_reports';
            const params = [];

            const conditions = [];
            if (startDate) {
                conditions.push('report_date >= ?');
                params.push(startDate);
            }
            if (endDate) {
                conditions.push('report_date <= ?');
                params.push(endDate);
            }
            if (receiptType) {
                // This would need to be handled differently as it's not in the view
                // For now, we'll query the raw table
                return this._getDetailedReports(options);
            }
            if (status) {
                // This would need to be handled differently as it's not in the view
                return this._getDetailedReports(options);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY report_date DESC';

            const reports = await this.db.execute(query, params);
            return reports;
        } catch (error) {
            this.logger.error(`Failed to get digital receipt reports: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get detailed digital receipt reports
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Detailed report data
     */
    async _getDetailedReports(options) {
        try {
            const {
                startDate = null,
                endDate = null,
                receiptType = null,
                status = null
            } = options;

            let query = `SELECT 
                DATE(drh.created_at) AS report_date,
                drh.receipt_type,
                drh.status,
                COUNT(*) AS count,
                COUNT(DISTINCT drh.order_id) AS unique_orders,
                COUNT(DISTINCT drh.customer_id) AS unique_customers
                FROM digital_receipt_history drh`;

            const params = [];
            const conditions = [];

            if (startDate) {
                conditions.push('drh.created_at >= ?');
                params.push(startDate);
            }
            if (endDate) {
                conditions.push('drh.created_at <= ?');
                params.push(endDate);
            }
            if (receiptType) {
                conditions.push('drh.receipt_type = ?');
                params.push(receiptType);
            }
            if (status) {
                conditions.push('drh.status = ?');
                params.push(status);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' GROUP BY DATE(drh.created_at), drh.receipt_type, drh.status ORDER BY report_date DESC';

            const reports = await this.db.execute(query, params);
            return reports;
        } catch (error) {
            this.logger.error(`Failed to get detailed reports: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get customer digital receipt statistics
     * @param {number} [customerId] - Optional customer ID
     * @param {Object} [options] - Query options
     * @param {string} [options.startDate] - Start date
     * @param {string} [options.endDate] - End date
     * @returns {Promise<Array>} Customer statistics
     */
    async getCustomerDigitalReceiptStats(customerId = null, options = {}) {
        try {
            const {
                startDate = null,
                endDate = null
            } = options;

            let query = 'SELECT * FROM vw_customer_digital_receipt_stats';
            const params = [];

            const conditions = [];
            if (customerId) {
                conditions.push('customer_id = ?');
                params.push(customerId);
            }
            if (startDate) {
                // This would need to be handled differently as it's not in the view
                return this._getCustomerDetailedStats(customerId, options);
            }
            if (endDate) {
                return this._getCustomerDetailedStats(customerId, options);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY last_receipt_date DESC';

            const stats = await this.db.execute(query, params);
            return stats;
        } catch (error) {
            this.logger.error(`Failed to get customer digital receipt stats: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get customer detailed statistics
     * @param {number} [customerId] - Optional customer ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Detailed customer statistics
     */
    async _getCustomerDetailedStats(customerId = null, options) {
        try {
            const {
                startDate = null,
                endDate = null
            } = options;

            let query = `SELECT 
                c.id AS customer_id,
                c.first_name,
                c.last_name,
                c.email,
                c.phone,
                COUNT(DISTINCT drh.id) AS total_receipts,
                SUM(CASE WHEN drh.receipt_type = 'email' THEN 1 ELSE 0 END) AS email_receipts,
                SUM(CASE WHEN drh.receipt_type = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp_receipts,
                SUM(CASE WHEN drh.receipt_type = 'sms' THEN 1 ELSE 0 END) AS sms_receipts,
                SUM(CASE WHEN drh.status = 'sent' THEN 1 ELSE 0 END) AS sent_receipts,
                SUM(CASE WHEN drh.status = 'delivered' THEN 1 ELSE 0 END) AS delivered_receipts,
                SUM(CASE WHEN drh.status = 'failed' THEN 1 ELSE 0 END) AS failed_receipts,
                MAX(drh.created_at) AS last_receipt_date,
                ccp.email_enabled,
                ccp.whatsapp_enabled,
                ccp.sms_enabled
                FROM customers c
                LEFT JOIN digital_receipt_history drh ON c.id = drh.customer_id
                LEFT JOIN customer_communication_preferences ccp ON c.id = ccp.customer_id`;

            const params = [];
            const conditions = [];

            if (customerId) {
                conditions.push('c.id = ?');
                params.push(customerId);
            }
            if (startDate) {
                conditions.push('drh.created_at >= ?');
                params.push(startDate);
            }
            if (endDate) {
                conditions.push('drh.created_at <= ?');
                params.push(endDate);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, ccp.email_enabled, ccp.whatsapp_enabled, ccp.sms_enabled ORDER BY last_receipt_date DESC';

            const stats = await this.db.execute(query, params);
            return stats;
        } catch (error) {
            this.logger.error(`Failed to get customer detailed stats: ${error.message}`);
            throw error;
        }
    }
}

module.exports = { DigitalReceiptManager };
