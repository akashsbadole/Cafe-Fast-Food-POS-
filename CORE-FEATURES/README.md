# Core Features Documentation

## Overview

This directory documents the core application features of the Cafe POS system. These are the fundamental components that power the application's main functionality.

## Included Files

### Main Application Files

- **main.js**: Electron main process
  - Window management
  - Auto-lock functionality
  - IPC communication between main and renderer processes
  - Application lifecycle events

- **preload.js**: Electron preload script
  - Exposes safe APIs to the renderer process
  - Context bridge for secure communication

- **electron-launcher.js**: Application launcher
  - Starts both Express server and Electron app
  - Handles process management
  - Provides error handling for startup issues

- **server.js**: Express server
  - RESTful API endpoints
  - Middleware configuration
  - Error handling
  - CORS configuration

- **app.js**: Main application initialization
  - UI setup and rendering
  - Event listeners
  - Application state management

- **app-alpine.js**: Alpine.js integration
  - Reactive UI components
  - Data binding
  - Event handling

- **ui.js**: UI component management
  - Component rendering
  - Event delegation
  - DOM manipulation

## Core Functionality

### Electron Integration

The application uses Electron to create a cross-platform desktop application with:
- **Main Process**: Handles system-level operations
- **Renderer Process**: Manages the UI
- **IPC Communication**: Secure inter-process communication

### Server Architecture

The Express server provides:
- RESTful API endpoints for all operations
- JWT authentication middleware
- Error handling and logging
- CORS support for web access

### UI Framework

The application uses Alpine.js for:
- Reactive data binding
- Component-based architecture
- Event-driven UI updates
- Minimal JavaScript footprint

## Usage

### Starting the Application

The application can be started in two ways:

1. **Direct Launch**:
   ```bash
   npm start
   ```

2. **Using Launcher**:
   ```bash
   node electron-launcher.js
   ```

### Main Process Operations

The main process (`main.js`) handles:
- Window creation and management
- Auto-lock after inactivity
- Application menu setup
- Native dialogs (file open, save, etc.)

### Renderer Process Operations

The renderer process handles:
- UI rendering and updates
- User interactions
- API calls to the server
- State management

## Configuration

### Electron Configuration

Key configuration options in `main.js`:

```javascript
{
  width: 1200,      // Window width
  height: 800,      // Window height
  autoLockTimeout: 2, // Auto-lock after 2 minutes of inactivity
  minWidth: 800,    // Minimum window width
  minHeight: 600,   // Minimum window height
  title: 'Cafe POS' // Window title
}
```

### Server Configuration

Key configuration in `server.js`:

```javascript
{
  port: process.env.PORT || 3000, // Server port
  cors: true, // Enable CORS
  jwtSecret: process.env.JWT_SECRET, // JWT secret
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h' // Token expiration
}
```

## Dependencies

### Core Dependencies

- **electron**: Cross-platform desktop application framework
- **express**: Web framework for the API server
- **alpine.js**: Reactive JavaScript framework
- **bcrypt**: Password hashing
- **jsonwebtoken**: JWT authentication
- **sqlite3**: SQLite database driver
- **pg**: PostgreSQL database driver (optional)

### Development Dependencies

- **nodemon**: Automatic server restart during development
- **electron-builder**: Application packaging

## Examples

### Creating a New Window

```javascript
// In main.js
const { BrowserWindow } = require('electron');

const newWindow = new BrowserWindow({
  width: 800,
  height: 600,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js')
  }
});

newWindow.loadFile('index.html');
```

### Exposing an API to Renderer

```javascript
// In preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getMenu: () => ipcRenderer.invoke('GET_MENU'),
  createOrder: (order) => ipcRenderer.invoke('CREATE_ORDER', order),
  login: (pin) => ipcRenderer.invoke('LOGIN', pin)
});
```

### Creating an API Endpoint

```javascript
// In server.js
const express = require('express');
const router = express.Router();

router.get('/api/menu', authenticate, (req, res) => {
  db.getMenu()
    .then(menu => res.json(menu))
    .catch(err => res.status(500).json({ error: err.message }));
});

module.exports = router;
```

## Best Practices

### Security

1. Always use context isolation in Electron
2. Never expose unsafe APIs to the renderer
3. Validate all user input
4. Use JWT for authentication
5. Implement auto-lock for security

### Performance

1. Use efficient database queries
2. Implement pagination for large datasets
3. Cache frequently accessed data
4. Use Alpine.js reactive properties wisely

### Maintainability

1. Keep components small and focused
2. Document all public APIs
3. Use consistent naming conventions
4. Implement proper error handling

## Troubleshooting

### Common Issues

#### Window Not Opening
- Check if Electron is installed
- Verify the `index.html` file exists
- Check console logs for errors

#### API Endpoints Not Working
- Verify the server is running
- Check CORS configuration
- Verify JWT middleware is properly configured

#### Auto-Lock Not Working
- Check the `autoLockTimeout` setting
- Verify the inactivity detection logic
- Check if the timer is being reset properly

## See Also

- [Authentication Documentation](../AUTHENTICATION/README.md)
- [Database Documentation](../DATABASE/README.md)
- [Business Logic Documentation](../BUSINESS-LOGIC/README.md)

## Additional Resources

- [Implementation Summary](../IMPLEMENTATION-SUMMARY.md) - Detailed implementation overview
- [Architecture Documentation](../plans/architecture.md) - Technical architecture details
