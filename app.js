const express = require('express');
const http = require('http');
const morgan = require('morgan');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

const fileUpload = require('express-fileupload');

// Load environment variables
dotenv.config();

// Check if we're in a serverless environment
const isServerless = !!(
  process.env.VERCEL || 
  process.env.VERCEL_ENV || 
  process.env.AWS_LAMBDA_FUNCTION_NAME || 
  process.env.FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  (typeof __dirname !== 'undefined' && __dirname.includes('/var/task'))
);

// Import security middleware
const { 
  securityHeaders, 
  authRateLimit, 
  generalRateLimit, 
  strictRateLimit,
  sanitizeData, 
  preventParameterPollution, 
  compressResponse, 
  corsOptions, 
  requestSizeLimit
} = require('./middleware/security');

// Import logging
const { logger, requestLogger, errorLogger } = require('./utils/logger');
const { waitForMongo } = require('./middleware/waitForMongo');

// Cloudinary Configuration (kept for image uploads)
const cloudinary = require('cloudinary').v2;
const cloudinaryConfig = require('./config/cloudinary');

const app = express();

// Set Cloudinary configuration
app.use((req, res, next) => {
  cloudinary.config(cloudinaryConfig);
  next();
});

// Create logs directory if it doesn't exist (only in non-serverless environments)
if (!isServerless) {
  const logsDir = path.join(__dirname, 'logs');
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  } catch (error) {
    console.warn('Could not create logs directory, using console logging only:', error.message);
  }
}

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    logger.info('Connected to MongoDB');
    
    // Initialize background jobs after MongoDB connection
    if (!isServerless) {
      const { initializeJobs } = require('./jobs');
      initializeJobs();
    }
  })
  .catch((error) => {
    logger.error('Failed to connect to MongoDB', { error: error.message });
  });

// Trust proxy (for accurate IP addresses behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware (order matters!)
app.use(securityHeaders);
app.use(compressResponse);
app.use(requestSizeLimit);
app.use(sanitizeData);
app.use(preventParameterPollution);

// CORS configuration
app.use(cors(corsOptions));

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// File upload middleware
app.use(
  fileUpload({
    useTempFiles: true,
    createParentPath: true,
    tempFileDir: '/tmp/',
    limits: { fileSize: 10 * 1024 * 1024 }
  })
);

// Logging middleware
app.use(requestLogger);
app.use(morgan('combined', { stream: require('./utils/logger').stream }));

// API versioning
app.use('/api/v1', (req, res, next) => {
  req.apiVersion = 'v1';
  next();
});

// Wait for MongoDB before API routes (critical for serverless cold start)
app.use('/api', waitForMongo);

// Rate limiting for different endpoints
app.use('/api/v1/auth', authRateLimit);
app.use('/api/v1/payments', strictRateLimit);
app.use('/api/v1', generalRateLimit);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Routes
const paymentRoutes = require('./routes/paymentRoutes');
const paymentMethodRoutes = require('./routes/paymentMethodRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const authRoutes = require('./routes/authRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const cjConfigRoutes = require('./routes/cjConfigRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const publicCategoryRoutes = require('./routes/publicCategoryRoutes');
const adminRoutes = require('./routes/adminRoutes');
const faqRoutes = require('./routes/faqRoutes');
const adminFaqRoutes = require('./routes/adminFaqRoutes');
const adminCouponRoutes = require('./routes/adminCouponRoutes');
const couponRoutes = require('./routes/couponRoutes');
const adminBlogRoutes = require('./routes/adminBlogRoutes');
const blogRoutes = require('./routes/blogRoutes');
const adminReviewRoutes = require('./routes/adminReviewRoutes');
const adminDisputeRoutes = require('./routes/adminDisputeRoutes');
const storeContentRoutes = require('./routes/storeContentRoutes');
const contentRoutes = require('./routes/contentRoutes');
const storeSettingsRoutes = require('./routes/storeSettingsRoutes');

// Mount routes
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/payment-methods', paymentMethodRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/categories', publicCategoryRoutes); // Public category routes
app.use('/api/v1/faqs', faqRoutes);
app.use('/api/v1/admin/cj-config', cjConfigRoutes);
app.use('/api/v1/admin/faqs', adminFaqRoutes);
app.use('/api/v1/admin/coupons', adminCouponRoutes);
app.use('/api/v1/coupons', couponRoutes);
app.use('/api/v1/admin/blog', adminBlogRoutes);
app.use('/api/v1/blog', blogRoutes);
app.use('/api/v1/admin/reviews', adminReviewRoutes);
app.use('/api/v1/admin/disputes', adminDisputeRoutes);
app.use('/api/v1/admin/stores/:storeId/content', storeContentRoutes);
app.use('/api/v1/content', contentRoutes);
app.use('/api/v1/store', storeSettingsRoutes);
app.use('/api/v1/admin/categories', categoryRoutes); // Admin category routes
app.use('/api/v1/admin', adminRoutes); // Admin dashboard + orders (must be after more specific admin paths)

// Error handling middleware
app.use(errorLogger);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
});

// Only start HTTP server if NOT in serverless environment
if (!isServerless) {
  const PORT = process.env.PORT || 5000;
  
  app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`, {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  });
} else {
  logger.info('Serverless function initialized', {
    environment: process.env.NODE_ENV || 'production',
    platform: process.env.VERCEL ? 'Vercel' : 'Unknown',
    timestamp: new Date().toISOString()
  });
}

// Export the app for serverless environments
module.exports = app;
