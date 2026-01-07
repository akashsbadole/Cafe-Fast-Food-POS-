// Property-Based Tests for Error Handler
// Feature: electron-window-visibility-fix, Property 5: Comprehensive Error Handling
// **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 5.5**

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const { ErrorHandler, ErrorSeverity, ErrorCategory, RecoveryAction } = require('./error-handler');

// Mock Electron dialog
jest.mock('electron', () => ({
    dialog: {
        showMessageBox: jest.fn(() => Promise.resolve({ response: 0 }))
    }
}));

// Mock fs for file operations
jest.mock('fs', () => ({
    promises: {
        appendFile: jest.fn(() => Promise.resolve()),
        stat: jest.fn(() => Promise.resolve({ size: 1000 })),
        rename: jest.fn(() => Promise.resolve())
    },
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn()
}));

describe('Error Handler Property Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Property 5: Comprehensive Error Handling
     * For any error during startup, the system must log detailed error information,
     * display user-friendly error dialogs for critical errors, provide progress feedback
     * during slow operations, and attempt recovery with clear instructions when recovery fails.
     * **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 5.5**
     */
    test('Property 5: Comprehensive Error Handling', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate various error scenarios
                fc.record({
                    errorType: fc.oneof(
                        fc.constant('Error'),
                        fc.constant('string'),
                        fc.constant('TypeError'),
                        fc.constant('ReferenceError')
                    ),
                    errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
                    component: fc.oneof(
                        fc.constant('database'),
                        fc.constant('server'),
                        fc.constant('window'),
                        fc.constant('startup'),
                        fc.constant('network'),
                        fc.constant('filesystem'),
                        fc.constant('unknown')
                    ),
                    operation: fc.string({ minLength: 1, maxLength: 50 }),
                    severity: fc.oneof(
                        fc.constant(ErrorSeverity.LOW),
                        fc.constant(ErrorSeverity.MEDIUM),
                        fc.constant(ErrorSeverity.HIGH),
                        fc.constant(ErrorSeverity.CRITICAL)
                    ),
                    shouldLogToFile: fc.boolean(),
                    shouldShowDialog: fc.boolean()
                }),
                async (scenario) => {
                    // Create error handler with test configuration
                    const errorHandler = new ErrorHandler({
                        logToFile: scenario.shouldLogToFile,
                        showUserDialogs: scenario.shouldShowDialog,
                        logFilePath: '/tmp/test-error.log'
                    });

                    // Create error based on scenario
                    let error;
                    switch (scenario.errorType) {
                        case 'Error':
                            error = new Error(scenario.errorMessage);
                            break;
                        case 'TypeError':
                            error = new TypeError(scenario.errorMessage);
                            break;
                        case 'ReferenceError':
                            error = new ReferenceError(scenario.errorMessage);
                            break;
                        default:
                            error = scenario.errorMessage;
                    }

                    const context = {
                        component: scenario.component,
                        operation: scenario.operation,
                        severity: scenario.severity
                    };

                    // Handle the error
                    const errorInfo = await errorHandler.handleError(error, context);

                    // Verify comprehensive error information is created (Requirement 3.1)
                    expect(errorInfo).toBeDefined();
                    expect(errorInfo.id).toBeDefined();
                    expect(errorInfo.timestamp).toBeInstanceOf(Date);
                    expect(errorInfo.message).toBe(scenario.errorMessage);
                    expect(errorInfo.component).toBe(scenario.component);
                    expect(errorInfo.operation).toBe(scenario.operation);
                    expect(errorInfo.severity).toBe(scenario.severity);
                    expect(errorInfo.category).toBeDefined();
                    expect(errorInfo.recoverable).toBeDefined();
                    expect(errorInfo.recoveryActions).toBeInstanceOf(Array);
                    expect(errorInfo.userFriendlyMessage).toBeDefined();

                    // Verify context information is included (Requirement 3.1)
                    expect(errorInfo.context).toBeDefined();
                    expect(errorInfo.context.platform).toBe(process.platform);
                    expect(errorInfo.context.nodeVersion).toBe(process.version);
                    expect(errorInfo.context.memoryUsage).toBeDefined();
                    expect(errorInfo.context.uptime).toBeDefined();

                    // Verify file logging behavior (Requirement 3.1)
                    if (scenario.shouldLogToFile) {
                        expect(fs.promises.appendFile).toHaveBeenCalled();
                        const logCall = fs.promises.appendFile.mock.calls[0];
                        expect(logCall[0]).toBe('/tmp/test-error.log');

                        // Verify log entry contains required information
                        const logEntry = JSON.parse(logCall[1]);
                        expect(logEntry.id).toBe(errorInfo.id);
                        expect(logEntry.severity).toBe(scenario.severity);
                        expect(logEntry.category).toBe(errorInfo.category);
                        expect(logEntry.component).toBe(scenario.component);
                        expect(logEntry.message).toBe(scenario.errorMessage);
                    }

                    // Verify user dialog behavior for critical/high severity errors (Requirement 3.3)
                    const shouldShowDialog = scenario.shouldShowDialog &&
                        (scenario.severity === ErrorSeverity.CRITICAL || scenario.severity === ErrorSeverity.HIGH);

                    if (shouldShowDialog) {
                        const { dialog } = require('electron');
                        expect(dialog.showMessageBox).toHaveBeenCalled();

                        const dialogCall = dialog.showMessageBox.mock.calls[0][0];
                        expect(dialogCall.title).toContain('Error');
                        expect(dialogCall.message).toBe(errorInfo.userFriendlyMessage);
                        expect(dialogCall.buttons).toBeInstanceOf(Array);
                        expect(dialogCall.buttons.length).toBeGreaterThan(0);
                    }

                    // Verify recovery actions are provided (Requirement 5.5)
                    expect(errorInfo.recoveryActions.length).toBeGreaterThan(0);
                    errorInfo.recoveryActions.forEach(action => {
                        expect(Object.values(RecoveryAction)).toContain(action);
                    });

                    // Verify user-friendly message is created (Requirement 3.4)
                    expect(errorInfo.userFriendlyMessage).toBeDefined();
                    expect(typeof errorInfo.userFriendlyMessage).toBe('string');
                    expect(errorInfo.userFriendlyMessage.length).toBeGreaterThan(0);

                    // Verify error categorization is consistent
                    expect(Object.values(ErrorCategory)).toContain(errorInfo.category);

                    // Verify severity is properly assigned
                    expect(Object.values(ErrorSeverity)).toContain(errorInfo.severity);

                    // Clean up
                    errorHandler.cleanup();
                }
            ),
            { numRuns: 100 } // Minimum 100 iterations as specified in design
        );
    });

    /**
     * Property: Progress Feedback Consistency
     * For any progress operation, the system must provide consistent feedback
     * and properly track operation lifecycle.
     * **Validates: Requirements 3.4**
     */
    test('Property: Progress Feedback Consistency', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    operationId: fc.string({ minLength: 1, maxLength: 50 }),
                    message: fc.string({ minLength: 1, maxLength: 100 }),
                    stage: fc.string({ minLength: 1, maxLength: 30 }),
                    progress: fc.integer({ min: 0, max: 100 }),
                    total: fc.integer({ min: 1, max: 1000 }),
                    enableProgressFeedback: fc.boolean()
                }),
                async (scenario) => {
                    const errorHandler = new ErrorHandler({
                        enableProgressFeedback: scenario.enableProgressFeedback
                    });

                    const progressEvents = [];
                    errorHandler.on('progress-started', (info) => progressEvents.push({ type: 'started', info }));
                    errorHandler.on('progress-updated', (info) => progressEvents.push({ type: 'updated', info }));
                    errorHandler.on('progress-completed', (info) => progressEvents.push({ type: 'completed', info }));

                    // Start progress feedback
                    errorHandler.startProgressFeedback(scenario.operationId, scenario.message, {
                        stage: scenario.stage,
                        progress: scenario.progress,
                        total: scenario.total
                    });

                    // Update progress
                    const updateMessage = `Updated: ${scenario.message}`;
                    errorHandler.updateProgressFeedback(scenario.operationId, {
                        message: updateMessage,
                        progress: Math.min(scenario.progress + 10, scenario.total)
                    });

                    // Complete progress
                    const result = { success: true };
                    errorHandler.completeProgressFeedback(scenario.operationId, result);

                    if (scenario.enableProgressFeedback) {
                        // Verify progress events were emitted in correct order
                        expect(progressEvents.length).toBeGreaterThanOrEqual(2);

                        const startEvent = progressEvents.find(e => e.type === 'started');
                        const completeEvent = progressEvents.find(e => e.type === 'completed');

                        expect(startEvent).toBeDefined();
                        expect(completeEvent).toBeDefined();

                        // Verify start event information
                        expect(startEvent.info.id).toBe(scenario.operationId);
                        expect(startEvent.info.message).toBe(scenario.message);
                        expect(startEvent.info.stage).toBe(scenario.stage);
                        expect(startEvent.info.progress).toBe(scenario.progress);
                        expect(startEvent.info.total).toBe(scenario.total);
                        expect(startEvent.info.startTime).toBeDefined();

                        // Verify completion event information
                        expect(completeEvent.info.id).toBe(scenario.operationId);
                        expect(completeEvent.info.completed).toBe(true);
                        expect(completeEvent.info.endTime).toBeDefined();
                        expect(completeEvent.info.duration).toBeGreaterThanOrEqual(0);
                        expect(completeEvent.info.result).toEqual(result);
                    } else {
                        // If progress feedback is disabled, no events should be emitted
                        expect(progressEvents.length).toBe(0);
                    }

                    errorHandler.cleanup();
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property: Recovery Instructions Consistency
     * For any error category, the system must provide appropriate recovery instructions.
     * **Validates: Requirements 5.5**
     */
    test('Property: Recovery Instructions Consistency', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.oneof(
                    fc.constant(ErrorCategory.DATABASE),
                    fc.constant(ErrorCategory.SERVER),
                    fc.constant(ErrorCategory.WINDOW),
                    fc.constant(ErrorCategory.NETWORK),
                    fc.constant(ErrorCategory.STARTUP),
                    fc.constant(ErrorCategory.FILESYSTEM),
                    fc.constant(ErrorCategory.SYSTEM),
                    fc.constant(ErrorCategory.UNKNOWN)
                ),
                fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
                async (category, errorCode) => {
                    const errorHandler = new ErrorHandler();

                    // Get recovery instructions for the category
                    const instructions = errorHandler.getRecoveryInstructions(category, errorCode);

                    // Verify instructions are provided
                    expect(instructions).toBeInstanceOf(Array);

                    // Known categories should have instructions
                    if (category !== ErrorCategory.UNKNOWN) {
                        expect(instructions.length).toBeGreaterThan(0);
                    }

                    // All instructions should be strings
                    instructions.forEach(instruction => {
                        expect(typeof instruction).toBe('string');
                        expect(instruction.length).toBeGreaterThan(0);
                    });

                    errorHandler.cleanup();
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property: Error Frequency Tracking
     * For any sequence of errors, the system must accurately track error frequency
     * and detect patterns.
     */
    test('Property: Error Frequency Tracking', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.record({
                        component: fc.oneof(
                            fc.constant('database'),
                            fc.constant('server'),
                            fc.constant('window')
                        ),
                        category: fc.oneof(
                            fc.constant(ErrorCategory.DATABASE),
                            fc.constant(ErrorCategory.SERVER),
                            fc.constant(ErrorCategory.WINDOW)
                        ),
                        message: fc.string({ minLength: 1, maxLength: 50 })
                    }),
                    { minLength: 1, maxLength: 20 }
                ),
                async (errorSequence) => {
                    const errorHandler = new ErrorHandler({
                        logToFile: false,
                        showUserDialogs: false
                    });

                    const frequentErrorEvents = [];
                    errorHandler.on('frequent-error-detected', (event) => {
                        frequentErrorEvents.push(event);
                    });

                    // Process all errors in sequence
                    for (const errorData of errorSequence) {
                        const error = new Error(errorData.message);
                        const context = {
                            component: errorData.component,
                            category: errorData.category
                        };

                        await errorHandler.handleError(error, context);
                    }

                    // Get error statistics
                    const stats = errorHandler.getErrorStatistics();

                    // Verify statistics are accurate
                    expect(stats.totalErrors).toBe(errorSequence.length);
                    expect(stats.errorsByCategory).toBeDefined();
                    expect(stats.errorsByComponent).toBeDefined();
                    expect(stats.frequentErrors).toBeInstanceOf(Array);

                    // Verify category counts
                    const categoryCount = {};
                    errorSequence.forEach(error => {
                        categoryCount[error.category] = (categoryCount[error.category] || 0) + 1;
                    });

                    Object.entries(categoryCount).forEach(([category, count]) => {
                        expect(stats.errorsByCategory[category]).toBe(count);
                    });

                    // Verify component counts
                    const componentCount = {};
                    errorSequence.forEach(error => {
                        componentCount[error.component] = (componentCount[error.component] || 0) + 1;
                    });

                    Object.entries(componentCount).forEach(([component, count]) => {
                        expect(stats.errorsByComponent[component]).toBe(count);
                    });

                    // Check for frequent error detection
                    const errorKeys = errorSequence.map(e => `${e.category}:${e.component}`);
                    const keyCount = {};
                    errorKeys.forEach(key => {
                        keyCount[key] = (keyCount[key] || 0) + 1;
                    });

                    const frequentKeys = Object.entries(keyCount).filter(([, count]) => count > 5);
                    expect(frequentErrorEvents.length).toBe(frequentKeys.length);

                    errorHandler.cleanup();
                }
            ),
            { numRuns: 50 }
        );
    });
});

