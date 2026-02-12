const cjAuthService = require('./cjAuthService');
const { logger } = require('../utils/logger');

/**
 * Get CJ Dropshipping account balance
 * CJ API: GET /shopping/pay/getBalance
 */
async function getBalance() {
  try {
    const response = await cjAuthService.makeAuthenticatedRequest(
      'GET',
      '/shopping/pay/getBalance',
      null
    );

    const { code, result, data, message } = response;

    if (code !== 200 || !result) {
      throw new Error(message || 'Failed to get CJ balance');
    }

    return {
      amount: data?.amount ?? 0,
      noWithdrawalAmount: data?.noWithdrawalAmount ?? null,
      freezeAmount: data?.freezeAmount ?? null,
    };
  } catch (error) {
    logger.error('Error getting CJ balance', { error: error.message });
    throw error;
  }
}

module.exports = { getBalance };
