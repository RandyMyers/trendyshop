const dotenv = require('dotenv');

// Cloudinary configuration - reads from environment variables
const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
};

// Validate that all required environment variables are set
if (!cloudinaryConfig.cloud_name || !cloudinaryConfig.api_key || !cloudinaryConfig.api_secret) {
  console.error('❌ Error: Missing Cloudinary credentials in environment variables');
  console.error('Please ensure CLOUDINARY_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_SECRET are set in .env file');
}

module.exports = cloudinaryConfig;