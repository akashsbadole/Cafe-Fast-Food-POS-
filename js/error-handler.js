// Comprehensive Error Handler for Electron Window Visibility Fix
// Centralized error management with detailed logging, user dialogs, and recovery instructions

const { dialog } = require('electron');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

/**
 * Error severity levels
 */
const ErrorSeverity = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Error categories for better organization and handling
 */
const ErrorCategory = {
    DATABASE: 'database',
    SERVER: 'server',
    WINDOW: 'window',
    STARTUP: 'startup',
    NETWORK: 'network',
    FILESYSTEM: 'filesystem',
    SYSTEM: 'system',
    UNKNOWN: 'unknown'
};

/**
 * Recovery action types
 */
const RecoveryAction = {
    RETRY: 'retry',
    RESTART: 'restart',
    MANUAL: 'manual',
    IGNORE: 'ignore',
    EXIT: 'exit'
};

/**
 * Comprehensive Error Handler class
 * Provides centralized error management with logging, user dialogs, and recovery
 */
class ErrorHandler extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            logToFile: options.logToFile !== false,
            logFilePath: options.logFilePath || path.join(__dirname, '../data/error.log'),
            showUserDialogs: options.showUserDialogs !== false,
            maxLogFileSize: options.maxLogFileSize || 10 * 1024 * 1024, // 10MB
            enableProgressFeedback: options.enableProgressFeedback !== false,
            ...options
        };

        this.errorHistory = [];
        this.progressOperations = new Map();
        this.recoveryInstructions = new Map();
        this.errorCounts = new Map();

        // Initialize recovery instructions
        this.initializeRecoveryInstructions();

        // Ensure log directory exists
        this.ensureLogDirectory();
    }

    /**
     * Handle an error with comprehensive logging and user feedback
     * @param {Error|string} error - The error to handle
     * @param {Object} context - Additional context information
     * @returns {Promise<Object>} Error handling result
     */
    async handleError(error, context = {}) {
        const errorInfo = this.createErrorInfo(error, context);

        // Log the error
        await this.logError(errorInfo);

        // Track error frequency
        this.trackErrorFrequency(errorInfo);

        // Emit error event for listeners
        this.emit('error-handled', errorInfo);

        // Determine if user dialog should be shown
        if (this.shouldShowUserDialog(errorInfo)) {
            const userResponse = await this.showErrorDialog(errorInfo);
            errorInfo.userResponse = userResponse;
        }

        // Add to error history
        this.errorHistory.push(errorInfo);

        // Trim error history if too large
        if (this.errorHistory.length > 1000) {
            this.errorHistory = this.errorHistory.slice(-500);
        }

        return errorInfo;
    }

    /**
     * Create comprehensive error information object
     * @param {Error|string} error - The error
     * @param {Object} context - Additional context
     * @returns {Object} Comprehensive error info
     */
    createErrorInfo(error, context) {
        const timestamp = new Date();
        const errorMessage = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : null;

        return {
            id: this.generateErrorId(),
            timestamp,
            message: errorMessage,
            stack,
            category: this.categorizeError(error, context),
            severity: this.determineSeverity(error, context),
            component: context.component || 'unknown',
            operation: context.operation || 'unknown',
            context: {
                ...context,
                platform: process.platform,
                nodeVersion: process.version,
                electronVersion: process.versions.electron,
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime()
            },
            recoverable: this.isRecoverable(error, context),
            recoveryActions: this.getRecoveryActions(error, context),
            userFriendlyMessage: this.createUserFriendlyMessage(error, context)
        };
    }

    /**
     * Log error with detailed context information
     * @param {Object} errorInfo - Comprehensive error information
     * @returns {Promise<void>}
     */
    async logError(errorInfo) {
        const logEntry = {
            timestamp: errorInfo.timestamp.toISOString(),
            id: errorInfo.id,
            severity: errorInfo.severity,
            category: errorInfo.category,
            component: errorInfo.component,
            operation: errorInfo.operation,
            message: errorInfo.message,
            stack: errorInfo.stack,
            context: errorInfo.context,
            recoverable: errorInfo.recoverable,
            recoveryActions: errorInfo.recoveryActions
        };

        // Console logging with color coding
        this.logToConsole(errorInfo);

        // File logging if enabled
        if (this.options.logToFile) {
            await this.logToFile(logEntry);
        }

        // Emit log event
        this.emit('error-logged', logEntry);
    }

    /**
     * Log error to console with appropriate formatting
     * @param {Object} errorInfo - Error information
     */
    logToConsole(errorInfo) {
        const colors = {
            [ErrorSeverity.LOW]: '\x1b[36m',      // Cyan
            [ErrorSeverity.MEDIUM]: '\x1b[33m',   // Yellow
            [ErrorSeverity.HIGH]: '\x1b[31m',     // Red
            [ErrorSeverity.CRITICAL]: '\x1b[35m'  // Magenta
        };

        const reset = '\x1b[0m';
        const color = colors[errorInfo.severity] || colors[ErrorSeverity.MEDIUM];

        console.error(`${color}[${errorInfo.severity.toUpperCase()}] ${errorInfo.category}/${errorInfo.component}${reset}`);
        console.error(`${color}Error ID: ${errorInfo.id}${reset}`);
        console.error(`${color}Message: ${errorInfo.message}${reset}`);

        if (errorInfo.operation !== 'unknown') {
            console.error(`${color}Operation: ${errorInfo.operation}${reset}`);
        }

        if (errorInfo.stack && errorInfo.severity !== ErrorSeverity.LOW) {
            console.error(`${color}Stack:${reset}`);
            console.error(errorInfo.stack);
        }

        if (errorInfo.recoveryActions.length > 0) {
            console.error(`${color}Recovery Actions: ${errorInfo.recoveryActions.join(', ')}${reset}`);
        }

        console.error('---');
    }

    /**
     * Log error to file
     * @param {Object} logEntry - Log entry to write
     * @returns {Promise<void>}
     */
    async logToFile(logEntry) {
        try {
            // Check file size and rotate if necessary
            await this.rotateLogFileIfNeeded();

            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.promises.appendFile(this.options.logFilePath, logLine, 'utf8');

        } catch (fileError) {
            console.error('Failed to write to log file:', fileError.message);
        }
    }

    /**
     * Show user-friendly error dialog
     * @param {Object} errorInfo - Error information
     * @returns {Promise<Object>} User response
     */
    async showErrorDialog(errorInfo) {
        if (!this.options.showUserDialogs) {
            return { action: 'ignore' };
        }

        try {
            const buttons = this.getDialogButtons(errorInfo);
            const dialogOptions = {
                type: this.getDialogType(errorInfo.severity),
                title: `${errorInfo.category.charAt(0).toUpperCase() + errorInfo.category.slice(1)} Error`,
                message: errorInfo.userFriendlyMessage,
                detail: this.createDialogDetail(errorInfo),
                buttons: buttons.map(btn => btn.label),
                defaultId: 0,
                cancelId: buttons.length - 1
            };

            const response = await dialog.showMessageBox(dialogOptions);
            const selectedButton = buttons[response.response];

            this.emit('user-dialog-response', {
                errorId: errorInfo.id,
                action: selectedButton.action,
                buttonIndex: response.response
            });

            return {
                action: selectedButton.action,
                buttonIndex: response.response,
                timestamp: new Date()
            };

        } catch (dialogError) {
            console.error('Failed to show error dialog:', dialogError.message);
            return { action: 'ignore', error: dialogError.message };
        }
    }

    /**
     * Start progress feedback for slow operations
     * @param {string} operationId - Unique operation identifier
     * @param {string} message - Progress message
     * @param {Object} options - Progress options
     */
    startProgressFeedback(operationId, message, options = {}) {
        if (!this.options.enableProgressFeedback) {
            return;
        }

        const progressInfo = {
            id: operationId,
            message,
            startTime: Date.now(),
            lastUpdate: Date.now(),
            stage: options.stage || 'starting',
            progress: options.progress || 0,
            total: options.total || 100,
            ...options
        };

        this.progressOperations.set(operationId, progressInfo);

        console.log(`[PROGRESS] ${message} (${operationId})`);
        this.emit('progress-started', progressInfo);
    }

    /**
     * Update progress feedback
     * @param {string} operationId - Operation identifier
     * @param {Object} update - Progress update
     */
    updateProgressFeedback(operationId, update) {
        if (!this.options.enableProgressFeedback) {
            return;
        }

        const progressInfo = this.progressOperations.get(operationId);
        if (!progressInfo) {
            return;
        }

        Object.assign(progressInfo, update, {
            lastUpdate: Date.now(),
            duration: Date.now() - progressInfo.startTime
        });

        if (update.message) {
            console.log(`[PROGRESS] ${update.message} (${operationId})`);
        }

        this.emit('progress-updated', progressInfo);
    }

    /**
     * Complete progress feedback
     * @param {string} operationId - Operation identifier
     * @param {Object} result - Operation result
     */
    completeProgressFeedback(operationId, result = {}) {
        if (!this.options.enableProgressFeedback) {
            return;
        }

        const progressInfo = this.progressOperations.get(operationId);
        if (!progressInfo) {
            return;
        }

        const completedInfo = {
            ...progressInfo,
            completed: true,
            endTime: Date.now(),
            duration: Date.now() - progressInfo.startTime,
            result
        };

        console.log(`[PROGRESS] Completed: ${progressInfo.message} (${operationId}) - ${completedInfo.duration}ms`);

        this.progressOperations.delete(operationId);
        this.emit('progress-completed', completedInfo);
    }

    /**
     * Get recovery instructions for an error
     * @param {string} errorCategory - Error category
     * @param {string} errorCode - Specific error code
     * @returns {Array<string>} Recovery instructions
     */
    getRecoveryInstructions(errorCategory, errorCode = null) {
        const categoryInstructions = this.recoveryInstructions.get(errorCategory) || [];

        if (errorCode) {
            const specificInstructions = this.recoveryInstructions.get(`${errorCategory}:${errorCode}`) || [];
            return [...specificInstructions, ...categoryInstructions];
        }

        return categoryInstructions;
    }

    /**
     * Categorize error based on error object and context
     * @param {Error|string} error - The error
     * @param {Object} context - Error context
     * @returns {string} Error category
     */
    categorizeError(error, context) {
        if (context.category) {
            return context.category;
        }

        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

        if (message.includes('database') || message.includes('sqlite') || message.includes('sql')) {
            return ErrorCategory.DATABASE;
        }
        if (message.includes('server') || message.includes('port') || message.includes('listen')) {
            return ErrorCategory.SERVER;
        }
        if (message.includes('window') || message.includes('display') || message.includes('screen')) {
            return ErrorCategory.WINDOW;
        }
        if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
            return ErrorCategory.NETWORK;
        }
        if (message.includes('file') || message.includes('directory') || message.includes('path')) {
            return ErrorCategory.FILESYSTEM;
        }
        if (context.component === 'startup' || message.includes('startup') || message.includes('initialization')) {
            return ErrorCategory.STARTUP;
        }

        return ErrorCategory.UNKNOWN;
    }

    /**
     * Determine error severity
     * @param {Error|string} error - The error
     * @param {Object} context - Error context
     * @returns {string} Error severity
     */
    determineSeverity(error, context) {
        if (context.severity) {
            return context.severity;
        }

        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

        // Critical errors that prevent app from functioning
        if (message.includes('failed to initialize') ||
            message.includes('cannot create window') ||
            message.includes('database initialization failed') ||
            context.component === 'startup') {
            return ErrorSeverity.CRITICAL;
        }

        // High severity errors that significantly impact functionality
        if (message.includes('server failed') ||
            message.includes('connection failed') ||
            message.includes('timeout')) {
            return ErrorSeverity.HIGH;
        }

        // Medium severity for recoverable issues
        if (message.includes('retry') || message.includes('fallback')) {
            return ErrorSeverity.MEDIUM;
        }

        return ErrorSeverity.LOW;
    }

    /**
     * Determine if error is recoverable
     * @param {Error|string} error - The error
     * @param {Object} context - Error context
     * @returns {boolean} True if recoverable
     */
    isRecoverable(error, context) {
        if (context.recoverable !== undefined) {
            return context.recoverable;
        }

        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

        // Non-recoverable errors
        if (message.includes('out of memory') ||
            message.includes('permission denied') ||
            message.includes('access denied')) {
            return false;
        }

        // Most errors are potentially recoverable
        return true;
    }

    /**
     * Get possible recovery actions for an error
     * @param {Error|string} error - The error
     * @param {Object} context - Error context
     * @returns {Array<string>} Recovery actions
     */
    getRecoveryActions(error, context) {
        const category = this.categorizeError(error, context);
        const actions = [];

        switch (category) {
            case ErrorCategory.DATABASE:
                actions.push(RecoveryAction.RETRY, RecoveryAction.RESTART);
                break;
            case ErrorCategory.SERVER:
                actions.push(RecoveryAction.RETRY, RecoveryAction.MANUAL);
                break;
            case ErrorCategory.WINDOW:
                actions.push(RecoveryAction.RETRY, RecoveryAction.RESTART);
                break;
            case ErrorCategory.NETWORK:
                actions.push(RecoveryAction.RETRY, RecoveryAction.MANUAL);
                break;
            case ErrorCategory.STARTUP:
                actions.push(RecoveryAction.RESTART, RecoveryAction.MANUAL);
                break;
            default:
                actions.push(RecoveryAction.RETRY, RecoveryAction.IGNORE);
        }

        return actions;
    }

    /**
     * Create user-friendly error message
     * @param {Error|string} error - The error
     * @param {Object} context - Error context
     * @returns {string} User-friendly message
     */
    createUserFriendlyMessage(error, context) {
        const category = this.categorizeError(error, context);
        const severity = this.determineSeverity(error, context);

        const baseMessages = {
            [ErrorCategory.DATABASE]: 'There was a problem with the database connection.',
            [ErrorCategory.SERVER]: 'The application server encountered an issue.',
            [ErrorCategory.WINDOW]: 'There was a problem creating the application window.',
            [ErrorCategory.NETWORK]: 'A network connectivity issue occurred.',
            [ErrorCategory.FILESYSTEM]: 'There was a problem accessing files.',
            [ErrorCategory.STARTUP]: 'The application failed to start properly.',
            [ErrorCategory.UNKNOWN]: 'An unexpected error occurred.'
        };

        let message = baseMessages[category] || baseMessages[ErrorCategory.UNKNOWN];

        if (severity === ErrorSeverity.CRITICAL) {
            message += ' This is a critical issue that prevents the application from running.';
        } else if (severity === ErrorSeverity.HIGH) {
            message += ' This may affect the application\'s functionality.';
        }

        return message;
    }

    /**
     * Initialize recovery instructions for different error types
     */
    initializeRecoveryInstructions() {
        // Database recovery instructions
        this.recoveryInstructions.set(ErrorCategory.DATABASE, [
            'Check if the database file is accessible',
            'Ensure no other instances of the application are running',
            'Verify disk space is available',
            'Try restarting the application'
        ]);

        // Server recovery instructions
        this.recoveryInstructions.set(ErrorCategory.SERVER, [
            'Check if the port is available',
            'Verify firewall settings allow the application',
            'Try running as administrator if needed',
            'Check for conflicting applications using the same port'
        ]);

        // Window recovery instructions
        this.recoveryInstructions.set(ErrorCategory.WINDOW, [
            'Check display settings and resolution',
            'Ensure graphics drivers are up to date',
            'Try connecting an external monitor if using a laptop',
            'Restart the application'
        ]);

        // Network recovery instructions
        this.recoveryInstructions.set(ErrorCategory.NETWORK, [
            'Check internet connectivity',
            'Verify firewall and antivirus settings',
            'Try disabling VPN if active',
            'Check proxy settings'
        ]);

        // Startup recovery instructions
        this.recoveryInstructions.set(ErrorCategory.STARTUP, [
            'Close all instances of the application',
            'Restart your computer',
            'Run the application as administrator',
            'Check system requirements are met'
        ]);
    }

    // Helper methods for dialog handling

    /**
     * Determine if user dialog should be shown
     * @param {Object} errorInfo - Error information
     * @returns {boolean} True if dialog should be shown
     */
    shouldShowUserDialog(errorInfo) {
        return errorInfo.severity === ErrorSeverity.CRITICAL ||
            errorInfo.severity === ErrorSeverity.HIGH;
    }

    /**
     * Get dialog type based on severity
     * @param {string} severity - Error severity
     * @returns {string} Dialog type
     */
    getDialogType(severity) {
        switch (severity) {
            case ErrorSeverity.CRITICAL:
                return 'error';
            case ErrorSeverity.HIGH:
                return 'warning';
            default:
                return 'info';
        }
    }

    /**
     * Get dialog buttons based on error info
     * @param {Object} errorInfo - Error information
     * @returns {Array<Object>} Dialog buttons
     */
    getDialogButtons(errorInfo) {
        const buttons = [];

        if (errorInfo.recoverable && errorInfo.recoveryActions.includes(RecoveryAction.RETRY)) {
            buttons.push({ label: 'Retry', action: RecoveryAction.RETRY });
        }

        if (errorInfo.recoveryActions.includes(RecoveryAction.RESTART)) {
            buttons.push({ label: 'Restart Application', action: RecoveryAction.RESTART });
        }

        if (errorInfo.recoveryActions.includes(RecoveryAction.MANUAL)) {
            buttons.push({ label: 'Show Instructions', action: RecoveryAction.MANUAL });
        }

        buttons.push({ label: 'Continue', action: RecoveryAction.IGNORE });

        if (errorInfo.severity === ErrorSeverity.CRITICAL) {
            buttons.push({ label: 'Exit', action: RecoveryAction.EXIT });
        }

        return buttons;
    }

    /**
     * Create detailed dialog text
     * @param {Object} errorInfo - Error information
     * @returns {string} Dialog detail text
     */
    createDialogDetail(errorInfo) {
        let detail = `Error ID: ${errorInfo.id}\n`;
        detail += `Component: ${errorInfo.component}\n`;

        if (errorInfo.operation !== 'unknown') {
            detail += `Operation: ${errorInfo.operation}\n`;
        }

        if (errorInfo.recoverable) {
            detail += '\nThis error may be recoverable. You can try the suggested actions.';
        }

        const instructions = this.getRecoveryInstructions(errorInfo.category);
        if (instructions.length > 0) {
            detail += '\n\nSuggested actions:\n';
            detail += instructions.map(instruction => `• ${instruction}`).join('\n');
        }

        return detail;
    }

    // Utility methods

    /**
     * Generate unique error ID
     * @returns {string} Unique error ID
     */
    generateErrorId() {
        return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Track error frequency for pattern analysis
     * @param {Object} errorInfo - Error information
     */
    trackErrorFrequency(errorInfo) {
        const key = `${errorInfo.category}:${errorInfo.component}`;
        const count = this.errorCounts.get(key) || 0;
        this.errorCounts.set(key, count + 1);

        // Emit frequent error warning if threshold exceeded
        if (count > 5) {
            this.emit('frequent-error-detected', {
                key,
                count: count + 1,
                errorInfo
            });
        }
    }

    /**
     * Ensure log directory exists
     */
    ensureLogDirectory() {
        if (!this.options.logToFile) {
            return;
        }

        try {
            const logDir = path.dirname(this.options.logFilePath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        } catch (error) {
            console.error('Failed to create log directory:', error.message);
        }
    }

    /**
     * Rotate log file if it exceeds size limit
     * @returns {Promise<void>}
     */
    async rotateLogFileIfNeeded() {
        try {
            const stats = await fs.promises.stat(this.options.logFilePath);
            if (stats.size > this.options.maxLogFileSize) {
                const backupPath = `${this.options.logFilePath}.old`;
                await fs.promises.rename(this.options.logFilePath, backupPath);
            }
        } catch (error) {
            // File doesn't exist yet, which is fine
            if (error.code !== 'ENOENT') {
                console.error('Failed to rotate log file:', error.message);
            }
        }
    }

    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getErrorStatistics() {
        const stats = {
            totalErrors: this.errorHistory.length,
            errorsByCategory: {},
            errorsBySeverity: {},
            errorsByComponent: {},
            frequentErrors: Array.from(this.errorCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10),
            recentErrors: this.errorHistory.slice(-10)
        };

        // Calculate category distribution
        this.errorHistory.forEach(error => {
            stats.errorsByCategory[error.category] = (stats.errorsByCategory[error.category] || 0) + 1;
            stats.errorsBySeverity[error.severity] = (stats.errorsBySeverity[error.severity] || 0) + 1;
            stats.errorsByComponent[error.component] = (stats.errorsByComponent[error.component] || 0) + 1;
        });

        return stats;
    }

    /**
     * Clear error history and reset counters
     */
    clearHistory() {
        this.errorHistory = [];
        this.errorCounts.clear();
        this.emit('history-cleared');
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.progressOperations.clear();
        this.removeAllListeners();
    }
}

module.exports = {
    ErrorHandler,
    ErrorSeverity,
    ErrorCategory,
    RecoveryAction
};