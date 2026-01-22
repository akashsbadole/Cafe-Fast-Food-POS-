// Security middleware for Cafe POS API
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Security configuration
const SECURITY_CONFIG = {
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-prod',
  jwtExpiry: '12h',
  rateLimitWindow: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 100, // requests per window
  bcryptRounds: 12
};

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:8080',
      'http://127.0.0.1:8080'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count']
};

// Rate limiting configuration
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs: windowMs,
    max: max,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  });
};

// General rate limiter
const generalLimiter = createRateLimiter(
  SECURITY_CONFIG.rateLimitWindow,
  SECURITY_CONFIG.rateLimitMax,
  'Too many requests'
);

// Strict rate limiter for authentication endpoints
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts per window
  'Too many authentication attempts'
);

// Very strict rate limiter for sensitive operations
const sensitiveLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  10, // 10 attempts per hour
  'Too many sensitive operations'
);

// Helmet security headers
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://127.0.0.1:3000", "http://localhost:3000"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    });
  }

  // Sanitize body parameters
  if (req.body) {
    const sanitizeObject = (obj) => {
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].trim();
          // Remove potentially dangerous characters
          obj[key] = obj[key].replace(/[<>\"'&]/g, '');
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      });
    };
    sanitizeObject(req.body);
  }

  next();
};


// JWT authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required'
    });
  }

  jwt.verify(token, SECURITY_CONFIG.jwtSecret, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
    
    // Add user info to request
    req.user = user;
    next();
  });
};

// Role-based access control middleware
const requireRole = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const userRoles = Array.isArray(req.user.role) ? req.user.role : [req.user.role];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role) || userRoles.includes('admin'));

    if (!hasRequiredRole) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Permission-based access control middleware
const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const userPermissions = req.user.permissions || [];
    
    // Admin has all permissions
    if (userPermissions.includes('manage_all') || req.user.role === 'admin') {
      return next();
    }

    if (!userPermissions.includes(requiredPermission)) {
      return res.status(403).json({
        success: false,
        error: `Permission required: ${requiredPermission}`
      });
    }

    next();
  };
};

// SQL injection prevention middleware
const preventSQLInjection = (req, res, next) => {
  const checkForSQL = (obj, path = '') => {
    if (typeof obj === 'string') {
      // Common SQL injection patterns
      const sqlPatterns = [
        // 1. Dangerous SQL command keywords
        /\b(select|insert|update|delete|drop|union|exec(ute)?|cast|convert)\b/i,

        // 2. SQL meta-characters and common injection glue
        /['";|]|\b(?:--|\/\*|\*\/)\b|(?:\b(?:or|and)\b\s+(?:1=1|true|'[^']*'))/i,

        // 3. Very common tautology fragments
        /\b(?:1\s*=\s*1|true\s*(?:=|is)\s*true|'[^']*'\s*=\s*'[^']*')\b/i,
      ];

      for (const pattern of sqlPatterns) {
        if (pattern.test(obj)) {
          throw new Error(`Potential SQL injection detected in ${path}: ${obj}`);
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        checkForSQL(value, `${path}.${key}`);
      }
    }
  };

  try {
    if (req.body) checkForSQL(req.body, 'body');
    if (req.query) checkForSQL(req.query, 'query');
    if (req.params) checkForSQL(req.params, 'params');
    
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// XSS prevention middleware
const preventXSS = (req, res, next) => {
  const checkForXSS = (obj, path = '') => {
    if (typeof obj === 'string') {
      // Common XSS patterns
      const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /onload\s*=/gi,
        /onerror\s*=/gi,
        /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
        /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi
      ];

      for (const pattern of xssPatterns) {
        if (pattern.test(obj)) {
          throw new Error(`Potential XSS attack detected in ${path}: ${obj}`);
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        checkForXSS(value, `${path}.${key}`);
      }
    }
  };

  try {
    if (req.body) checkForXSS(req.body, 'body');
    if (req.query) checkForXSS(req.query, 'query');
    
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Request size limiting
const requestSizeLimiter = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'], 10);
    const maxSizeBytes = parseMaxSize(maxSize);
    
    if (contentLength && contentLength > maxSizeBytes) {
      return res.status(413).json({
        success: false,
        error: `Request too large. Maximum size: ${maxSize}`
      });
    }
    
    next();
  };
};

// Helper function to parse size strings
const parseMaxSize = (sizeStr) => {
  const units = { 'b': 1, 'kb': 1024, 'mb': 1024 * 1024, 'gb': 1024 * 1024 * 1024 };
  const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/);
  if (!match) return 10 * 1024 * 1024; // Default 10MB
  
  const [, size, unit] = match;
  return parseFloat(size) * units[unit];
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }

  // Development error response
  res.status(err.status || 500).json({
    success: false,
    error: err.message,
    stack: err.stack
  });
};

// 404 handler
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
};

// Security headers middleware
const addSecurityHeaders = (req, res, next) => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};

// Activity logging middleware
const logActivity = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? 'ERROR' : 'INFO';
    console.log(`${logLevel} - ${res.statusCode} - ${duration}ms - ${req.method} ${req.path}`);
  });
  
  next();
};

// Export all middleware functions
module.exports = {
  // Security middleware
  helmet: helmet(helmetConfig),
  cors: cors(corsOptions),
  sanitizeInput,
  preventSQLInjection,
  preventXSS,
  requestSizeLimiter,
  addSecurityHeaders,
  logActivity,
  
  // Rate limiting
  generalLimiter,
  authLimiter,
  sensitiveLimiter,
  
  // Authentication & Authorization
  authenticateToken,
  requireRole,
  requirePermission,
  
  // Error handling
  errorHandler,
  notFoundHandler,
  
  // Configuration
  SECURITY_CONFIG
};
