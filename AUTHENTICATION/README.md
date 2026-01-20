# Authentication & Security Documentation

## Overview

The Cafe POS system implements a comprehensive authentication and security system with role-based access control, PIN/password authentication, session management, and audit logging.

## Authentication System

### Core Files

- **auth.js**: Authentication logic
  - PIN/password verification
  - Session management
  - Auto-lock functionality
  - JWT token handling

- **abilities.js**: Role-based permissions
  - Permission definitions
  - Role assignments
  - Access control

### Authentication Flow

```
1. User enters PIN
2. System verifies PIN with bcrypt hash
3. If valid, creates JWT token
4. Token stored in session
5. User granted access based on role
6. Auto-lock after inactivity
```

## Security Features

### PIN Authentication

- **Hashing**: bcrypt with salt rounds
- **Validation**: Minimum 4 digits
- **Storage**: Never stored in plaintext
- **Reset**: Admin can reset user PINs

### Role-Based Access Control

The system defines two roles:

#### Admin Role
- Full access to all features
- User management
- System configuration
- Report access
- Inventory management
- Token queue administration

#### Cashier Role
- Order processing
- Payment handling
- Basic reporting
- Limited user management
- No system configuration

### Session Management

- **JWT Tokens**: Signed tokens with expiration
- **Token Storage**: In-memory and localStorage
- **Token Expiration**: Configurable (default: 1 hour)
- **Session Timeout**: Auto-lock after inactivity

### Auto-Lock

- **Timeout**: Configurable (default: 2 minutes)
- **Detection**: Mouse/keyboard activity
- **Lock Screen**: Secure PIN re-entry required
- **Notification**: Visual warning before lock

## Configuration

### Environment Variables

```env
# Authentication Settings
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=1h
AUTO_LOCK_TIMEOUT=2
MIN_PIN_LENGTH=4
```

### Role Definitions

```javascript
// In abilities.js
const roles = {
  admin: {
    can: ['manage:users', 'manage:menu', 'manage:inventory', 
          'manage:reports', 'manage:settings', 'manage:token-queue']
  },
  cashier: {
    can: ['create:order', 'update:order', 'delete:order',
          'view:reports', 'process:payment']
  }
};
```

## Usage

### User Login

```javascript
const auth = require('./auth');

// Login with PIN
try {
  const token = await auth.login('1234');
  localStorage.setItem('token', token);
  // Redirect to main screen
} catch (error) {
  showError('Invalid PIN');
}
```

### Verify Authentication

```javascript
const auth = require('./auth');

// Check if user is authenticated
if (auth.isAuthenticated()) {
  // User is logged in
  const user = auth.getCurrentUser();
  const role = user.role;
} else {
  // Redirect to login
}
```

### Check Permissions

```javascript
const abilities = require('./abilities');

// Check if user can perform action
if (abilities.can('manage:users')) {
  // Show user management interface
} else {
  // Hide or disable controls
}
```

### Auto-Lock Implementation

```javascript
const auth = require('./auth');

// Initialize auto-lock
auth.initAutoLock({
  timeout: 2, // minutes
  onLock: () => {
    // Show lock screen
    showLockScreen();
  }
});

// Reset timer on activity
document.addEventListener('mousemove', () => {
  auth.resetInactivityTimer();
});

document.addEventListener('keydown', () => {
  auth.resetInactivityTimer();
});
```

## API Authentication

### JWT Middleware

```javascript
const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Apply to routes
app.get('/api/protected', authenticate, (req, res) => {
  res.json({ message: 'Protected data' });
});
```

### Protected API Example

```javascript
const express = require('express');
const auth = require('./auth');
const router = express.Router();

// Protected route
router.get('/api/orders', auth.authenticate, async (req, res) => {
  try {
    const orders = await db.getOrders(req.user.id);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

## Security Best Practices

### Password Security

1. **Never store plaintext PINs**
2. **Use bcrypt with sufficient salt rounds**
3. **Enforce minimum PIN length**
4. **Implement PIN complexity requirements**
5. **Allow PIN resets**

### Session Security

1. **Use JWT with expiration**
2. **Store tokens securely**
3. **Implement auto-lock**
4. **Clear tokens on logout**
5. **Invalidate tokens on password change**

### Access Control

1. **Implement role-based permissions**
2. **Follow principle of least privilege**
3. **Audit all access attempts**
4. **Log failed login attempts**
5. **Implement account lockout after failed attempts**

### Data Protection

1. **Encrypt sensitive data**
2. **Use HTTPS for all communications**
3. **Validate all input**
4. **Sanitize output**
5. **Implement CSRF protection**

## Troubleshooting

### Common Authentication Issues

#### Login Failed
- Verify PIN is correct
- Check if account is active
- Verify bcrypt hash is valid
- Check for locked accounts

#### Session Expired
- Increase JWT expiration time
- Check token storage
- Verify token refresh logic

#### Permission Denied
- Check user role assignment
- Verify permission definitions
- Review abilities configuration

#### Auto-Lock Not Working
- Check inactivity timer
- Verify event listeners
- Test activity detection

## Audit Logging

The system maintains comprehensive audit logs:
- **Login attempts** (successful and failed)
- **User actions** (create, update, delete)
- **System changes** (settings, configuration)
- **Security events** (locks, unlocks, permission changes)

Audit logs are stored in the `audit_logs` table and can be viewed in the admin interface.

## See Also

- [Core Features Documentation](../CORE-FEATURES/README.md)
- [Database Documentation](../DATABASE/README.md)
- [Business Logic Documentation](../BUSINESS-LOGIC/README.md)

## Additional Resources

- [Security Architecture Details](../plans/architecture.md#security-architecture) - Detailed security implementation
- [Security Best Practices Guide](../DOCUMENTATION-ANALYSIS.md#security-features) - Security recommendations and features
