// Property-Based Tests for Startup Manager
// Feature: electron-window-visibility-fix, Property 1: Startup Sequence Ordering
// **Validates: Requirements 1.1**

const fc = require('fast-check');
const { StartupManager, StartupStatus, OverallStatus } = require('./startup-manager');

// Mock dependencies to avoid actual database/server initialization during tests
jest.mock('./database.js', () => ({
    initDatabase: jest.fn()
}));

jest.mock('../server.js', () => ({
    startServer: jest.fn()
}));

describe('Startup Manager Property Tests', () => {

    /**
     * Property 1: Startup Sequence Ordering
     * For any application startup attempt, the database must be initialized successfully 
     * before the Express server starts, and the Express server must be ready before 
     * the main window is created.
     * **Validates: Requirements 1.1**
     */
    test('Property 1: Startup Sequence Ordering', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate different startup scenarios
                fc.record({
                    databaseDelay: fc.integer({ min: 0, max: 100 }),
                    serverDelay: fc.integer({ min: 0, max: 100 }),
                    windowDelay: fc.integer({ min: 0, max: 100 }),
                    shouldDatabaseFail: fc.boolean(),
                    shouldServerFail: fc.boolean(),
                    shouldWindowFail: fc.boolean()
                }),
                async (scenario) => {
                    const database = require('./database.js');
                    const server = require('../server.js');

                    // Reset mocks
                    database.initDatabase.mockReset();
                    server.startServer.mockReset();

                    const startupManager = new StartupManager();
                    const events = [];

                    // Track the order of component initialization
                    startupManager.on('component-ready', (event) => {
                        events.push({
                            component: event.component,
                            timestamp: Date.now(),
                            status: startupManager.getStartupStatus()
                        });
                    });

                    // Configure mock behaviors based on scenario
                    if (scenario.shouldDatabaseFail) {
                        database.initDatabase.mockRejectedValue(new Error('Database failed'));
                    } else {
                        database.initDatabase.mockImplementation(() =>
                            new Promise(resolve => setTimeout(resolve, scenario.databaseDelay))
                        );
                    }

                    if (scenario.shouldServerFail) {
                        server.startServer.mockRejectedValue(new Error('Server failed'));
                    } else {
                        server.startServer.mockImplementation(() =>
                            new Promise(resolve => setTimeout(resolve, scenario.serverDelay))
                        );
                    }

                    try {
                        await startupManager.initializeApp();

                        // If we reach here, startup was successful
                        // Verify the ordering constraint: database -> server -> window
                        const databaseEvent = events.find(e => e.component === 'database');
                        const serverEvent = events.find(e => e.component === 'server');
                        const windowEvent = events.find(e => e.component === 'window');

                        // All components should be ready in successful startup
                        expect(databaseEvent).toBeDefined();
                        expect(serverEvent).toBeDefined();
                        expect(windowEvent).toBeDefined();

                        // Database must be ready before server
                        expect(databaseEvent.timestamp).toBeLessThanOrEqual(serverEvent.timestamp);

                        // Server must be ready before window
                        expect(serverEvent.timestamp).toBeLessThanOrEqual(windowEvent.timestamp);

                        // Verify status progression: database ready -> server ready -> window ready
                        expect(databaseEvent.status.database).toBe(StartupStatus.READY);
                        expect(databaseEvent.status.server).toBe(StartupStatus.PENDING);
                        expect(databaseEvent.status.window).toBe(StartupStatus.PENDING);

                        expect(serverEvent.status.database).toBe(StartupStatus.READY);
                        expect(serverEvent.status.server).toBe(StartupStatus.READY);
                        expect(serverEvent.status.window).toBe(StartupStatus.PENDING);

                        expect(windowEvent.status.database).toBe(StartupStatus.READY);
                        expect(windowEvent.status.server).toBe(StartupStatus.READY);
                        expect(windowEvent.status.window).toBe(StartupStatus.READY);

                    } catch (error) {
                        // If startup failed, verify it failed at the expected component
                        const status = startupManager.getStartupStatus();

                        if (scenario.shouldDatabaseFail) {
                            // Database failure should prevent server and window initialization
                            expect(status.database).toBe(StartupStatus.FAILED);
                            expect(status.server).toBe(StartupStatus.PENDING);
                            expect(status.window).toBe(StartupStatus.PENDING);
                            expect(status.overall).toBe(OverallStatus.FAILED);
                        } else if (scenario.shouldServerFail) {
                            // Server failure should occur after database success but prevent window
                            expect(status.database).toBe(StartupStatus.READY);
                            expect(status.server).toBe(StartupStatus.FAILED);
                            expect(status.window).toBe(StartupStatus.PENDING);
                            expect(status.overall).toBe(OverallStatus.FAILED);
                        }

                        // Verify database was always called first (if not supposed to fail)
                        if (!scenario.shouldDatabaseFail) {
                            expect(database.initDatabase).toHaveBeenCalled();
                        }

                        // Verify server was only called after database success
                        if (!scenario.shouldDatabaseFail && !scenario.shouldServerFail) {
                            expect(server.startServer).toHaveBeenCalled();
                        } else if (scenario.shouldDatabaseFail) {
                            expect(server.startServer).not.toHaveBeenCalled();
                        }
                    }
                }
            ),
            { numRuns: 100 } // Minimum 100 iterations as specified in design
        );
    });

    /**
     * Additional property test: Dependency validation ordering
     * For any startup attempt, dependencies must be validated before initialization
     */
    test('Property: Dependency Validation Before Initialization', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.boolean(), // Whether dependencies are available
                async (dependenciesAvailable) => {
                    const startupManager = new StartupManager();

                    // Validate dependencies first
                    const validationResult = await startupManager.validateDependencies();

                    // The validation result should be consistent with actual dependency availability
                    // In our test environment, dependencies should always be available (mocked)
                    expect(typeof validationResult).toBe('boolean');

                    // Validation should complete before any initialization attempts
                    const statusBeforeInit = startupManager.getStartupStatus();
                    expect(statusBeforeInit.overall).toBe(OverallStatus.INITIALIZING);
                    expect(statusBeforeInit.database).toBe(StartupStatus.PENDING);
                    expect(statusBeforeInit.server).toBe(StartupStatus.PENDING);
                    expect(statusBeforeInit.window).toBe(StartupStatus.PENDING);
                }
            ),
            { numRuns: 100 }
        );
    });
});

