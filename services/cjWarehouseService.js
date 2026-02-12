const cjAuthService = require('./cjAuthService');
const { logger } = require('../utils/logger');

/**
 * Get list of CJ global warehouses
 * GET /product/globalWarehouseList
 */
async function getWarehouseList() {
  try {
    const response = await cjAuthService.makeAuthenticatedRequest(
      'GET',
      '/product/globalWarehouseList',
      null
    );
    const { code, result, success, data, message } = response;
    if (code !== 200 || (!result && !success)) {
      throw new Error(message || 'Failed to get CJ warehouse list');
    }
    return Array.isArray(data) ? data : [];
  } catch (error) {
    logger.error('Error getting CJ warehouse list', { error: error.message });
    throw error;
  }
}

module.exports = { getWarehouseList };
