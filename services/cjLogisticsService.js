const cjAuthService = require('./cjAuthService');
const { logger } = require('../utils/logger');

class CjLogisticsService {
  /**
   * Query freight options
   */
  async queryFreight(params) {
    try {
      const {
        productId,
        variantId = '',
        countryCode,
        quantity = 1,
      } = params;

      if (!productId || !countryCode) {
        throw new Error('Product ID and country code are required');
      }

      const response = await cjAuthService.makeAuthenticatedRequest(
        'POST',
        '/logistics/queryFreight',
        {
          productId,
          variantId,
          countryCode,
          quantity,
        }
      );

      return response.data || [];
    } catch (error) {
      logger.error('Error querying freight', {
        error: error.message,
        params,
      });
      throw error;
    }
  }

  /**
   * Query available shipping methods
   */
  async queryShippingMethods(params) {
    try {
      const { countryCode } = params;

      if (!countryCode) {
        throw new Error('Country code is required');
      }

      const response = await cjAuthService.makeAuthenticatedRequest(
        'POST',
        '/logistics/queryShippingMethod',
        {
          countryCode,
        }
      );

      return response.data || [];
    } catch (error) {
      logger.error('Error querying shipping methods', {
        error: error.message,
        params,
      });
      throw error;
    }
  }

  /**
   * Query tracking information
   */
  async queryTracking(trackingNumber, carrierCode = '') {
    try {
      if (!trackingNumber) {
        throw new Error('Tracking number is required');
      }

      const response = await cjAuthService.makeAuthenticatedRequest(
        'POST',
        '/logistics/queryTracking',
        {
          trackingNumber,
          carrierCode,
        }
      );

      return response.data || null;
    } catch (error) {
      logger.error('Error querying tracking', {
        error: error.message,
        trackingNumber,
      });
      throw error;
    }
  }
}

module.exports = new CjLogisticsService();




