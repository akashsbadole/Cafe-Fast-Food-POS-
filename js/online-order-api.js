/**
 * Online Order API
 * 
 * Handles communication with third-party online order platforms including:
 * - Authentication with provider APIs
 * - Sending order status updates
 * - Fetching order details
 * - Handling API errors and retries
 * - Managing webhook registrations
 */

const axios = require('axios');
const Logger = require('./logger').Logger;
const OnlineOrderManager = require('./online-order-manager').OnlineOrderManager;

class OnlineOrderAPI {
    constructor() {
        this.logger = new Logger('OnlineOrderAPI');
        this.onlineOrderManager = new OnlineOrderManager();
        this.retryConfig = {
            maxRetries: 3,
            retryDelay: 1000,
            maxRetryDelay: 30000
        };
    }

    /**
     * Send order status update to provider
     * @param {number} orderId - The POS order ID
     * @param {string} status - The status to send
     * @param {Object} additionalData - Additional data to send
     * @returns {Promise<Object>} - Result of the API call
     */
    async sendOrderStatusUpdate(orderId, status, additionalData = {}) {
        try {
            const order = await this.onlineOrderManager.getOrderById(orderId);
            if (!order || !order.online_order_provider_id || !order.online_order_external_id) {
                throw new Error('Order is not an online order or missing required fields');
            }

            const provider = await this.onlineOrderManager.getProviderById(order.online_order_provider_id);
            const credentials = await this.onlineOrderManager.getProviderCredentials(order.online_order_provider_id);

            if (!provider || !credentials) {
                throw new Error('Provider or credentials not found');
            }

            // Build the payload based on the status
            const payload = this.buildStatusUpdatePayload(order, status, additionalData);

            // Make the API call with retry logic
            const result = await this.makeApiCallWithRetry(
                provider.id,
                'POST',
                this.buildStatusUpdateEndpoint(provider, order.online_order_external_id),
                payload,
                credentials
            );

            // Record the status update in history
            await this.onlineOrderManager.recordOrderHistory(
                orderId,
                provider.id,
                order.online_order_external_id,
                `status_update_sent_${status}`,
                { 
                    status: status,
                    payload: payload,
                    response: result.data
                }
            );

            return {
                success: true,
                provider: provider.name,
                externalOrderId: order.online_order_external_id,
                status: status,
                response: result.data
            };
        } catch (error) {
            this.logger.error(`Error sending order status update: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build status update payload
     * @param {Object} order - The order data
     * @param {string} status - The status
     * @param {Object} additionalData - Additional data
     * @returns {Object} - The payload
     */
    buildStatusUpdatePayload(order, status, additionalData) {
        const basePayload = {
            order_id: order.online_order_external_id,
            status: status,
            timestamp: new Date().toISOString(),
            restaurant_order_id: order.id,
            restaurant_order_number: order.order_number
        };

        // Add status-specific fields
        switch (status) {
            case 'accepted':
                return {
                    ...basePayload,
                    action: 'accept',
                    accepted_at: new Date().toISOString()
                };
            case 'completed':
                return {
                    ...basePayload,
                    action: 'complete',
                    completed_at: new Date().toISOString(),
                    items: additionalData.items || []
                };
            case 'cancelled':
                return {
                    ...basePayload,
                    action: 'cancel',
                    cancelled_at: new Date().toISOString(),
                    reason: additionalData.reason || 'Cancelled by restaurant'
                };
            case 'rejected':
                return {
                    ...basePayload,
                    action: 'reject',
                    rejected_at: new Date().toISOString(),
                    reason: additionalData.reason || 'Order rejected'
                };
            case 'preparing':
                return {
                    ...basePayload,
                    action: 'preparing',
                    preparing_at: new Date().toISOString()
                };
            case 'ready_for_pickup':
                return {
                    ...basePayload,
                    action: 'ready',
                    ready_at: new Date().toISOString()
                };
            default:
                return basePayload;
        }
    }

    /**
     * Build status update endpoint URL
     * @param {Object} provider - The provider data
     * @param {string} externalOrderId - The external order ID
     * @returns {string} - The endpoint URL
     */
    buildStatusUpdateEndpoint(provider, externalOrderId) {
        // Different providers have different endpoint patterns
        switch (provider.name.toLowerCase()) {
            case 'swiggy':
                return `${provider.api_base_url}/orders/${externalOrderId}/status`;
            case 'zomato':
                return `${provider.api_base_url}/v1/orders/${externalOrderId}/status`;
            case 'ubereats':
                return `${provider.api_base_url}/v1/orders/${externalOrderId}/update`;
            case 'foodpanda':
                return `${provider.api_base_url}/api/orders/${externalOrderId}/status`;
            default:
                return `${provider.api_base_url}/orders/${externalOrderId}/status`;
        }
    }

    /**
     * Make API call with retry logic
     * @param {number} providerId - The provider ID
     * @param {string} method - HTTP method
     * @param {string} url - API endpoint URL
     * @param {Object} data - Request data
     * @param {Object} credentials - Provider credentials
     * @param {number} retryCount - Current retry count
     * @returns {Promise<Object>} - API response
     */
    async makeApiCallWithRetry(providerId, method, url, data, credentials, retryCount = 0) {
        try {
            const provider = await this.onlineOrderManager.getProviderById(providerId);
            if (!provider) {
                throw new Error('Provider not found');
            }

            // Prepare headers
            const headers = await this.prepareHeaders(provider, credentials);

            // Make the API call
            const response = await axios({
                method: method,
                url: url,
                data: data,
                headers: headers,
                timeout: 30000,
                validateStatus: (status) => status < 500
            });

            // Check for success
            if (response.status >= 200 && response.status < 300) {
                return response;
            }

            // Handle client errors (4xx)
            if (response.status >= 400 && response.status < 500) {
                const error = new Error(`API Error: ${response.status} - ${response.statusText}`);
                error.response = response;
                error.retryable = false;
                throw error;
            }

            // Handle server errors (5xx) with retry
            if (retryCount < this.retryConfig.maxRetries) {
                const delay = this.calculateRetryDelay(retryCount);
                this.logger.warn(`Retry ${retryCount + 1}/${this.retryConfig.maxRetries} for ${url} after ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.makeApiCallWithRetry(providerId, method, url, data, credentials, retryCount + 1);
            }

            // Max retries reached
            const error = new Error(`Max retries (${this.retryConfig.maxRetries}) reached for ${url}`);
            error.response = response;
            error.retryable = true;
            throw error;
        } catch (error) {
            if (error.isAxiosError) {
                if (!error.response) {
                    // Network error
                    if (retryCount < this.retryConfig.maxRetries) {
                        const delay = this.calculateRetryDelay(retryCount);
                        this.logger.warn(`Network error, retry ${retryCount + 1}/${this.retryConfig.maxRetries} after ${delay}ms`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return this.makeApiCallWithRetry(providerId, method, url, data, credentials, retryCount + 1);
                    }
                    error.retryable = true;
                } else {
                    error.retryable = error.response.status >= 500;
                }
            }

            this.logger.error(`API call failed: ${error.message}`);
            if (error.response) {
                this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} retryCount - Current retry count
     * @returns {number} - Delay in milliseconds
     */
    calculateRetryDelay(retryCount) {
        const delay = Math.min(
            this.retryConfig.retryDelay * Math.pow(2, retryCount),
            this.retryConfig.maxRetryDelay
        );
        return delay + Math.random() * 1000; // Add jitter
    }

    /**
     * Prepare headers for API request
     * @param {Object} provider - The provider data
     * @param {Object} credentials - Provider credentials
     * @returns {Promise<Object>} - Headers object
     */
    async prepareHeaders(provider, credentials) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'POS-System/1.0'
        };

        // Add provider-specific authentication
        if (credentials.access_token) {
            if (credentials.auth_header_format) {
                headers[credentials.auth_header_name] = credentials.auth_header_format.replace('{token}', credentials.access_token);
            } else {
                headers['Authorization'] = `Bearer ${credentials.access_token}`;
            }
        } else if (credentials.api_key) {
            headers['Authorization'] = `ApiKey ${credentials.api_key}`;
        } else if (credentials.client_id && credentials.client_secret) {
            // For OAuth, we might need to get a token first
            const token = await this.getOAuthToken(provider, credentials);
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }

        // Add provider-specific headers
        switch (provider.name.toLowerCase()) {
            case 'swiggy':
                headers['X-Request-ID'] = this.generateRequestId();
                headers['X-Request-Timestamp'] = Date.now().toString();
                break;
            case 'zomato':
                headers['X-Zomato-API-Key'] = credentials.api_key || '';
                break;
            case 'ubereats':
                headers['X-Uber-Eats-API-Version'] = '1.0';
                break;
        }

        return headers;
    }

    /**
     * Get OAuth token
     * @param {Object} provider - The provider data
     * @param {Object} credentials - Provider credentials
     * @returns {Promise<string|null>} - Access token or null
     */
    async getOAuthToken(provider, credentials) {
        try {
            if (!credentials.client_id || !credentials.client_secret) {
                return null;
            }

            // Check if we have a valid token
            if (credentials.access_token && credentials.expires_at) {
                const expiresAt = new Date(credentials.expires_at);
                const now = new Date();
                const buffer = 300000; // 5 minute buffer
                if (expiresAt.getTime() > now.getTime() + buffer) {
                    return credentials.access_token;
                }
            }

            // Token expired or not available, get a new one
            const tokenUrl = this.buildTokenEndpoint(provider);
            const response = await axios.post(tokenUrl, {
                grant_type: 'client_credentials',
                client_id: credentials.client_id,
                client_secret: credentials.client_secret
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (response.data.access_token) {
                // Update credentials in database
                const expiresIn = response.data.expires_in || 3600;
                const expiresAt = new Date(Date.now() + expiresIn * 1000);

                await this.updateCredentials(provider.id, {
                    access_token: response.data.access_token,
                    refresh_token: response.data.refresh_token || null,
                    token_type: response.data.token_type || 'Bearer',
                    expires_at: expiresAt.toISOString()
                });

                return response.data.access_token;
            }

            return null;
        } catch (error) {
            this.logger.error(`Error getting OAuth token: ${error.message}`);
            return null;
        }
    }

    /**
     * Build token endpoint URL
     * @param {Object} provider - The provider data
     * @returns {string} - The token endpoint URL
     */
    buildTokenEndpoint(provider) {
        switch (provider.name.toLowerCase()) {
            case 'swiggy':
                return `${provider.api_base_url}/oauth/token`;
            case 'zomato':
                return `${provider.api_base_url}/oauth/token`;
            case 'ubereats':
                return `${provider.api_base_url}/v1/oauth/token`;
            default:
                return `${provider.api_base_url}/oauth/token`;
        }
    }

    /**
     * Update provider credentials
     * @param {number} providerId - The provider ID
     * @param {Object} updates - Updates to apply
     */
    async updateCredentials(providerId, updates) {
        try {
            const setClauses = [];
            const params = [];

            for (const [key, value] of Object.entries(updates)) {
                setClauses.push(`${key} = ?`);
                params.push(value);
            }

            setClauses.push('updated_at = CURRENT_TIMESTAMP');

            const query = `
                UPDATE online_order_credentials 
                SET ${setClauses.join(', ')} 
                WHERE provider_id = ?
            `;

            params.push(providerId);
            await this.onlineOrderManager.db.query(query, params);
        } catch (error) {
            this.logger.error(`Error updating credentials: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate a unique request ID
     * @returns {string} - Request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    }

    /**
     * Register webhook with provider
     * @param {number} providerId - The provider ID
     * @param {string} webhookUrl - The webhook URL
     * @param {Array} eventTypes - Event types to subscribe to
     * @returns {Promise<Object>} - Result of registration
     */
    async registerWebhook(providerId, webhookUrl, eventTypes) {
        try {
            const provider = await this.onlineOrderManager.getProviderById(providerId);
            const credentials = await this.onlineOrderManager.getProviderCredentials(providerId);

            if (!provider || !credentials) {
                throw new Error('Provider or credentials not found');
            }

            const payload = {
                webhook_url: webhookUrl,
                events: eventTypes,
                is_active: true
            };

            const endpoint = this.buildWebhookRegistrationEndpoint(provider);
            const result = await this.makeApiCallWithRetry(
                providerId,
                'POST',
                endpoint,
                payload,
                credentials
            );

            return {
                success: true,
                provider: provider.name,
                webhookUrl: webhookUrl,
                eventTypes: eventTypes,
                response: result.data
            };
        } catch (error) {
            this.logger.error(`Error registering webhook: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build webhook registration endpoint
     * @param {Object} provider - The provider data
     * @returns {string} - The endpoint URL
     */
    buildWebhookRegistrationEndpoint(provider) {
        switch (provider.name.toLowerCase()) {
            case 'swiggy':
                return `${provider.api_base_url}/webhooks`;
            case 'zomato':
                return `${provider.api_base_url}/v1/webhooks`;
            case 'ubereats':
                return `${provider.api_base_url}/v1/webhooks/register`;
            default:
                return `${provider.api_base_url}/webhooks`;
        }
    }

    /**
     * Verify webhook signature
     * @param {string} payload - The webhook payload
     * @param {string} signature - The signature header
     * @param {number} providerId - The provider ID
     * @returns {Promise<boolean>} - Whether the signature is valid
     */
    async verifyWebhookSignature(payload, signature, providerId) {
        try {
            const credentials = await this.onlineOrderManager.getProviderCredentials(providerId);
            if (!credentials || !credentials.webhook_secret) {
                this.logger.warn('No webhook secret configured for provider');
                return false;
            }

            const expectedSignature = this.generateWebhookSignature(payload, credentials.webhook_secret);
            return expectedSignature === signature;
        } catch (error) {
            this.logger.error(`Error verifying webhook signature: ${error.message}`);
            return false;
        }
    }

    /**
     * Generate webhook signature
     * @param {string} payload - The payload to sign
     * @param {string} secret - The secret key
     * @returns {string} - The signature
     */
    generateWebhookSignature(payload, secret) {
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(payload);
        return hmac.digest('hex');
    }

    /**
     * Fetch order details from provider
     * @param {number} orderId - The POS order ID
     * @returns {Promise<Object>} - Order details from provider
     */
    async fetchOrderDetails(orderId) {
        try {
            const order = await this.onlineOrderManager.getOrderById(orderId);
            if (!order || !order.online_order_provider_id || !order.online_order_external_id) {
                throw new Error('Order is not an online order or missing required fields');
            }

            const provider = await this.onlineOrderManager.getProviderById(order.online_order_provider_id);
            const credentials = await this.onlineOrderManager.getProviderCredentials(order.online_order_provider_id);

            if (!provider || !credentials) {
                throw new Error('Provider or credentials not found');
            }

            const endpoint = this.buildOrderDetailsEndpoint(provider, order.online_order_external_id);
            const result = await this.makeApiCallWithRetry(
                provider.id,
                'GET',
                endpoint,
                null,
                credentials
            );

            return result.data;
        } catch (error) {
            this.logger.error(`Error fetching order details: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build order details endpoint
     * @param {Object} provider - The provider data
     * @param {string} externalOrderId - The external order ID
     * @returns {string} - The endpoint URL
     */
    buildOrderDetailsEndpoint(provider, externalOrderId) {
        switch (provider.name.toLowerCase()) {
            case 'swiggy':
                return `${provider.api_base_url}/orders/${externalOrderId}`;
            case 'zomato':
                return `${provider.api_base_url}/v1/orders/${externalOrderId}`;
            case 'ubereats':
                return `${provider.api_base_url}/v1/orders/${externalOrderId}/details`;
            default:
                return `${provider.api_base_url}/orders/${externalOrderId}`;
        }
    }

    /**
     * Send order cancellation to provider
     * @param {number} orderId - The POS order ID
     * @param {string} reason - Cancellation reason
     * @param {Object} additionalData - Additional data
     * @returns {Promise<Object>} - Result of cancellation
     */
    async sendOrderCancellation(orderId, reason, additionalData = {}) {
        try {
            const order = await this.onlineOrderManager.getOrderById(orderId);
            if (!order || !order.online_order_provider_id || !order.online_order_external_id) {
                throw new Error('Order is not an online order or missing required fields');
            }

            const provider = await this.onlineOrderManager.getProviderById(order.online_order_provider_id);
            const credentials = await this.onlineOrderManager.getProviderCredentials(order.online_order_provider_id);

            if (!provider || !credentials) {
                throw new Error('Provider or credentials not found');
            }

            const payload = {
                order_id: order.online_order_external_id,
                action: 'cancel',
                reason: reason,
                timestamp: new Date().toISOString(),
                ...additionalData
            };

            const endpoint = this.buildCancellationEndpoint(provider, order.online_order_external_id);
            const result = await this.makeApiCallWithRetry(
                provider.id,
                'POST',
                endpoint,
                payload,
                credentials
            );

            // Record the cancellation in history
            await this.onlineOrderManager.recordOrderHistory(
                orderId,
                provider.id,
                order.online_order_external_id,
                'cancellation_sent',
                { 
                    reason: reason,
                    payload: payload,
                    response: result.data
                }
            );

            return {
                success: true,
                provider: provider.name,
                externalOrderId: order.online_order_external_id,
                response: result.data
            };
        } catch (error) {
            this.logger.error(`Error sending order cancellation: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build cancellation endpoint
     * @param {Object} provider - The provider data
     * @param {string} externalOrderId - The external order ID
     * @returns {string} - The endpoint URL
     */
    buildCancellationEndpoint(provider, externalOrderId) {
        switch (provider.name.toLowerCase()) {
            case 'swiggy':
                return `${provider.api_base_url}/orders/${externalOrderId}/cancel`;
            case 'zomato':
                return `${provider.api_base_url}/v1/orders/${externalOrderId}/cancel`;
            case 'ubereats':
                return `${provider.api_base_url}/v1/orders/${externalOrderId}/cancel`;
            default:
                return `${provider.api_base_url}/orders/${externalOrderId}/cancel`;
        }
    }

    /**
     * Send order modification to provider
     * @param {number} orderId - The POS order ID
     * @param {Object} modifications - Modifications to apply
     * @returns {Promise<Object>} - Result of modification
     */
    async sendOrderModification(orderId, modifications) {
        try {
            const order = await this.onlineOrderManager.getOrderById(orderId);
            if (!order || !order.online_order_provider_id || !order.online_order_external_id) {
                throw new Error('Order is not an online order or missing required fields');
            }

            const provider = await this.onlineOrderManager.getProviderById(order.online_order_provider_id);
            const credentials = await this.onlineOrderManager.getProviderCredentials(order.online_order_provider_id);

            if (!provider || !credentials) {
                throw new Error('Provider or credentials not found');
            }

            const payload = {
                order_id: order.online_order_external_id,
                modifications: modifications,
                timestamp: new Date().toISOString()
            };

            const endpoint = this.buildModificationEndpoint(provider, order.online_order_external_id);
            const result = await this.makeApiCallWithRetry(
                provider.id,
                'POST',
                endpoint,
                payload,
                credentials
            );

            // Record the modification in history
            await this.onlineOrderManager.recordOrderHistory(
                orderId,
                provider.id,
                order.online_order_external_id,
                'modification_sent',
                { 
                    modifications: modifications,
                    payload: payload,
                    response: result.data
                }
            );

            return {
                success: true,
                provider: provider.name,
                externalOrderId: order.online_order_external_id,
                response: result.data
            };
        } catch (error) {
            this.logger.error(`Error sending order modification: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build modification endpoint
     * @param {Object} provider - The provider data
     * @param {string} externalOrderId - The external order ID
     * @returns {string} - The endpoint URL
     */
    buildModificationEndpoint(provider, externalOrderId) {
        switch (provider.name.toLowerCase()) {
            case 'swiggy':
                return `${provider.api_base_url}/orders/${externalOrderId}/modify`;
            case 'zomato':
                return `${provider.api_base_url}/v1/orders/${externalOrderId}/modify`;
            case 'ubereats':
                return `${provider.api_base_url}/v1/orders/${externalOrderId}/modify`;
            default:
                return `${provider.api_base_url}/orders/${externalOrderId}/modify`;
        }
    }
}

module.exports = {
    OnlineOrderAPI
};
