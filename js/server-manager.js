// Server Manager for Electron Window Visibility Fix
// Handles Express server startup with port conflict resolution and health validation

const EventEmitter = require('events');
const http = require('http');

/**
 * Server status constants
 */
const ServerStatus = {
    STARTING: 'starting',
    READY: 'ready',
    FAILED: 'failed',
    STOPPED: 'stopped'
};

/**
 * Server Manager class
 * Manages Express server startup with automatic port resolution and health checks
 */
class ServerManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            preferredPort: config.preferredPort || 3000,
            fallbackPorts: config.fallbackPorts || [3001, 3002, 3003, 3004, 3005],
            maxRetries: config.maxRetries || 3,
            healthCheckTimeout: config.healthCheckTimeout || 5000,
            host: config.host || '127.0.0.1',
            ...config
        };

        this.serverInfo = {
            port: null,
            host: this.config.host,
            status: ServerStatus.STOPPED,
            url: null,
            server: null
        };

        this.startTime = null;
        this.healthCheckInterval = null;
    }

    /**
     * Start the Express server with automatic port resolution
     * @param {number} preferredPort - Optional preferred port override
     * @returns {Promise<ServerInfo>}
     */
    async startServer(preferredPort) {
        this.startTime = Date.now();
        const targetPort = preferredPort || this.config.preferredPort;

        this.emit('server-starting', { port: targetPort });
        this.serverInfo.status = ServerStatus.STARTING;

        try {
            // Find available port starting with preferred port
            const availablePort = await this.findAvailablePort(targetPort);

            // Start the server on the available port
            const { startServer } = require('../server.js');
            const server = await this.startServerOnPort(startServer, availablePort);

            // Update server info
            this.serverInfo = {
                port: availablePort,
                host: this.config.host,
                status: ServerStatus.READY,
                url: `http://${this.config.host}:${availablePort}`,
                server: server
            };

            // Validate server health
            const isHealthy = await this.validateServerHealth();
            if (!isHealthy) {
                throw new Error('Server health check failed after startup');
            }

            // Start periodic health monitoring
            this.startHealthMonitoring();

            this.emit('server-ready', {
                ...this.serverInfo,
                duration: Date.now() - this.startTime
            });

            return { ...this.serverInfo };

        } catch (error) {
            this.serverInfo.status = ServerStatus.FAILED;
            this.emit('server-error', {
                error: error.message,
                duration: this.startTime ? Date.now() - this.startTime : 0
            });
            throw error;
        }
    }

    /**
     * Find an available port starting from the preferred port
     * @param {number} startPort - Port to start checking from
     * @returns {Promise<number>} Available port number
     */
    async findAvailablePort(startPort) {
        const portsToTry = [startPort, ...this.config.fallbackPorts];

        for (const port of portsToTry) {
            if (await this.isPortAvailable(port)) {
                this.emit('port-found', { port, preferred: port === startPort });
                return port;
            }
        }

        throw new Error(`No available ports found. Tried: ${portsToTry.join(', ')}`);
    }

    /**
     * Check if a port is available
     * @param {number} port - Port to check
     * @returns {Promise<boolean>} True if port is available
     */
    async isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = http.createServer();

            server.listen(port, this.config.host, () => {
                server.close(() => resolve(true));
            });

            server.on('error', () => resolve(false));
        });
    }

    /**
     * Start server on specific port with retry logic
     * @param {Function} startServerFn - Server start function
     * @param {number} port - Port to start on
     * @returns {Promise<Object>} Server instance
     */
    async startServerOnPort(startServerFn, port) {
        let lastError = null;

        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                this.emit('server-attempt', { attempt, port });

                // Temporarily override the port in the server module
                const originalEnv = process.env.PORT;
                process.env.PORT = port.toString();

                const server = await startServerFn();

                // Restore original environment
                if (originalEnv !== undefined) {
                    process.env.PORT = originalEnv;
                } else {
                    delete process.env.PORT;
                }

                return server;

            } catch (error) {
                lastError = error;
                this.emit('server-retry', {
                    attempt,
                    port,
                    error: error.message,
                    willRetry: attempt < this.config.maxRetries
                });

                if (attempt < this.config.maxRetries) {
                    // Wait before retry with exponential backoff
                    await this.delay(Math.pow(2, attempt - 1) * 1000);
                }
            }
        }

        throw new Error(`Failed to start server after ${this.config.maxRetries} attempts. Last error: ${lastError?.message}`);
    }

    /**
     * Validate server health by checking API endpoints
     * @returns {Promise<boolean>} True if server is healthy
     */
    async validateServerHealth() {
        if (!this.serverInfo.url) {
            return false;
        }

        try {
            // Test basic connectivity
            const response = await this.makeHealthCheckRequest(`${this.serverInfo.url}/api/categories`);

            // Check if response is valid (should be an array or error object)
            const isValidResponse = response !== null && typeof response !== 'undefined';

            this.emit('health-check', {
                url: this.serverInfo.url,
                healthy: isValidResponse,
                response: typeof response
            });

            return isValidResponse;

        } catch (error) {
            this.emit('health-check', {
                url: this.serverInfo.url,
                healthy: false,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Make HTTP request for health check
     * @param {string} url - URL to check
     * @returns {Promise<any>} Response data
     */
    async makeHealthCheckRequest(url) {
        return new Promise((resolve, reject) => {
            const request = http.get(url, { timeout: this.config.healthCheckTimeout }, (response) => {
                let data = '';

                response.on('data', (chunk) => {
                    data += chunk;
                });

                response.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (error) {
                        // If not JSON, still consider it a valid response
                        resolve(data);
                    }
                });
            });

            request.on('error', reject);
            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Health check timeout'));
            });
        });
    }

    /**
     * Start periodic health monitoring
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            const isHealthy = await this.validateServerHealth();
            if (!isHealthy && this.serverInfo.status === ServerStatus.READY) {
                this.serverInfo.status = ServerStatus.FAILED;
                this.emit('server-unhealthy', { url: this.serverInfo.url });
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Stop the Express server
     * @returns {Promise<void>}
     */
    async stopServer() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        if (this.serverInfo.server) {
            try {
                const { stopServer } = require('../server.js');
                await stopServer();

                this.serverInfo.status = ServerStatus.STOPPED;
                this.serverInfo.server = null;

                this.emit('server-stopped', { port: this.serverInfo.port });

            } catch (error) {
                this.emit('server-stop-error', { error: error.message });
                throw error;
            }
        }
    }

    /**
     * Get current server information
     * @returns {ServerInfo} Current server info
     */
    getServerInfo() {
        return { ...this.serverInfo };
    }

    /**
     * Get server status
     * @returns {string} Current server status
     */
    getServerStatus() {
        return this.serverInfo.status;
    }

    /**
     * Utility function to create delay
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Reset server manager to initial state
     */
    reset() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        this.serverInfo = {
            port: null,
            host: this.config.host,
            status: ServerStatus.STOPPED,
            url: null,
            server: null
        };

        this.startTime = null;
    }
}

module.exports = {
    ServerManager,
    ServerStatus
};