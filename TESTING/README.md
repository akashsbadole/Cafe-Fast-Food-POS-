# Testing Documentation

## Overview

The Cafe POS system includes a comprehensive testing framework to ensure reliability and stability. Tests cover authentication, database operations, server management, startup processes, and window management.

## Testing Framework

### Test Files

- **test-auth.js**: Authentication testing
  - Login functionality
  - PIN validation
  - Session management
  - JWT token handling

- **test-auth-flow.js**: Authentication flow testing
  - Complete login flow
  - Role-based access
  - Permission checks
  - Error scenarios

- **test-auth-with-token.js**: Token-based authentication testing
  - JWT token validation
  - Token expiration
  - Token refresh
  - Protected routes

- **test-electron.js**: Electron integration testing
  - Window management
  - IPC communication
  - Main/renderer process interaction
  - Native dialogs

- **test-electron-module.js**: Electron module testing
  - Module loading
  - Context isolation
  - API exposure
  - Security checks

- **test-electron-runner.js**: Electron runner testing
  - Application startup
  - Process management
  - Error handling
  - Clean shutdown

- **test-electron-simple.js**: Basic Electron testing
  - Window creation
  - Basic navigation
  - Event handling
  - Cleanup

- **test-mvp.js**: MVP feature testing
  - Core functionality
  - Integration tests
  - End-to-end flows
  - Performance testing

- **js/database-manager.test.js**: Database manager unit tests
  - Connection management
  - Schema validation
  - Health checks
  - Retry logic

- **js/server-manager.test.js**: Server manager unit tests
  - Server lifecycle
  - Port management
  - Error handling
  - Clean shutdown

- **js/startup-manager.test.js**: Startup manager unit tests
  - Initialization
  - Dependency checking
  - Error recovery
  - Configuration validation

- **js/window-manager.test.js**: Window manager unit tests
  - Window creation
  - Window state management
  - Event handling
  - Cleanup

- **js/error-handler.test.js**: Error handler unit tests
  - Error capture
  - Error logging
  - Error recovery
  - User notification

## Test Execution

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx jest test-auth.js

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Configuration

The testing framework uses Jest with the following configuration:

```javascript
// In package.json
"jest": {
  "testEnvironment": "node",
  "coveragePathIgnorePatterns": [
    "/node_modules/",
    "/config/",
    "/data/",
    "/images/",
    "/styles/",
    "/web-app/",
    "/client/",
    "/test-"/
  ],
  "collectCoverageFrom": [
    "js/**/*.js",
    "main.js",
    "preload.js",
    "server.js",
    "electron-launcher.js"
  ],
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

## Test Categories

### Unit Tests

Test individual functions and modules in isolation:

```javascript
// Example: database-manager.test.js
const db = require('./database-manager');

describe('Database Manager', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = {
      open: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue({}),
      run: jest.fn().mockResolvedValue({})
    };
  });
  
  test('should open database connection', async () => {
    await db.open(mockDb);
    expect(mockDb.open).toHaveBeenCalled();
  });
  
  test('should close database connection', async () => {
    await db.close(mockDb);
    expect(mockDb.close).toHaveBeenCalled();
  });
  
  test('should validate schema', async () => {
    const isValid = await db.validateSchema(mockDb);
    expect(isValid).toBe(true);
  });
});
```

### Integration Tests

Test interactions between multiple modules:

```javascript
// Example: test-auth-flow.js
describe('Authentication Flow', () => {
  let auth;
  let db;
  
  beforeEach(() => {
    db = {
      get: jest.fn().mockResolvedValue({ pin_hash: '$2a$10$hashedpin' })
    };
    auth = require('./auth');
  });
  
  test('should login successfully with correct PIN', async () => {
    const token = await auth.login('1234', db);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });
  
  test('should fail login with incorrect PIN', async () => {
    await expect(auth.login('0000', db)).rejects.toThrow('Invalid PIN');
  });
  
  test('should verify JWT token', () => {
    const token = auth.generateToken({ id: 1, role: 'admin' });
    const decoded = auth.verifyToken(token);
    expect(decoded.id).toBe(1);
    expect(decoded.role).toBe('admin');
  });
});
```

### End-to-End Tests

Test complete user flows:

```javascript
// Example: test-mvp.js
describe('MVP End-to-End Flow', () => {
  let app;
  let server;
  
  beforeAll(async () => {
    server = require('./server');
    await server.start();
  });
  
  afterAll(async () => {
    await server.stop();
  });
  
  test('should complete order flow', async () => {
    // 1. Login
    const loginResponse = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      body: JSON.stringify({ pin: '1234' })
    });
    const { token } = await loginResponse.json();
    
    // 2. Get menu
    const menuResponse = await fetch('http://localhost:3000/api/menu', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const menu = await menuResponse.json();
    
    // 3. Create order
    const orderResponse = await fetch('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [
          { menuItemId: menu[0].id, quantity: 2 }
        ]
      })
    });
    const order = await orderResponse.json();
    
    // 4. Process payment
    const paymentResponse = await fetch('http://localhost:3000/api/payments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        orderId: order.id,
        amount: order.total,
        paymentMode: 'cash'
      })
    });
    
    expect(paymentResponse.status).toBe(200);
  });
});
```

### Electron Tests

Test Electron-specific functionality:

```javascript
// Example: test-electron.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

