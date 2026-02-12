module.exports = {
  apiKey: process.env.CJ_API_KEY,
  baseURL: process.env.CJ_API_BASE_URL || 'https://developers.cjdropshipping.com/api2.0/v1',
  tokenExpiryBuffer: 2 * 24 * 60 * 60 * 1000, // 2 days in milliseconds
};