// Unit tests for specific examples and edge cases
describe('Error Handler Unit Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle Error objects correctly', async () => {
        const errorHandler = new ErrorHandler({
            logToFile: false,
            showUserDialogs: false
        });

        const error = new Error('Test error message');
        const context = { component: 'test', operation: 'unit-test' };

        const errorInfo = await errorHandler.handleError(error, context);

        expect(errorInfo.message).toBe('Test error message');
        expect(errorInfo.stack).toBeDefined();
        expect(errorInfo.component).toBe('test');
        expect(errorInfo.operation).toBe('unit-test');
    });

    test('should handle string errors correctly', async () => {
        const errorHandler = new ErrorHandler({
            logToFile: false,
            showUserDialogs: false
        });

        const error = 'String error message';
        const context = { component: 'test' };

        const errorInfo = await errorHandler.handleError(error, context);

        expect(errorInfo.message).toBe('String error message');
        expect(errorInfo.stack).toBeNull();
        expect(errorInfo.component).toBe('test');
    });

    test('should categorize database errors correctly', async () => {
        const errorHandler = new ErrorHandler({
            logToFile: false,
            showUserDialogs: false
        });

        const error = new Error('Database connection failed');
        const errorInfo = await errorHandler.handleError(error);

        expect(errorInfo.category).toBe(ErrorCategory.DATABASE);
    });

    test('should categorize server errors correctly', async () => {
        const errorHandler = new ErrorHandler({
            logToFile: false,
            showUserDialogs: false
        });

        const error = new Error('Server failed to start on port 3000');
        const errorInfo = await errorHandler.handleError(error);

        expect(errorInfo.category).toBe(ErrorCategory.SERVER);
    });

    test('should determine critical severity for startup errors', async () => {
        const errorHandler = new ErrorHandler({
            logToFile: false,
            showUserDialogs: false
        });

        const error = new Error('Failed to initialize application');
        const context = { component: 'startup' };
        const errorInfo = await errorHandler.handleError(error, context);

        expect(errorInfo.severity).toBe(ErrorSeverity.CRITICAL);
    });

    test('should provide recovery actions for database errors', async () => {
        const errorHandler = new ErrorHandler({
            logToFile: false,
            showUserDialogs: false
        });

        const error = new Error('Database locked');
        const errorInfo = await errorHandler.handleError(error);

        expect(errorInfo.recoveryActions).toContain(RecoveryAction.RETRY);
        expect(errorInfo.recoveryActions).toContain(RecoveryAction.RESTART);
    });

    test('should create user-friendly messages', async () => {
        const errorHandler = new ErrorHandler({
            logToFile: false,
            showUserDialogs: false
        });

        const error = new Error('ECONNREFUSED');
        const context = { category: ErrorCategory.NETWORK };
        const errorInfo = await errorHandler.handleError(error, context);

        expect(errorInfo.userFriendlyMessage).toContain('network');
        expect(errorInfo.userFriendlyMessage.length).toBeGreaterThan(10);
    });

    test('should track progress operations correctly', () => {
        const errorHandler = new ErrorHandler();

        const operationId = 'test-operation';
        const message = 'Testing progress';

        errorHandler.startProgressFeedback(operationId, message);
        errorHandler.updateProgressFeedback(operationId, { progress: 50 });
        errorHandler.completeProgressFeedback(operationId, { success: true });

        // Operation should be removed after completion
        expect(errorHandler.progressOperations.has(operationId)).toBe(false);
    });

    test('should provide recovery instructions for all categories', () => {
        const errorHandler = new ErrorHandler();

        const categories = [
            ErrorCategory.DATABASE,
            ErrorCategory.SERVER,
            ErrorCategory.WINDOW,
            ErrorCategory.NETWORK,
            ErrorCategory.STARTUP
        ];

        categories.forEach(category => {
            const instructions = errorHandler.getRecoveryInstructions(category);
            expect(instructions.length).toBeGreaterThan(0);
            instructions.forEach(instruction => {
                expect(typeof instruction).toBe('string');
                expect(instruction.length).toBeGreaterThan(0);
            });
        });
    });

    test('should clear history and reset counters', async () => {
        const errorHandler = new ErrorHandler({
            logToFile: false,
            showUserDialogs: false
        });

        // Add some errors
        await errorHandler.handleError(new Error('Test 1'));
        await errorHandler.handleError(new Error('Test 2'));

        expect(errorHandler.errorHistory.length).toBe(2);
        expect(errorHandler.errorCounts.size).toBeGreaterThan(0);

        errorHandler.clearHistory();

        expect(errorHandler.errorHistory.length).toBe(0);
        expect(errorHandler.errorCounts.size).toBe(0);
    });
});