describe('Electron Application', () => {
  let mainWindow;
  
  beforeAll(() => {
    app.setPath('userData', path.join(__dirname, 'test-data'));
  });
  
  test('should create main window', () => {
    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    expect(mainWindow).toBeDefined();
    expect(mainWindow.isDestroyed()).toBe(false);
  });
  
  test('should load index.html', () => {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    expect(mainWindow.getURL()).toContain('file://');
  });
  
  test('should handle window close', () => {
    const closeSpy = jest.fn();
    mainWindow.on('closed', closeSpy);
    mainWindow.close();
    expect(closeSpy).toHaveBeenCalled();
  });
});
```

## Test Coverage

### Coverage Reports

Generate coverage reports to identify untested code:

```bash
npm run test:coverage
```

This generates:
- HTML report in `coverage/lcov-report/`
- Text summary in `coverage/text-summary.txt`
- JSON report in `coverage/coverage-final.json`

### Coverage Thresholds

The project maintains the following coverage thresholds:
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

### Coverage Exclusions

The following files are excluded from coverage:
- Configuration files (`config/`)
- Data files (`data/`)
- Static assets (`images/`, `styles/`)
- Test files (`test-` prefix)
- Client-side assets (`client/`, `web-app/`)

## Mocking and Stubs

### Database Mocking

```javascript
const mockDb = {
  open: jest.fn().mockResolvedValue({}),
  close: jest.fn().mockResolvedValue({}),
  get: jest.fn().mockImplementation((sql, params) => {
    if (sql.includes('SELECT * FROM users')) {
      return Promise.resolve({ id: 1, name: 'Test User', pin_hash: '$2a$10$hashed' });
    }
    return Promise.resolve(null);
  }),
  run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 })
};
```

### API Mocking

```javascript
jest.mock('node-fetch', () => {
  return jest.fn().mockImplementation((url) => {
    if (url.includes('/api/login')) {
      return Promise.resolve({
        json: () => Promise.resolve({ token: 'mock-token' })
      });
    }
    if (url.includes('/api/menu')) {
      return Promise.resolve({
        json: () => Promise.resolve([
          { id: 1, name: 'Coffee', price: 50 },
          { id: 2, name: 'Tea', price: 30 }
        ])
      });
    }
    return Promise.resolve({
      json: () => Promise.resolve({})
    });
  });
});
```

### Timer Mocking

```javascript
jest.useFakeTimers();

test('should auto-lock after timeout', () => {
  const auth = require('./auth');
  auth.initAutoLock({ timeout: 2 });
  
  // Fast-forward time
  jest.advanceTimersByTime(120000); // 2 minutes
  
  // Verify lock was triggered
  expect(auth.isLocked()).toBe(true);
});

afterEach(() => {
  jest.useRealTimers();
});
```

## Test Best Practices

### Writing Tests

1. **Descriptive test names**: Clearly state what is being tested
2. **Single responsibility**: Each test should test one thing
3. **Arrange-Act-Assert**: Clear test structure
4. **Isolate tests**: Avoid test interdependence
5. **Clean up**: Reset state after each test

### Test Organization

1. **Group related tests**: Use `describe` blocks
2. **Order tests logically**: From simple to complex
3. **Use setup/teardown**: `beforeEach`, `afterEach`, `beforeAll`, `afterAll`
4. **Mock dependencies**: Isolate unit under test
5. **Test edge cases**: Invalid inputs, error conditions

### Test Maintenance

1. **Update tests with code**: Keep tests in sync
2. **Refactor tests**: When code changes
3. **Remove obsolete tests**: For deleted features
4. **Document assumptions**: In test descriptions
5. **Review coverage**: Regularly check coverage reports

## Continuous Integration

The project integrates with CI systems to run tests on every commit:

```yaml
# Example .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: npm test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v1
        with:
          file: ./coverage/coverage-final.json
```

## Debugging Tests

### Common Test Issues

#### Test Failing
- Check test assumptions
- Verify mock data
- Review error messages
- Test manually

#### Test Hanging
- Check async operations
- Verify cleanup
- Test timeouts
- Review infinite loops

#### Low Coverage
- Identify untested code
- Add missing tests
- Review coverage exclusions
- Check test effectiveness

#### Flaky Tests
- Check race conditions
- Verify async handling
- Review test isolation
- Test determinism

## Test Documentation

### Test Documentation Format

```javascript
describe('Module Name', () => {
  describe('Function Name', () => {
    test('should do something when condition is met', () => {
      // Test implementation
    });
    
    test('should handle error when condition is not met', () => {
      // Test implementation
    });
  });
});
```

### Test Documentation Best Practices

1. **Describe the module**: In outer `describe`
2. **Describe the function**: In inner `describe`
3. **State expected behavior**: In test name
4. **Document edge cases**: In separate tests
5. **Include examples**: In test descriptions

## See Also

- [Core Features Documentation](../CORE-FEATURES/README.md)
- [Database Documentation](../DATABASE/README.md)
- [Authentication Documentation](../AUTHENTICATION/README.md)
- [Business Logic Documentation](../BUSINESS-LOGIC/README.md)
- [UI Documentation](../UI/README.md)

## Additional Resources

- [Test Execution Results](../IMPLEMENTATION-SUMMARY.md#testing--verification) - Implementation test results
- [CI/CD Integration Guide](../CONFIGURATION/README.md#continuous-integration) - Continuous integration setup
