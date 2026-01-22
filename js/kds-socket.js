/**
 * Kitchen Display System (KDS) WebSocket Communication
 * 
 * Handles real-time communication between POS and KDS stations
 * Supports message broadcasting and event handling
 */

const WebSocket = require('ws');
const logger = require('./logger');
const { EventEmitter } = require('events');

class KdsSocket extends EventEmitter {
    constructor() {
        super();
        this.clients = new Set();
        this.server = null;
        this.port = 8081; // Default KDS WebSocket port
        this.isRunning = false;
        
        // Initialize WebSocket server
        this.initializeServer();
    }

    /**
     * Initialize WebSocket server
     */
    initializeServer() {
        try {
            this.server = new WebSocket.Server({ port: this.port });
            
            this.server.on('connection', (ws) => {
                logger.info('New KDS client connected');
                
                this.clients.add(ws);
                
                ws.on('message', (message) => {
                    this.handleMessage(ws, message);
                });
                
                ws.on('close', () => {
                    logger.info('KDS client disconnected');
                    this.clients.delete(ws);
                });
                
                ws.on('error', (error) => {
                    logger.error('KDS client error:', error);
                    this.clients.delete(ws);
                });
                
                // Send welcome message
                this.sendToClient(ws, 'welcome', {
                    message: 'Connected to KDS WebSocket server',
                    timestamp: new Date().toISOString()
                });
            });
            
            this.server.on('error', (error) => {
                logger.error('KDS WebSocket server error:', error);
                this.emit('error', error);
            });
            
            this.server.on('listening', () => {
                logger.info(`KDS WebSocket server listening on port ${this.port}`);
                this.isRunning = true;
                this.emit('connected');
            });
            
            this.emit('connected');
        } catch (error) {
            logger.error('Failed to initialize KDS WebSocket server:', error);
            this.emit('error', error);
        }
    }

    /**
     * Handle incoming message from client
     * @param {WebSocket} ws - WebSocket connection
     * @param {string} message - Message data
     */
    handleMessage(ws, message) {
        try {
            let data;
            
            // Parse message (could be JSON or plain text)
            try {
                data = JSON.parse(message);
            } catch (e) {
                data = { text: message };
            }
            
            logger.debug('Received KDS message:', data);
            
            // Emit message event
            this.emit('message', { client: ws, data });
            
            // Handle specific message types
            if (data.type) {
                switch (data.type) {
                    case 'status-update':
                        this.emit('status-update', data);
                        break;
                    case 'acknowledge':
                        this.emit('acknowledge', data);
                        break;
                    case 'ping':
                        this.sendToClient(ws, 'pong', { timestamp: new Date().toISOString() });
                        break;
                    default:
                        this.emit(`message:${data.type}`, data);
                }
            }
        } catch (error) {
            logger.error('Error handling KDS message:', error);
            this.emit('error', error);
        }
    }

    /**
     * Broadcast message to all connected clients
     * @param {string} type - Message type
     * @param {Object} data - Message data
     */
    broadcast(type, data) {
        if (!this.isRunning || this.clients.size === 0) {
            return;
        }
        
        const message = {
            type,
            data,
            timestamp: new Date().toISOString()
        };
        
        const messageString = JSON.stringify(message);
        
        this.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(messageString);
                } catch (error) {
                    logger.error('Error sending message to client:', error);
                }
            }
        });
    }

    /**
     * Send message to specific client
     * @param {WebSocket} ws - WebSocket connection
     * @param {string} type - Message type
     * @param {Object} data - Message data
     */
    sendToClient(ws, type, data) {
        if (ws.readyState === WebSocket.OPEN) {
            const message = {
                type,
                data,
                timestamp: new Date().toISOString()
            };
            
            try {
                ws.send(JSON.stringify(message));
            } catch (error) {
                logger.error('Error sending message to client:', error);
            }
        }
    }

    /**
     * Close WebSocket server
     */
    close() {
        if (this.server) {
            this.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.close();
                }
            });
            
            this.clients.clear();
            this.server.close();
            this.isRunning = false;
            
            logger.info('KDS WebSocket server closed');
            this.emit('disconnected');
        }
    }

    /**
     * Get number of connected clients
     * @returns {number} Number of connected clients
     */
    getClientCount() {
        return this.clients.size;
    }

    /**
     * Send ping to all clients
     */
    pingAll() {
        const message = {
            type: 'ping',
            data: { timestamp: new Date().toISOString() },
            timestamp: new Date().toISOString()
        };
        
        this.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(JSON.stringify(message));
                } catch (error) {
                    logger.error('Error sending ping:', error);
                }
            }
        });
    }
}

module.exports = KdsSocket;