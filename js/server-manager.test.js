// Property-based tests for Server Manager
// Tests server startup with port resolution functionality

const fc = require('fast-check');
const { ServerManager, ServerStatus } = require('./server-manager');
const http = require('http');

// Mock the server.js module
jest.mock('../server.js', () => ({
    startServer: jest.fn(),
    stopServer: jest.fn()
}));

describe('ServerManager Property-Based Tests', () => {
    let serverManager;
    let mockServers = [];

    beforeEach(() => {
        jest.clearAllMocks();
        mockServers = [];
        serverManager = null;
    });

    afterEach(async () => {
        // Clean up any running servers
        for (const server of mockServers) {
            if (server && server.listening) {
                await new Promise(resolve => server.close(resolve));
            }
        }
        mockServers = [];

        if (serverManager) {
            try {
                await serverManager.stopServer();
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    });

    /**
     * Property 3: Server Startup with Port Resolution
     * For any server startup attempt, if the default port is unavailable, the system must 
     * automatically try alternative ports in sequence, and if all server startup attempts fail, 
     * display a clear error message and exit gracefully.
     * **Validates: Requirements 1.2, 3.2, 5.1**
     */
    test('Property 3: Server Startup with Port Resolution', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate test data: preferred port and list of fallback ports
                fc.record({
                    preferredPort: fc.integer({ min: 3000, max: 3010 }),
                    fallbackPorts: fc.array(fc.integer({ min: 3011, max: 3020 }), { minLength: 1, maxLength: 5 }),
                    occupiedPorts: fc.array(fc.integer({ min: 3000, max: 3020 }), { maxLength: 3 })
                }),
                async ({ preferredPort, fallbackPorts, occupiedPorts }) => {
                    // Create servers to occupy some ports
                    const occupyingServers = [];
                    for (const port of occupiedPorts) {
                        try {
                            const server = http.createServer();
                            await new Promise((resolve, reject) => {
                                server.listen(port, '127.0.0.1', resolve);
                                server.on('error', reject);
                            });
                            occupyingServers.push(server);
                            mockServers.push(server);
                        } catch (error) {
                            // Port might already be in use, skip
                        }
                    }

                    // Create server manager with test configuration
                    serverManager = new ServerManager({
                        preferredPort,
                        fallbackPorts,
                        maxRetries: 1,
                        healthCheckTimeout: 1000
                    });

                    // Mock the server start function
                    const { startServer } = require('../server.js');
                    let callCount = 0;
                    startServer.mockImplementation(() => {
                        callCount++;
                        // Create a mock server that appears to start successfully
                        const mockServer = {
                            listening: true,
                            close: jest.fn((callback) => callback && callback())
                        };
                        return Promise.resolve(mockServer);
                    });

                    try {
                        // Attempt to start server
                        const serverInfo = await serverManager.startServer();

                        // Verify server started successfully
                        expect(serverInfo).toBeDefined();
                        expect(serverInfo.status).toBe(ServerStatus.READY);
                        expect(serverInfo.port).toBeGreaterThan(0);
                        expect(serverInfo.url).toContain(`http://127.0.0.1:${serverInfo.port}`);

                        // Verify port resolution logic
                        const allPorts = [preferredPort, ...fallbackPorts];
                        expect(allPorts).toContain(serverInfo.port);

                        // If preferred port was occupied, should use fallback
                        if (occupiedPorts.includes(preferredPort)) {
                            expect(fallbackPorts).toContain(serverInfo.port);
                        }

                    } catch (error) {
                        // If all ports are occupied, should fail gracefully with clear error
                        const allPorts = [preferredPort, ...fallbackPorts];
                        const allPortsOccupied = allPorts.every(port => occupiedPorts.includes(port));

                        if (allPortsOccupied) {
                            expect(error.message).toContain('No available ports found');
                            expect(serverManager.getServerStatus()).toBe(ServerStatus.FAILED);
                        } else {
                            // If not all ports occupied, startup should have succeeded
                            throw error;
                        }
                    } finally {
                        // Clean up occupying servers
                        for (const server of occupyingServers) {
                            if (server.listening) {
                                await new Promise(resolve => server.close(resolve));
                            }
                        }
                    }
                }
            ),
            {
                numRuns: 100,
                timeout: 10000,
                verbose: true
            }
        );
    }, 15000);

    // Additional unit tests for specific scenarios
    describe('Unit Tests for Edge Cases', () => {
        test('should handle server start function throwing error', async () => {
            const { startServer } = require('../server.js');
            startServer.mockRejectedValue(new Error('Server module error'));

            serverManager = new ServerManager({
                preferredPort: 3000,
                fallbackPorts: [3001],
                maxRetries: 1
            });

            await expect(serverManager.startServer()).rejects.toThrow('Failed to start server after 1 attempts');
            expect(serverManager.getServerStatus()).toBe(ServerStatus.FAILED);
        });

        test('should handle health check failure', async () => {
            const { startServer } = require('../server.js');
            startServer.mockResolvedValue({
                listening: true,
                close: jest.fn((callback) => callback && callback())
            });

            serverManager = new ServerManager({
                preferredPort: 3000,
                healthCheckTimeout: 100
            });

            // Mock health check to fail
            jest.spyOn(serverManager, 'makeHealthCheckRequest').mockRejectedValue(new Error('Health check failed'));

            await expect(serverManager.startServer()).rejects.toThrow('Server health check failed after startup');
        });

        test('should find available port when preferred is occupied', async () => {
            // Occupy the preferred port
            const occupyingServer = http.createServer();
            await new Promise(resolve => occupyingServer.listen(3000, '127.0.0.1', resolve));
            mockServers.push(occupyingServer);

            serverManager = new ServerManager({
                preferredPort: 3000,
                fallbackPorts: [3001, 3002]
            });

            const availablePort = await serverManager.findAvailablePort(3000);
            expect(availablePort).toBeGreaterThan(3000);
            expect([3001, 3002]).toContain(availablePort);

            await new Promise(resolve => occupyingServer.close(resolve));
        });

        test('should emit appropriate events during startup', async () => {
            const { startServer } = require('../server.js');
            startServer.mockResolvedValue({
                listening: true,
                close: jest.fn((callback) => callback && callback())
            });

            serverManager = new ServerManager({
                preferredPort: 3000,
                fallbackPorts: [3001]
            });

            const events = [];
            serverManager.on('server-starting', (data) => events.push({ type: 'starting', data }));
            serverManager.on('port-found', (data) => events.push({ type: 'port-found', data }));
            serverManager.on('server-ready', (data) => events.push({ type: 'ready', data }));

            // Mock health check to succeed
            jest.spyOn(serverManager, 'validateServerHealth').mockResolvedValue(true);

            await serverManager.startServer();

            expect(events.some(e => e.type === 'starting')).toBe(true);
            expect(events.some(e => e.type === 'port-found')).toBe(true);
            expect(events.some(e => e.type === 'ready')).toBe(true);
        });
    });
});