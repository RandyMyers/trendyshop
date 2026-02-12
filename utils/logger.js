const winston = require('winston');
const path = require('path');
const fs = require('fs');

const isServerless = !!(process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME);

const transports = [];

// File transports only when not serverless (Vercel has read-only filesystem)
if (!isServerless) {
  try {
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    transports.push(
      new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
      new winston.transports.File({ filename: path.join(logsDir, 'combined.log') })
    );
  } catch (err) {
    console.warn('Could not create logs directory, using console only:', err.message);
  }
}

// Always use console in serverless; in dev also use console
if (isServerless || process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// Ensure at least one transport (serverless may have none yet)
if (transports.length === 0) {
  transports.push(new winston.transports.Console({ format: winston.format.simple() }));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'shop-api' },
  transports,
});

// Request logger middleware
exports.requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });
  
  next();
};

// Error logger middleware
exports.errorLogger = (err, req, res, next) => {
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });
  next(err);
};

// Export logger instance
exports.logger = logger;

// Create a stream object for Morgan
exports.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};




