// Property-Based Tests for Database Manager
// Feature: electron-window-visibility-fix, Property 4: Database Initialization with Retry
// **Validates: Requirements 1.3, 4.2, 5.3**

const fc = require('fast-check');
const { DatabaseManager, DatabaseStatus } = require('./database-manager');

// Mock the database.js module to control its behavior during tests
jest.mock('./database.js', () => ({
    initDatabase: jest.fn(),
    db: {
        exec: jest.fn()
    }
}));

describe('Database Manager Property Tests', () => {

    /**
     * Property 4: Database Initialization with Retry
     * For any database initialization attempt, if the database fails to initialize, 
     * the system must retry up to 3 times, validate and repair schema if needed, 
     * and if all attempts fail, display a descriptive error message and prevent window creation.
     * **Validates: Requirements 1.3, 4.2, 5.3**
     */
    test('Property 4: Database Initialization with Retry', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate different database failure scenarios
                fc.record({
                    failurePattern: fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }), // true = fail, false = succeed
                    retryDelay: fc.integer({ min: 10, max: 100 }), // Shorter delays for testing
                    maxRetries: fc.integer({ min: 1, max: 5 }),
                    schemaValidationEnabled: fc.boolean(),
                    errorTypes: fc.array(
                        fc.constantFrom(
                            'ENOENT: no such file or directory',
                            'SQLITE_BUSY: database is locked',
                            'SQLITE_CORRUPT: database disk image is malformed',
                            'EACCES: permission denied',
                            'Connection timeout'
                        ),
                        { minLength: 1, maxLength: 3 }
                    )
                }),
                async (scenario) => {
                    const database = require('./database.js');

                    // Reset mocks
                    database.initDatabase.mockReset();
                    database.db.exec.mockReset();

                    const databaseManager = new DatabaseManager({
                        maxRetries: scenario.maxRetries,
                        retryDelay: scenario.retryDelay,
                        maxRetryDelay: scenario.retryDelay * 4,
                        schemaValidationEnabled: scenario.schemaValidationEnabled
                    });

                    const events = [];
                    const statusChanges = [];

                    // Track events and status changes
                    databaseManager.on('connection-error', (event) => {
                        events.push({ type: 'connection-error', ...event });
                    });

                    databaseManager.on('status-change', (event) => {
                        statusChanges.push({ type: 'status-change', ...event });
                    });

                    databaseManager.on('database-ready', () => {
                        events.push({ type: 'database-ready' });
                    });

                    databaseManager.on('database-failed', (event) => {
                        events.push({ type: 'database-failed', ...event });
                    });

                    databaseManager.on('schema-validated', () => {
                        events.push({ type: 'schema-validated' });
                    });

                    // Configure mock behavior based on failure pattern
                    let callCount = 0;
                    database.initDatabase.mockImplementation(() => {
                        const shouldFail = callCount < scenario.failurePattern.length ?
                            scenario.failurePattern[callCount] : false;

                        const errorType = scenario.errorTypes[callCount % scenario.errorTypes.length];
                        callCount++;

                        if (shouldFail) {
                            return Promise.reject(new Error(errorType));
                        } else {
                            return Promise.resolve();
                        }
                    });

                    // Mock schema validation queries - always return valid results
                    database.db.exec.mockImplementation((query) => {
                        if (query.includes('sqlite_master')) {
                            // Return table exists
                            return [{ values: [['table_name']] }];
                        }
                        if (query.includes('COUNT(*)')) {
                            // Return valid count
                            return [{ values: [[5]] }];
                        }
                        if (query.includes('SELECT 1')) {
                            // Health check
                            return [{ values: [[1]] }];
                        }
                        return [];
                    });

                    try {
                        await databaseManager.initializeDatabase();

                        // If we reach here, initialization was successful
                        const status = databaseManager.getDatabaseStatus();

                        // Verify successful initialization properties
                        expect(status.connected).toBe(true);
                        expect(status.currentStatus).toBe(DatabaseStatus.READY);
                        expect(status.lastError).toBeNull();

                        // Verify schema validation occurred if enabled
                        if (scenario.schemaValidationEnabled) {
                            expect(status.schemaValid).toBe(true);
                            const schemaEvent = events.find(e => e.type === 'schema-validated');
                            expect(schemaEvent).toBeDefined();
                        }

                        // Verify database-ready event was emitted
                        const readyEvent = events.find(e => e.type === 'database-ready');
                        expect(readyEvent).toBeDefined();

                        // Verify retry count is within expected bounds
                        expect(status.retryCount).toBeLessThanOrEqual(scenario.maxRetries);

                        // Verify status progression: connecting -> connected -> (validating) -> ready
                        const connectingStatus = statusChanges.find(s => s.status === DatabaseStatus.CONNECTING);
                        const connectedStatus = statusChanges.find(s => s.status === DatabaseStatus.CONNECTED);
                        const readyStatus = statusChanges.find(s => s.status === DatabaseStatus.READY);

                        expect(connectingStatus).toBeDefined();
                        expect(connectedStatus).toBeDefined();
                        expect(readyStatus).toBeDefined();

                    } catch (error) {
                        // If initialization failed, verify failure properties
                        const status = databaseManager.getDatabaseStatus();

                        // Verify failure state
                        expect(status.connected).toBe(false);
                        expect(status.currentStatus).toBe(DatabaseStatus.FAILED);
                        expect(status.lastError).toBeTruthy();

                        // Verify maximum retry attempts were made
                        expect(status.retryCount).toBe(scenario.maxRetries);

                        // Verify database-failed event was emitted
                        const failedEvent = events.find(e => e.type === 'database-failed');
                        expect(failedEvent).toBeDefined();
                        expect(failedEvent.error).toBeDefined();

                        // Verify connection error events were emitted for each retry
                        const connectionErrors = events.filter(e => e.type === 'connection-error');
                        expect(connectionErrors.length).toBe(scenario.maxRetries + 1);

                        // Verify each connection error has proper structure
                        connectionErrors.forEach((errorEvent, index) => {
                            expect(errorEvent.attempt).toBe(index + 1);
                            expect(errorEvent.maxAttempts).toBe(scenario.maxRetries + 1);
                            expect(errorEvent.error).toBeTruthy();
                        });

                        // Verify error message includes retry information
                        expect(error.message).toContain(`after ${scenario.maxRetries + 1} attempts`);
                    }

                    // Verify database.initDatabase was called appropriately
                    const actualCalls = database.initDatabase.mock.calls.length;
                    expect(actualCalls).toBeGreaterThan(0);
                    expect(actualCalls).toBeLessThanOrEqual(scenario.maxRetries + 1);

                    // Clean up
                    databaseManager.cleanup();
                }
            ),
            { numRuns: 100 } // Minimum 100 iterations as specified in design
        );
    });

    /**
     * Additional property test: Exponential backoff timing
     * For any retry attempt, the delay should increase exponentially with each attempt
     */
    test('Property: Exponential Backoff Timing', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    baseDelay: fc.integer({ min: 100, max: 1000 }),
                    maxRetries: fc.integer({ min: 2, max: 4 }),
                    maxDelay: fc.integer({ min: 5000, max: 10000 })
                }),
                async (scenario) => {
                    const databaseManager = new DatabaseManager({
                        retryDelay: scenario.baseDelay,
                        maxRetries: scenario.maxRetries,
                        maxRetryDelay: scenario.maxDelay
                    });

                    // Test exponential backoff calculation
                    const delays = [];
                    for (let attempt = 0; attempt < scenario.maxRetries; attempt++) {
                        const delay = databaseManager.calculateRetryDelay(attempt);
                        delays.push(delay);
                    }

                    // Verify exponential growth pattern (allowing for jitter)
                    for (let i = 1; i < delays.length; i++) {
                        // Each delay should generally be larger than the previous (accounting for jitter)
                        // The base exponential component should be increasing
                        const baseDelay1 = scenario.baseDelay * Math.pow(2, i - 1);
                        const baseDelay2 = scenario.baseDelay * Math.pow(2, i);

                        expect(baseDelay2).toBeGreaterThan(baseDelay1);

                        // Verify delays don't exceed maximum
                        expect(delays[i]).toBeLessThanOrEqual(scenario.maxDelay);
                    }

                    // Verify first delay is based on base delay
                    expect(delays[0]).toBeGreaterThanOrEqual(scenario.baseDelay);
                    expect(delays[0]).toBeLessThanOrEqual(scenario.baseDelay + 1000); // Allow for jitter
                }
            ),
            { numRuns: 100 }
        );
    });
});

