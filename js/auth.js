// Authentication module for Cafe POS

const bcrypt = require('bcryptjs');

const Auth = {
  // Database instance - will be set during initialization
  db: null,
  
  // Initialize auth with database
  init: (database) => {
    if (!database) {
      throw new Error('Database instance is required for authentication');
    }
    Auth.db = database;
  },
  
  // Verify PIN
  verifyPin: async (pin) => {
    try {
      if (!Auth.db) {
        throw new Error('Database not initialized');
      }
      
      const user = await Auth.db.get('SELECT id, pin_hash FROM users WHERE username = ?', ['admin']);
      if (!user) return false;
      
      return bcrypt.compareSync(pin, user.pin_hash);
    } catch (error) {
      console.error('Error verifying PIN:', error);
      throw new Error('Authentication failed: ' + error.message);
    }
  },
  
  // Verify password
  verifyPassword: async (password) => {
    try {
      if (!Auth.db) {
        throw new Error('Database not initialized');
      }
      
      const user = await Auth.db.get('SELECT id, password_hash FROM users WHERE username = ?', ['admin']);
      if (!user) return false;
      
      return bcrypt.compareSync(password, user.password_hash);
    } catch (error) {
      console.error('Error verifying password:', error);
      throw new Error('Authentication failed: ' + error.message);
    }
  },
  
  // Login user
  login: async (pin) => {
    try {
      if (!Auth.db) {
        throw new Error('Database not initialized');
      }
      
      const user = await Auth.db.get('SELECT id, username, role FROM users WHERE username = ?', ['admin']);
      if (!user) return null;
      
      // Update last login
      await Auth.db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
      
      return {
        id: user.id,
        username: user.username,
        role: user.role
      };
    } catch (error) {
      console.error('Error logging in:', error);
      throw new Error('Login failed: ' + error.message);
    }
  },
  
  // Change PIN
  changePin: async (currentPin, newPin) => {
    try {
      if (!Auth.db) {
        throw new Error('Database not initialized');
      }
      
      const user = await Auth.db.get('SELECT id, pin_hash FROM users WHERE username = ?', ['admin']);
      if (!user) return { success: false, message: 'User not found' };
      
      if (!bcrypt.compareSync(currentPin, user.pin_hash)) {
        return { success: false, message: 'Current PIN is incorrect' };
      }
      
      const newPinHash = bcrypt.hashSync(newPin, 10);
      await Auth.db.run('UPDATE users SET pin_hash = ? WHERE id = ?', [newPinHash, user.id]);
      
      return { success: true, message: 'PIN changed successfully' };
    } catch (error) {
      console.error('Error changing PIN:', error);
      throw new Error('PIN change failed: ' + error.message);
    }
  },
  
  // Change password
  changePassword: async (currentPassword, newPassword) => {
    try {
      if (!Auth.db) {
        throw new Error('Database not initialized');
      }
      
      const user = await Auth.db.get('SELECT id, password_hash FROM users WHERE username = ?', ['admin']);
      if (!user) return { success: false, message: 'User not found' };
      
      if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
        return { success: false, message: 'Current password is incorrect' };
      }
      
      const newPasswordHash = bcrypt.hashSync(newPassword, 10);
      await Auth.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, user.id]);
      
      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      console.error('Error changing password:', error);
      throw new Error('Password change failed: ' + error.message);
    }
  }
};

