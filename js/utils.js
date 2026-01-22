// Utility functions for Cafe POS

// Format currency
function formatCurrency(amount) {
  return '₹' + parseFloat(amount).toFixed(2);
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleString('default', { month: 'short' });
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

// Format time
function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('default', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Format date time
function formatDateTime(dateString) {
  return formatDate(dateString) + ' ' + formatTime(dateString);
}

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle function
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Get current date string (YYYY-MM-DD)
function getCurrentDate() {
  return new Date().toISOString().split('T')[0];
}

// Get current timestamp
function getCurrentTimestamp() {
  return new Date().toISOString();
}

// Calculate tax
function calculateTax(amount, taxRate) {
  return (amount * taxRate) / 100;
}

// Calculate discount
function calculateDiscount(amount, discountValue, discountType) {
  if (discountType === 'percentage') {
    return (amount * discountValue) / 100;
  }
  return Math.min(discountValue, amount);
}

// Validate PIN (4-6 digits)
function validatePin(pin) {
  return /^\d{4,6}$/.test(pin);
}

// Sanitize string for display
function sanitizeString(str) {
  // In Node.js, return as-is
  // In browser, use DOM sanitization
  if (typeof window !== 'undefined' && window.document) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  return String(str);
}

// Get initials from name
function getInitials(name) {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Copy text to clipboard
async function copyToClipboard(text) {
  try {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for Node.js or older browsers
      console.log('Text to copy:', text);
    }
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}

// Print element
function printElement(elementId) {
  // This is a browser-only function
  if (typeof window === 'undefined' || !window.document) {
    console.warn('printElement is only available in browser context');
    return;
  }
  
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Print</title>
        <style>
          body { font-family: 'Courier New', monospace; padding: 20px; }
          * { -webkit-print-color-adjust: exact; }
        </style>
      </head>
      <body>
        ${element.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

// Local storage helpers
const storage = {
  get: (key, defaultValue = null) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      }
      return defaultValue;
    } catch (e) {
      return defaultValue;
    }
  },
  
  set: (key, value) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },
  
  remove: (key) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(key);
    }
  },
  
  clear: () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.clear();
    }
  }
};

// Export utilities
const utils = {
  formatCurrency,
  formatDate,
  formatTime,
  formatDateTime,
  generateId,
  debounce,
  throttle,
  getCurrentDate,
  getCurrentTimestamp,
  calculateTax,
  calculateDiscount,
  validatePin,
  sanitizeString,
  getInitials,
  copyToClipboard,
  printElement,
  storage
};

// Export for Node.js
module.exports = utils;

// Export for browser
if (typeof window !== 'undefined') {
  window.Utils = utils;
}
