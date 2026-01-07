// Startup Manager for Electron Window Visibility Fix
// Orchestrates application initialization with proper dependency ordering

const EventEmitter = require('events');

/**
 * Startup status tracking
 */
const StartupStatus = {
    PENDING: 'pending',
    READY: 'ready',
    FAILED: 'failed'
};

/**
 * Overall startup states
 */
const OverallStatus = {
    INITIALIZING: 'initializing',
    READY: 'ready',
    FAILED: 'failed'
};

/**
 * Startup Manager class
 * Coordinates the application initialization sequence with proper dependency ordering
 */
class StartupManager extends EventEmitter {
    constructor() {
        super();
        this.status = {
            database: StartupStatus.PENDING,
            server: StartupStatus.PENDING,
            window: StartupStatus.PENDING,
            overall: OverallStatus.INITIALIZING
        };
        this.errors = [];
        this.startTime = null;
    }

    /**
     * Initialize the application with proper dependency ordering
     * Database -> Server -> Window
     * @returns {Promise<void>}
     */
    async initializeApp() {
        this.startTime = Date.now();
        this.emit('startup-progress', { phase: 'starting', message: 'Initializing application...' });

        try {
            // Step 1: Initialize Database (must be first)
            await this.initializeDatabase();

            // Step 2: Start Express Server (depends on database)
            await this.initializeServer();

            // Step 3: Create Window (depends on server)
            await this.initializeWindow();

            // All components ready
            this.status.overall = OverallStatus.READY;
            this.emit('startup-complete', {
                duration: Date.now() - this.startTime,
                status: this.status
            });

        } catch (error) {
            this.handleStartupError(error);
            throw error;
        }
    }

    /**
     * Initialize database with validation
     * @returns {Promise<void>}
     */
    async initializeDatabase() {
        this.emit('startup-progress', { phase: 'database', message: 'Initializing database...' });

        try {
            const database = require('./database.js');
            await database.initDatabase();

            this.status.database = StartupStatus.READY;
            this.emit('component-ready', { component: 'database' });

        } catch (error) {
            this.status.database = StartupStatus.FAILED;
            this.errors.push({ component: 'database', error: error.message });
            throw new Error(`Database initialization failed: ${error.message}`);
        }
    }

    /**
     * Initialize Express server
     * @returns {Promise<void>}
     */
    async initializeServer() {
        // Validate database is ready before starting server
        if (this.status.database !== StartupStatus.READY) {
            throw new Error('Cannot start server: Database not ready');
        }

        this.emit('startup-progress', { phase: 'server', message: 'Starting Express server...' });

        try {
            const { startServer } = require('../server.js');
            await startServer();

            this.status.server = StartupStatus.READY;
            this.emit('component-ready', { component: 'server' });

        } catch (error) {
            this.status.server = StartupStatus.FAILED;
            this.errors.push({ component: 'server', error: error.message });
            throw new Error(`Server initialization failed: ${error.message}`);
        }
    }

    /**
     * Initialize Electron window
     * @returns {Promise<void>}
     */
    async initializeWindow() {
        // Validate server is ready before creating window
        if (this.status.server !== StartupStatus.READY) {
            throw new Error('Cannot create window: Server not ready');
        }

        this.emit('startup-progress', { phase: 'window', message: 'Creating application window...' });

        try {
            // Window creation will be handled by the caller (electron.js)
            // This just validates the prerequisites are met
            this.status.window = StartupStatus.READY;
            this.emit('component-ready', { component: 'window' });

        } catch (error) {
            this.status.window = StartupStatus.FAILED;
            this.errors.push({ component: 'window', error: error.message });
            throw new Error(`Window initialization failed: ${error.message}`);
        }
    }

    /**
     * Validate all startup dependencies are available
     * @returns {Promise<boolean>}
     */
    async validateDependencies() {
        const dependencies = [];

        try {
            // Check database module
            require('./database.js');
            dependencies.push({ name: 'database', available: true });
        } catch (error) {
            dependencies.push({ name: 'database', available: false, error: error.message });
        }

        try {
            // Check server module
            require('../server.js');
            dependencies.push({ name: 'server', available: true });
        } catch (error) {
            dependencies.push({ name: 'server', available: false, error: error.message });
        }

        const allAvailable = dependencies.every(dep => dep.available);
        this.emit('dependencies-validated', { dependencies, allAvailable });

        return allAvailable;
    }

    /**
     * Handle startup errors with detailed logging
     * @param {Error} error - The startup error
     */
    handleStartupError(error) {
        this.status.overall = OverallStatus.FAILED;

        const errorInfo = {
            message: error.message,
            timestamp: new Date().toISOString(),
            duration: this.startTime ? Date.now() - this.startTime : 0,
            status: this.status,
            errors: this.errors
        };

        console.error('Startup failed:', errorInfo);
        this.emit('startup-error', errorInfo);
    }

    /**
     * Get current startup status
     * @returns {Object} Current status object
     */
    getStartupStatus() {
        return {
            ...this.status,
            errors: this.errors,
            duration: this.startTime ? Date.now() - this.startTime : 0
        };
    }

    /**
     * Reset startup manager to initial state
     */
    reset() {
        this.status = {
            database: StartupStatus.PENDING,
            server: StartupStatus.PENDING,
            window: StartupStatus.PENDING,
            overall: OverallStatus.INITIALIZING
        };
        this.errors = [];
        this.startTime = null;
    }
}

module.exports = {
    StartupManager,
    StartupStatus,
    OverallStatus
};