// Session management
const Session = {
  isLoggedIn: false,
  currentUser: null,
  idleTime: 0,
  idleTimer: null,
  idleThreshold: 120000, // 2 minutes
  
  startSession: (user) => {
    Session.isLoggedIn = true;
    Session.currentUser = user;
    Session.idleTime = 0;
    Session.startIdleTimer();
  },
  
  endSession: () => {
    Session.isLoggedIn = false;
    Session.currentUser = null;
    Session.stopIdleTimer();
    Session.idleTime = 0;
  },
  
  startIdleTimer: () => {
    Session.stopIdleTimer();
    
    Session.idleTimer = setInterval(() => {
      Session.idleTime += 1000;
      
      if (Session.idleTime >= Session.idleThreshold) {
        Session.lockSession();
      }
    }, 1000);
  },
  
  stopIdleTimer: () => {
    if (Session.idleTimer) {
      clearInterval(Session.idleTimer);
      Session.idleTimer = null;
    }
    Session.idleTime = 0;
  },
  
  resetIdleTimer: () => {
    Session.idleTime = 0;
  },
  
  lockSession: () => {
    Session.isLoggedIn = false;
    showScreen('lock-screen');
    
    // Notify main process
    if (window.electronAPI) {
      window.electronAPI.sendUserActivity();
    }
  },
  
  unlockSession: (pin) => {
    Auth.verifyPin(pin).then(isValid => {
      if (isValid) {
        const user = Auth.login(pin);
        Session.startSession(user);
        hideScreen('lock-screen');
        showScreen('app-screen');
        
        if (window.electronAPI) {
          window.electronAPI.unlockApp();
        }
      } else {
        showError('lock-error', 'Invalid PIN');
      }
    });
  }
};

// Auto-lock functionality
function setupAutoLock() {
  if (!window.electronAPI) return;
  
  // Listen for lock screen events from main process
  window.electronAPI.onLockScreen(() => {
    if (Session.isLoggedIn) {
      Session.lockSession();
    }
  });
  
  window.electronAPI.onAppUnlocked(() => {
    Session.isLoggedIn = true;
    Session.startIdleTimer();
  });
  
  // Track user activity
  document.addEventListener('mousemove', () => {
    if (Session.isLoggedIn) {
      Session.resetIdleTimer();
      window.electronAPI.sendUserActivity();
    }
  });
  
  document.addEventListener('keypress', () => {
    if (Session.isLoggedIn) {
      Session.resetIdleTimer();
      window.electronAPI.sendUserActivity();
    }
  });
  
  document.addEventListener('click', () => {
    if (Session.isLoggedIn) {
      Session.resetIdleTimer();
      window.electronAPI.sendUserActivity();
    }
  });
}

// Initialize authentication
function initAuth() {
  setupAutoLock();
  
  // Login form submission
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = getPinInput('login-form');
      
      if (pin.length < 4) {
        showError('login-error', 'Please enter complete PIN');
        return;
      }
      
      Auth.verifyPin(pin).then(isValid => {
        if (isValid) {
          const user = Auth.login(pin);
          Session.startSession(user);
          hideScreen('login-screen');
          showScreen('app-screen');
          
          // Initialize app after login
          if (typeof initApp === 'function') {
            initApp();
          }
        } else {
          showError('login-error', 'Invalid PIN. Use 1234');
          clearPinInput('login-form');
        }
      });
    });
  }
  
  // Lock form submission
  const lockForm = document.getElementById('lock-form');
  if (lockForm) {
    lockForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = getPinInput('lock-form');
      
      if (pin.length < 4) {
        showError('lock-error', 'Please enter complete PIN');
        return;
      }
      
      Session.unlockSession(pin);
    });
  }
  
  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      Session.endSession();
      clearPinInput('login-form');
      hideScreen('app-screen');
      showScreen('login-screen');
    });
  }
}

// Helper functions
function getPinInput(formId) {
  const form = document.getElementById(formId);
  if (!form) return '';
  
  const inputs = form.querySelectorAll('.pin-digit');
  let pin = '';
  inputs.forEach(input => {
    pin += input.value;
  });
  return pin;
}

function clearPinInput(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  
  const inputs = form.querySelectorAll('.pin-digit');
  inputs.forEach(input => {
    input.value = '';
  });
  if (inputs.length > 0) {
    inputs[0].focus();
  }
}

function showError(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    setTimeout(() => {
      element.textContent = '';
    }, 3000);
  }
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
  }
}

function hideScreen(screenId) {
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.remove('active');
  }
}

// Export auth module
window.Auth = Auth;
window.Session = Session;
window.initAuth = initAuth;
window.getPinInput = getPinInput;
window.clearPinInput = clearPinInput;
window.showError = showError;
window.showScreen = showScreen;
window.hideScreen = hideScreen;
