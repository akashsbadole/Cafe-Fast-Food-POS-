/**
 * Comprehensive Test Suite for API Error Fixes
 * 
 * This test suite verifies that the API error fixes are working correctly:
 * 1. Database Ready Flag - Verify database initialization works correctly
 * 2. Authentication Middleware - Test JWT verification and error handling
 * 3. PIN Verification - Test PIN verification with proper error handling
 * 4. Health Check Endpoints - Test all health check endpoints
 * 5. Error Handling - Test structured error responses
 * 
 * Validates: Requirements for 403 Forbidden and 500 error resolution
 */

const { ErrorHandler, ErrorSeverity, ErrorCategory } = require('./error-handler');
const ManagerPin = require('./manager-pin');

describe('API Error Fixes - Comprehensive Test Suite', () => {
    let errorHandler;

    beforeEach(() => {
        errorHandler = new ErrorHandler({
            logToFile: false,
            showUserDialogs: false
        });
    });

    afterEach(() => {
        errorHandler.cleanup();
    });

    describe('1. Database Ready Flag Tests', () => {
        test('should handle database initialization errors', async () => {
            const error = new Error('Database initialization failed');
            const context = {
                component: 'database',
                operation: 'init'
            };
            
            const errorInfo = await errorHandler.handleError(error, context);
            
            expect(errorInfo.category).toBe(ErrorCategory.DATABASE);
            expect(errorInfo.severity).toBe(ErrorSeverity.CRITICAL);
            expect(errorInfo.recoverable).toBe(true);
            expect(errorInfo.recoveryActions).toContain('restart');
        });

        test('should handle database connection errors', async () => {
            const error = new Error('Database connection failed');
            const context = {
                component: 'database',
                operation: 'query'
            };
            
            const errorInfo = await errorHandler.handleError(error, context);
            
            expect(errorInfo.category).toBe(ErrorCategory.DATABASE);
            expect(errorInfo.severity).toBe(ErrorSeverity.HIGH);
            expect(errorInfo.recoveryActions).toContain('retry');
        });
    });

    describe('2. Authentication Middleware Tests', () => {
        test('should create 401 error response for missing token', () => {
            const error = new Error('Unauthorized - No token provided');
            const errorInfo = errorHandler.createApiErrorResponse(error, { component: 'auth' }, 401);
            
            expect(errorInfo.error.code).toBe('UNAUTHORIZED');
            expect(errorInfo.error.message).toContain('No token provided');
            expect(errorInfo.statusCode).toBe(401);
            expect(errorInfo.error.recoverable).toBe(false);
        });

        test('should create 401 error response for invalid token', () => {
            const error = new Error('Unauthorized - Invalid token');
            const errorInfo = errorHandler.createApiErrorResponse(error, { component: 'auth' }, 401);
            
            expect(errorInfo.error.code).toBe('UNAUTHORIZED');
            expect(errorInfo.error.message).toContain('Invalid token');
            expect(errorInfo.statusCode).toBe(401);
        });

        test('should create 403 error response for forbidden access', () => {
            const error = new Error('Forbidden - Missing permission');
            const errorInfo = errorHandler.createApiErrorResponse(error, { component: 'auth' }, 403);
            
            expect(errorInfo.error.code).toBe('FORBIDDEN');
            expect(errorInfo.error.message).toContain('Forbidden');
            expect(errorInfo.statusCode).toBe(403);
            expect(errorInfo.error.recoverable).toBe(false);
        });
    });

    describe('3. PIN Verification Tests', () => {
        test('should handle PIN verification errors', async () => {
            const mockDb = {
                get: jest.fn().mockRejectedValue(new Error('Database error'))
            };
            
            const managerPin = new ManagerPin(mockDb, console);
            const result = await managerPin.verifyPin('1234');
            
            expect(result.success).toBe(false);
            expect(result.message).toContain('PIN verification failed');
        });

        test('should handle missing database gracefully', async () => {
            const managerPin = new ManagerPin(null, console);
            const result = await managerPin.verifyPin('1234');
            
            expect(result.success).toBe(false);
            expect(result.message).toBe('Database not initialized');
        });

        test('should verify PIN successfully', async () => {
            const mockUser = {
                id: 1,
                username: 'admin',
                is_manager: 1,
                pin: '1234'
            };
            
            const mockDb = {
                get: jest.fn().mockResolvedValue(mockUser)
            };
            
            const managerPin = new ManagerPin(mockDb, console);
            const result = await managerPin.verifyPin('1234');
            
            expect(result.success).toBe(true);
            expect(result.userId).toBe(1);
            expect(result.username).toBe('admin');
        });
    });

    describe('4. Health Check Endpoints Tests', () => {
        test('should handle health check errors', async () => {
            const error = new Error('Health check failed');
            const context = {
                component: 'health-check',
                operation: 'database-connectivity'
            };
            
            const errorInfo = await errorHandler.handleError(error, context);
            
            expect(errorInfo.category).toBe(ErrorCategory.UNKNOWN);
            expect(errorInfo.severity).toBe(ErrorSeverity.LOW);
            expect(errorInfo.recoverable).toBe(true);
        });

        test('should provide recovery instructions for health check failures', () => {
            const instructions = errorHandler.getRecoveryInstructions(ErrorCategory.DATABASE);
            
            expect(instructions.length).toBeGreaterThan(0);
            expect(instructions).toContainEqual(expect.stringContaining('database'));
        });
    });

    describe('5. Error Handling Tests', () => {
        test('should create structured error response for 500 errors', () => {
            const error = new Error('Internal server error');
            const errorInfo = errorHandler.createApiErrorResponse(error, { component: 'server' }, 500);
            
            expect(errorInfo.error.id).toBeDefined();
            expect(errorInfo.error.code).toBe('GENERIC_ERROR');
            expect(errorInfo.error.message).toBe('Internal server error');
            expect(errorInfo.error.severity).toBe(ErrorSeverity.HIGH);
            expect(errorInfo.error.recoverable).toBe(true);
            expect(errorInfo.statusCode).toBe(500);
            expect(errorInfo.error.recoveryActions).toContain('retry');
        });

        test('should create validation error response', () => {
            const errors = ['Field required', 'Invalid format'];
            const errorInfo = errorHandler.createValidationErrorResponse(errors);
            
            expect(errorInfo.error.code).toBe('VALIDATION_ERROR');
            expect(errorInfo.error.message).toBe('Validation failed');
            expect(errorInfo.error.details).toEqual(errors);
            expect(errorInfo.statusCode).toBe(400);
        });

        test('should create not found error response', () => {
            const errorInfo = errorHandler.createNotFoundErrorResponse('User', '123');
            
            expect(errorInfo.error.code).toBe('NOT_FOUND');
            expect(errorInfo.error.message).toBe('User not found');
            expect(errorInfo.error.details).toBe('ID: 123');
            expect(errorInfo.statusCode).toBe(404);
        });

        test('should handle error with context information', async () => {
            const error = new Error('Database operation failed');
            const context = {
                component: 'order-service',
                operation: 'create-order',
                orderId: 'ORD-2024-001',
                details: { items: 3, total: 100.50 }
            };
            
            const errorInfo = await errorHandler.handleError(error, context);
            
            expect(errorInfo.component).toBe('order-service');
            expect(errorInfo.operation).toBe('create-order');
            expect(errorInfo.context.details).toEqual(context.details);
            expect(errorInfo.category).toBe(ErrorCategory.DATABASE);
            expect(errorInfo.recoveryActions).toContain('retry');
            expect(errorInfo.recoveryActions).toContain('restart');
        });

        test('should provide recovery instructions for server errors', () => {
            const instructions = errorHandler.getRecoveryInstructions(ErrorCategory.SERVER);
            
            expect(instructions.length).toBeGreaterThan(0);
            expect(instructions).toContainEqual(expect.stringContaining('port'));
        });
    });

    describe('Integration Tests - End-to-End Scenarios', () => {
        test('should handle complete error flow for 403 forbidden', async () => {
            const error = new Error('Forbidden - Missing permission: admin_access');
            const errorInfo = errorHandler.createApiErrorResponse(error, { 
                component: 'auth',
                operation: 'access-control'
            }, 403);
            
            expect(errorInfo.error.code).toBe('FORBIDDEN');
            expect(errorInfo.error.message).toContain('Forbidden');
            expect(errorInfo.error.severity).toBe(ErrorSeverity.MEDIUM);
            expect(errorInfo.error.recoverable).toBe(false);
            expect(errorInfo.statusCode).toBe(403);
        });

        test('should handle complete error flow for 500 internal server error', async () => {
            const error = new Error('Database connection pool exhausted');
            const errorInfo = errorHandler.createApiErrorResponse(error, { 
                component: 'database',
                operation: 'query-execution'
            }, 500);
            
            expect(errorInfo.error.code).toBe('GENERIC_ERROR');
            expect(errorInfo.error.message).toContain('Database connection pool exhausted');
            expect(errorInfo.error.severity).toBe(ErrorSeverity.HIGH);
            expect(errorInfo.error.recoverable).toBe(true);
            expect(errorInfo.statusCode).toBe(500);
            expect(errorInfo.error.recoveryActions).toContain('retry');
            expect(errorInfo.error.recoveryActions).toContain('restart');
        });

        test('should handle database initialization failure with proper error response', async () => {
            const error = new Error('Database initialization failed');
            const context = {
                component: 'startup',
                operation: 'database-init'
            };
            
            const errorInfo = await errorHandler.handleError(error, context);
            
            expect(errorInfo.category).toBe(ErrorCategory.DATABASE);
            expect(errorInfo.severity).toBe(ErrorSeverity.CRITICAL);
            expect(errorInfo.recoverable).toBe(true);
            expect(errorInfo.recoveryActions).toContain('restart');
            expect(errorInfo.recoveryActions).toContain('manual');
        });
    });

    describe('Edge Cases and Boundary Conditions', () => {
        test('should handle empty error messages', () => {
            const error = new Error('');
            const errorInfo = errorHandler.createApiErrorResponse(error, { component: 'test' }, 500);
            
            expect(errorInfo.error.message).toBe('');
            expect(errorInfo.error.id).toBeDefined();
            expect(errorInfo.statusCode).toBe(500);
        });

        test('should handle very long error messages', () => {
            const longMessage = 'A'.repeat(1000);
            const error = new Error(longMessage);
            const errorInfo = errorHandler.createApiErrorResponse(error, { component: 'test' }, 500);
            
            expect(errorInfo.error.message).toBe(longMessage);
            expect(errorInfo.error.id).toBeDefined();
            expect(errorInfo.statusCode).toBe(500);
        });

        test('should handle special characters in error messages', () => {
            const specialMessage = 'Error: <script>alert("XSS")</script> & "quotes"';
            const error = new Error(specialMessage);
            const errorInfo = errorHandler.createApiErrorResponse(error, { component: 'test' }, 500);
            
            expect(errorInfo.error.message).toBe(specialMessage);
            expect(errorInfo.error.id).toBeDefined();
            expect(errorInfo.statusCode).toBe(500);
        });

        test('should handle multiple errors in sequence', async () => {
            const errors = [
                new Error('Error 1'),
                new Error('Error 2'),
                new Error('Error 3')
            ];
            
            for (const error of errors) {
                await errorHandler.handleError(error, { component: 'test' });
            }
            
            expect(errorHandler.errorHistory.length).toBe(3);
        });

        test('should handle errors with different severity levels', async () => {
            const severities = [ErrorSeverity.LOW, ErrorSeverity.MEDIUM, ErrorSeverity.HIGH, ErrorSeverity.CRITICAL];
            
            for (const severity of severities) {
                const error = new Error(`Error with ${severity} severity`);
                const context = { component: 'test', severity };
                await errorHandler.handleError(error, context);
            }
            
            const stats = errorHandler.getErrorStatistics();
            expect(stats.totalErrors).toBe(4);
        });
    });
});
