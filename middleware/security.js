const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');

// Security headers
exports.securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.flutterwave.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
    },
  },
});

// Compression middleware
exports.compressResponse = compression();

// Request size limit
exports.requestSizeLimit = (req, res, next) => {
  if (req.headers['content-length'] && parseInt(req.headers['content-length']) > 10 * 1024 * 1024) {
    return res.status(413).json({ error: 'Payload too large' });
  }
  next();
};

// Sanitize data (basic)
exports.sanitizeData = (req, res, next) => {
  // Basic sanitization - remove potential XSS
  if (req.body && typeof req.body === 'object') {
    const sanitize = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };
    sanitize(req.body);
  }
  next();
};

// Prevent parameter pollution
exports.preventParameterPollution = (req, res, next) => {
  // Express already handles this, but we can add custom logic if needed
  next();
};

// CORS options - allow Netlify, Vercel, localhost, and env-configured origins
exports.corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl, same-origin)
    if (!origin) return callback(null, true);

    // Allow localhost:3000 and localhost:3001 for local admin (when client is hosted)
    if (['http://localhost:3000', 'http://localhost:3001', 'https://localhost:3000', 'https://localhost:3001'].includes(origin)) {
      return callback(null, true);
    }

    // Development: allow localhost
    if (process.env.NODE_ENV !== 'production') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
    }

    // Build allowed list from env
    const allowedOrigins = [
      process.env.CLIENT_URL,
      process.env.ADMIN_URL,
    ].filter(Boolean);

    // Allow Netlify (*.netlify.app) and Vercel (*.vercel.app) - use includes for subdomains
    if (origin.includes('netlify.app') || origin.includes('vercel.app')) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Production fallback: allow any HTTPS origin (relaxed for deployment flexibility)
    if (process.env.NODE_ENV === 'production' && origin.startsWith('https://')) {
      return callback(null, true);
    }

    console.warn('CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma',
    'CJ-Access-Token',
    'X-Store-Id',
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
};

// Rate limiters
exports.authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
});

exports.generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Higher limit in dev to avoid 429 during hot reload/loops
});

exports.strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
});

exports.notificationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // Limit each IP to 3 requests per minute
});

// Admin IP whitelist (optional - can be configured later)
exports.adminIPWhitelist = (req, res, next) => {
  // Can implement IP whitelist logic here if needed
  next();
};

