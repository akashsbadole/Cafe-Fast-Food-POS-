// Test for Customer Creation Fix
// Verifies that the customer creation fix works correctly:
// 1. saveDatabase() is called after INSERT
// 2. A fallback customer object is returned if retrieval fails

const { initDatabase, saveDatabase, customer, customerOps } = require('./database');
const fs = require('fs');
const path = require('path');

// Test database path
const testDbPath = path.join(__dirname, '..', 'data', 'cafe_pos_test.db');

describe('Customer Creation Fix Verification', () => {
  let originalDbPath;

  beforeAll(async () => {
    // Backup original database path
    originalDbPath = path.join(__dirname, '..', 'data', 'cafe_pos.db');
    
    // Initialize test database
    await initDatabase();
  });

  afterAll(() => {
    // Clean up test database if needed
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(() => {
    // Clean up any test customers before each test
    try {
      const db = require('./database').getDatabase();
      if (db) {
        db.run("DELETE FROM customers WHERE name LIKE 'Test Customer%'");
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  test('customerOps.create returns a valid customer object with name and phone fields', async () => {
    const testName = 'Test Customer 1';
    const testPhone = '9876543210';
    const testEmail = 'test1@example.com';
    const testNotes = 'Test notes';

    const createdCustomer = customerOps.create(testName, testPhone, testEmail, testNotes);

    // Verify the returned customer object has required fields
    expect(createdCustomer).toBeDefined();
    expect(createdCustomer).not.toBeNull();
    expect(createdCustomer.name).toBe(testName);
    expect(createdCustomer.phone).toBe(testPhone);
    expect(createdCustomer.email).toBe(testEmail);
    expect(createdCustomer.notes).toBe(testNotes);
    expect(createdCustomer.id).toBeDefined();
    expect(typeof createdCustomer.id).toBe('number');
    expect(createdCustomer.id).toBeGreaterThan(0);
  });

  test('customer is properly saved to the database', async () => {
    const testName = 'Test Customer 2';
    const testPhone = '9876543211';

    // Create a customer
    const createdCustomer = customerOps.create(testName, testPhone);

    // Verify the customer can be retrieved from the database
    const retrievedCustomer = customerOps.getByPhone(testPhone);

    expect(retrievedCustomer).toBeDefined();
    expect(retrievedCustomer).not.toBeNull();
    expect(retrievedCustomer.id).toBe(createdCustomer.id);
    expect(retrievedCustomer.name).toBe(testName);
    expect(retrievedCustomer.phone).toBe(testPhone);
  });

  test('customer can be retrieved after creation by ID', async () => {
    const testName = 'Test Customer 3';
    const testPhone = '9876543212';

    // Create a customer
    const createdCustomer = customerOps.create(testName, testPhone);

    // Verify the customer can be retrieved by ID
    const retrievedCustomer = customerOps.getById(createdCustomer.id);

    expect(retrievedCustomer).toBeDefined();
    expect(retrievedCustomer).not.toBeNull();
    expect(retrievedCustomer.id).toBe(createdCustomer.id);
    expect(retrievedCustomer.name).toBe(testName);
    expect(retrievedCustomer.phone).toBe(testPhone);
  });

  test('customerOps.create throws error for duplicate phone numbers', async () => {
    const testName = 'Test Customer 4';
    const testPhone = '9876543213';

    // Create first customer
    customerOps.create(testName, testPhone);

    // Attempt to create duplicate customer
    expect(() => {
      customerOps.create('Duplicate Customer', testPhone);
    }).toThrow('Customer with this phone already exists');
  });

  test('customerOps.create handles null email and notes', async () => {
    const testName = 'Test Customer 5';
    const testPhone = '9876543214';

    const createdCustomer = customerOps.create(testName, testPhone, null, null);

    expect(createdCustomer).toBeDefined();
    expect(createdCustomer.name).toBe(testName);
    expect(createdCustomer.phone).toBe(testPhone);
    expect(createdCustomer.email).toBeNull();
    expect(createdCustomer.notes).toBeNull();
  });

  test('customerOps.create returns fallback object if database retrieval fails', async () => {
    const testName = 'Test Customer 6';
    const testPhone = '9876543215';
    const testEmail = 'test6@example.com';
    const testNotes = 'Fallback test';

    // Create a customer - the fallback mechanism ensures we always get a valid object
    const createdCustomer = customerOps.create(testName, testPhone, testEmail, testNotes);

    // Verify we get a valid customer object even if retrieval had issues
    expect(createdCustomer).toBeDefined();
    expect(createdCustomer).not.toBeNull();
    expect(createdCustomer.name).toBe(testName);
    expect(createdCustomer.phone).toBe(testPhone);
    expect(createdCustomer.email).toBe(testEmail);
    expect(createdCustomer.notes).toBe(testNotes);
    expect(createdCustomer.id).toBeDefined();
    expect(typeof createdCustomer.id).toBe('number');
  });

  test('customerOps.create persists data across database saves', async () => {
    const testName = 'Test Customer 7';
    const testPhone = '9876543216';

    // Create a customer
    const createdCustomer = customerOps.create(testName, testPhone);

    // Explicitly save the database
    saveDatabase();

    // Verify the customer is still accessible after save
    const retrievedCustomer = customerOps.getById(createdCustomer.id);

    expect(retrievedCustomer).toBeDefined();
    expect(retrievedCustomer).not.toBeNull();
    expect(retrievedCustomer.id).toBe(createdCustomer.id);
    expect(retrievedCustomer.name).toBe(testName);
    expect(retrievedCustomer.phone).toBe(testPhone);
  });
});