// Unit tests for specific examples and edge cases
describe('Startup Manager Unit Tests', () => {

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
    });

    test('should initialize components in correct order on success', async () => {
        const database = require('./database.js');
        const server = require('../server.js');

        database.initDatabase.mockResolvedValue();
        server.startServer.mockResolvedValue();

        const startupManager = new StartupManager();
        const events = [];

        startupManager.on('component-ready', (event) => {
            events.push(event.component);
        });

        await startupManager.initializeApp();

        expect(events).toEqual(['database', 'server', 'window']);
        expect(startupManager.getStartupStatus().overall).toBe(OverallStatus.READY);
    });

    test('should fail gracefully when database initialization fails', async () => {
        const database = require('./database.js');
        const server = require('../server.js');

        database.initDatabase.mockRejectedValue(new Error('Database connection failed'));

        const startupManager = new StartupManager();

        await expect(startupManager.initializeApp()).rejects.toThrow('Database initialization failed');

        const status = startupManager.getStartupStatus();
        expect(status.database).toBe(StartupStatus.FAILED);
        expect(status.server).toBe(StartupStatus.PENDING);
        expect(status.window).toBe(StartupStatus.PENDING);
        expect(status.overall).toBe(OverallStatus.FAILED);

        // Server should not be called if database fails
        expect(server.startServer).not.toHaveBeenCalled();
    });

    test('should fail gracefully when server initialization fails', async () => {
        const database = require('./database.js');
        const server = require('../server.js');

        database.initDatabase.mockResolvedValue();
        server.startServer.mockRejectedValue(new Error('Port already in use'));

        const startupManager = new StartupManager();

        await expect(startupManager.initializeApp()).rejects.toThrow('Server initialization failed');

        const status = startupManager.getStartupStatus();
        expect(status.database).toBe(StartupStatus.READY);
        expect(status.server).toBe(StartupStatus.FAILED);
        expect(status.window).toBe(StartupStatus.PENDING);
        expect(status.overall).toBe(OverallStatus.FAILED);
    });

    test('should validate dependencies correctly', async () => {
        const startupManager = new StartupManager();

        const result = await startupManager.validateDependencies();

        // In test environment with mocked modules, dependencies should be available
        expect(typeof result).toBe('boolean');
    });

    test('should reset to initial state', () => {
        const startupManager = new StartupManager();

        // Modify state
        startupManager.status.database = StartupStatus.READY;
        startupManager.errors.push({ component: 'test', error: 'test error' });
        startupManager.startTime = Date.now();

        // Reset
        startupManager.reset();

        // Verify reset state
        expect(startupManager.status.database).toBe(StartupStatus.PENDING);
        expect(startupManager.status.server).toBe(StartupStatus.PENDING);
        expect(startupManager.status.window).toBe(StartupStatus.PENDING);
        expect(startupManager.status.overall).toBe(OverallStatus.INITIALIZING);
        expect(startupManager.errors).toEqual([]);
        expect(startupManager.startTime).toBeNull();
    });
});