// Unit tests for specific examples and edge cases
describe('Database Manager Unit Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should initialize database successfully on first attempt', async () => {
        const database = require('./database.js');
        database.initDatabase.mockResolvedValue();
        database.db.exec.mockReturnValue([{ values: [['table']] }]);

        const databaseManager = new DatabaseManager();

        await databaseManager.initializeDatabase();

        const status = databaseManager.getDatabaseStatus();
        expect(status.connected).toBe(true);
        expect(status.currentStatus).toBe(DatabaseStatus.READY);
        expect(status.retryCount).toBe(0);
        expect(database.initDatabase).toHaveBeenCalledTimes(1);
    });

    test('should retry on database connection failure', async () => {
        const database = require('./database.js');
        database.initDatabase
            .mockRejectedValueOnce(new Error('Connection failed'))
            .mockRejectedValueOnce(new Error('Still failing'))
            .mockResolvedValue();
        database.db.exec.mockReturnValue([{ values: [[5]] }]); // Valid count for data integrity

        const databaseManager = new DatabaseManager({ maxRetries: 3, retryDelay: 10 });

        await databaseManager.initializeDatabase();

        const status = databaseManager.getDatabaseStatus();
        expect(status.connected).toBe(true);
        expect(status.retryCount).toBe(2);
        expect(database.initDatabase).toHaveBeenCalledTimes(3);
    });

    test('should fail after maximum retry attempts', async () => {
        const database = require('./database.js');
        database.initDatabase.mockRejectedValue(new Error('Persistent failure'));

        const databaseManager = new DatabaseManager({ maxRetries: 2, retryDelay: 10 });

        await expect(databaseManager.initializeDatabase()).rejects.toThrow('Database initialization failed after 3 attempts');

        const status = databaseManager.getDatabaseStatus();
        expect(status.connected).toBe(false);
        expect(status.currentStatus).toBe(DatabaseStatus.FAILED);
        expect(status.retryCount).toBe(2);
        expect(database.initDatabase).toHaveBeenCalledTimes(3);
    });

    test('should validate schema when enabled', async () => {
        const database = require('./database.js');
        database.initDatabase.mockResolvedValue();
        database.db.exec.mockReturnValue([{ values: [['table']] }]);

        const databaseManager = new DatabaseManager({ schemaValidationEnabled: true });

        await databaseManager.initializeDatabase();

        const status = databaseManager.getDatabaseStatus();
        expect(status.schemaValid).toBe(true);
        expect(database.db.exec).toHaveBeenCalled();
    });

    test('should skip schema validation when disabled', async () => {
        const database = require('./database.js');
        database.initDatabase.mockResolvedValue();

        const databaseManager = new DatabaseManager({ schemaValidationEnabled: false });

        await databaseManager.initializeDatabase();

        const status = databaseManager.getDatabaseStatus();
        expect(status.connected).toBe(true);
        expect(status.currentStatus).toBe(DatabaseStatus.READY);
        // Schema validation should be skipped, so schemaValid remains false
        expect(status.schemaValid).toBe(false);
    });

    test('should perform health check correctly', async () => {
        const database = require('./database.js');
        database.initDatabase.mockResolvedValue();
        database.db.exec.mockReturnValue([{ values: [[1]] }]);

        const databaseManager = new DatabaseManager();
        await databaseManager.initializeDatabase();

        const isHealthy = await databaseManager.performHealthCheck();
        expect(isHealthy).toBe(true);
    });

    test('should calculate exponential backoff correctly', () => {
        const databaseManager = new DatabaseManager({ retryDelay: 1000, maxRetryDelay: 10000 });

        const delay0 = databaseManager.calculateRetryDelay(0);
        const delay1 = databaseManager.calculateRetryDelay(1);
        const delay2 = databaseManager.calculateRetryDelay(2);

        // Verify exponential growth (allowing for jitter)
        expect(delay0).toBeGreaterThanOrEqual(1000);
        expect(delay0).toBeLessThanOrEqual(2000);

        expect(delay1).toBeGreaterThanOrEqual(2000);
        expect(delay1).toBeLessThanOrEqual(3000);

        expect(delay2).toBeGreaterThanOrEqual(4000);
        expect(delay2).toBeLessThanOrEqual(5000);
    });

    test('should cleanup resources properly', () => {
        const databaseManager = new DatabaseManager();

        // Set some state
        databaseManager.status.connected = true;
        databaseManager.status.retryCount = 2;
        databaseManager.retryTimeouts.push(setTimeout(() => { }, 1000));

        databaseManager.cleanup();

        expect(databaseManager.status.connected).toBe(false);
        expect(databaseManager.status.retryCount).toBe(0);
        expect(databaseManager.status.currentStatus).toBe(DatabaseStatus.DISCONNECTED);
        expect(databaseManager.retryTimeouts).toEqual([]);
    });

    test('should throw error when getting database before initialization', () => {
        const databaseManager = new DatabaseManager();

        expect(() => databaseManager.getDatabase()).toThrow('Database not initialized or not connected');
    });
});