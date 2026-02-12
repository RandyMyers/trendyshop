const CjToken = require('../models/CjToken');
const CjConfig = require('../models/CjConfig');
const cjAuthService = require('../services/cjAuthService');
const cjWarehouseService = require('../services/cjWarehouseService');
const cjConfigModule = require('../config/cj-dropshipping');
const { logger } = require('../utils/logger');

/**
 * Get CJ Token Status
 * GET /api/v1/admin/cj-config/token-status
 */
exports.getTokenStatus = async (req, res) => {
  try {
    const tokenDoc = await CjToken.getLatestToken();
    
    if (!tokenDoc) {
      return res.status(200).json({
        success: true,
        data: {
          hasToken: false,
          isValid: false,
          expiresAt: null,
          expiresInSeconds: 0,
        },
      });
    }

    const now = new Date();
    const expiresAt = new Date(tokenDoc.expiresAt);
    const isValid = expiresAt > now;
    const expiresInMs = expiresAt.getTime() - now.getTime();
    const expiresInSeconds = Math.floor(expiresInMs / 1000);

    res.status(200).json({
      success: true,
      data: {
        hasToken: true,
        isValid,
        expiresAt: tokenDoc.expiresAt,
        expiresInSeconds: expiresInSeconds > 0 ? expiresInSeconds : 0,
        tokenType: tokenDoc.tokenType,
        createdAt: tokenDoc.createdAt,
        updatedAt: tokenDoc.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error getting CJ token status', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get token status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Get CJ Configuration (API Key status only - not the actual key)
 * GET /api/v1/admin/cj-config
 */
exports.getConfig = async (req, res) => {
  try {
    // Check both environment variable and database
    const envApiKey = cjConfigModule.apiKey;
    const dbConfig = await CjConfig.getConfig();
    const hasApiKey = !!(envApiKey || dbConfig?.apiKey);
    const baseURL = cjConfigModule.baseURL;

    res.status(200).json({
      success: true,
      data: {
        hasApiKey,
        baseURL,
        apiKeyConfigured: hasApiKey,
        // Don't expose the actual API key for security
      },
    });
  } catch (error) {
    logger.error('Error getting CJ config', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get configuration',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Update CJ API Key
 * PUT /api/v1/admin/cj-config/api-key
 */
exports.updateApiKey = async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'API key is required',
      });
    }

    // Update environment variable (this will require server restart)
    // For now, we'll just update the config and try to get a new token
    // Note: In production, you'd want to update .env file and restart server
    // or use a secure configuration management system
    
    // Update the runtime config and service instance
    const trimmedApiKey = apiKey.trim();
    
    // Save to database for persistence
    await CjConfig.saveApiKey(trimmedApiKey);
    
    // Also update runtime config and service instance
    cjConfigModule.apiKey = trimmedApiKey;
    cjAuthService.setApiKey(trimmedApiKey);
    
    logger.info('CJ API key saved to database');

    // Try to get initial token with new API key
    try {
      const accessToken = await cjAuthService.getInitialAccessToken();
      
      logger.info('CJ API key updated and new token obtained', {
        apiKeySet: true,
        tokenObtained: !!accessToken,
      });

      // Get updated token status
      const tokenDoc = await CjToken.getLatestToken();
      
      res.status(200).json({
        success: true,
        message: 'API key updated successfully and token obtained',
        data: {
          hasApiKey: true,
          tokenObtained: !!accessToken,
          expiresAt: tokenDoc?.expiresAt || null,
        },
      });
    } catch (tokenError) {
      logger.error('Failed to get token with new API key', {
        error: tokenError.message,
      });

      // Still save the API key even if token fetch fails
      // User can try to refresh token manually later
      res.status(400).json({
        success: false,
        message: 'API key was saved but failed to obtain token. Please verify the API key is correct.',
        error: process.env.NODE_ENV === 'development' ? tokenError.message : 'Invalid API key or connection failed',
        data: {
          hasApiKey: true, // API key is saved
          tokenObtained: false,
        },
      });
    }
  } catch (error) {
    logger.error('Error updating CJ API key', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update API key',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Manually Refresh CJ Token
 * POST /api/v1/admin/cj-config/refresh-token
 */
exports.refreshToken = async (req, res) => {
  try {
    const tokenDoc = await CjToken.getLatestToken();
    
    if (!tokenDoc) {
      return res.status(400).json({
        success: false,
        message: 'No token found. Please configure CJ API key first.',
      });
    }

    // Try to refresh token
    const newAccessToken = await cjAuthService.refreshAccessToken(tokenDoc.refreshToken);

    if (!newAccessToken) {
      return res.status(500).json({
        success: false,
        message: 'Failed to refresh token',
      });
    }

    // Get updated token info
    const updatedTokenDoc = await CjToken.getLatestToken();

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        tokenObtained: !!newAccessToken,
        expiresAt: updatedTokenDoc.expiresAt,
        createdAt: updatedTokenDoc.createdAt,
      },
    });
  } catch (error) {
    logger.error('Error refreshing CJ token', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Test CJ Connection
 * POST /api/v1/admin/cj-config/test-connection
 */
exports.testConnection = async (req, res) => {
  try {
    // Check if API key is configured (checks database too)
    const hasApiKey = await cjAuthService.hasApiKey();
    
    if (!hasApiKey) {
      return res.status(400).json({
        success: false,
        message: 'CJ API key is not configured. Please set the API key first.',
      });
    }

    logger.info('Testing CJ API connection');

    // Try to get token
    try {
      const accessToken = await cjAuthService.getInitialAccessToken();

      if (!accessToken) {
        return res.status(500).json({
          success: false,
          message: 'Failed to obtain access token from CJ API',
          error: 'Token request returned no access token',
        });
      }

      // Try a simple API call to verify connection
      try {
        const response = await cjAuthService.makeAuthenticatedRequest(
          'POST',
          '/product/queryCategory',
          {}
        );

        res.status(200).json({
          success: true,
          message: 'Connection successful',
        });
      } catch (apiError) {
        // Token obtained but API call failed
        logger.warn('Token obtained but API call failed', {
          error: apiError.message,
        });

        res.status(200).json({
          success: true,
          message: 'Token obtained successfully',
          warning: 'Token obtained but API test call failed. This may indicate permission issues.',
        });
      }
    } catch (tokenError) {
      logger.error('Failed to get token during connection test', {
        error: tokenError.message,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to connect to CJ Dropshipping API',
        error: process.env.NODE_ENV === 'development' 
          ? tokenError.message 
          : 'Unable to authenticate with CJ API. Please verify your API key is correct.',
      });
    }
  } catch (error) {
    logger.error('Error testing CJ connection', { 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
    res.status(500).json({
      success: false,
      message: 'Connection test failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Delete/Reset CJ Token
 * DELETE /api/v1/admin/cj-config/token
 */
exports.deleteToken = async (req, res) => {
  try {
    await CjToken.deleteMany({});

    logger.info('CJ token deleted');

    res.status(200).json({
      success: true,
      message: 'Token deleted successfully',
      data: {
        deleted: true,
      },
    });
  } catch (error) {
    logger.error('Error deleting CJ token', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete token',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Get stored CJ webhook configuration (local DB)
 * GET /api/v1/admin/cj-config/webhook
 */
exports.getWebhookConfig = async (req, res) => {
  try {
    const config = await CjConfig.findOne().select('webhook').lean();
    res.status(200).json({
      success: true,
      data: config?.webhook || null,
    });
  } catch (error) {
    logger.error('Error getting CJ webhook config', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get webhook configuration',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Push webhook configuration to CJ and store locally
 * POST /api/v1/admin/cj-config/webhook
 * Body: { callbackUrl, product, stock, order, logistics }
 */
exports.setWebhookConfig = async (req, res) => {
  try {
    const { callbackUrl, product, stock, order, logistics } = req.body || {};

    if (!callbackUrl || typeof callbackUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'callbackUrl is required' });
    }
    const base = callbackUrl.trim().replace(/\/+$/, '');
    if (!base.startsWith('https://')) {
      return res.status(400).json({
        success: false,
        message: 'callbackUrl must start with https://',
      });
    }

    const flags = {
      product: !!product,
      stock: !!stock,
      order: !!order,
      logistics: !!logistics,
    };

    const cjPayload = {
      product: {
        type: flags.product ? 'ENABLE' : 'CANCEL',
        callbackUrls: [`${base}/product`],
      },
      stock: {
        type: flags.stock ? 'ENABLE' : 'CANCEL',
        callbackUrls: [`${base}/inventory`],
      },
      order: {
        type: flags.order ? 'ENABLE' : 'CANCEL',
        callbackUrls: [`${base}/order-status`],
      },
      logistics: {
        type: flags.logistics ? 'ENABLE' : 'CANCEL',
        callbackUrls: [`${base}/logistics`],
      },
    };

    // Push to CJ
    const response = await cjAuthService.makeAuthenticatedRequest('POST', '/webhook/set', cjPayload);
    const { code, result, message } = response || {};
    if (code !== 200 || result !== true) {
      return res.status(400).json({
        success: false,
        message: message || 'Failed to set webhook in CJ',
        data: response,
      });
    }

    // Store locally
    await CjConfig.saveWebhookConfig({
      callbackUrl: base,
      ...flags,
      lastPushedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'CJ webhook settings applied successfully',
      data: {
        callbackUrl: base,
        ...flags,
      },
    });
  } catch (error) {
    logger.error('Error setting CJ webhook config', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to set webhook configuration',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Get CJ warehouse list
 * GET /api/v1/admin/cj-config/warehouses
 */
exports.getWarehouses = async (req, res) => {
  try {
    const warehouses = await cjWarehouseService.getGlobalWarehouseList();
    res.status(200).json({
      success: true,
      data: warehouses,
    });
  } catch (error) {
    logger.error('Error getting CJ warehouses', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get warehouse list',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Get CJ warehouse detail
 * GET /api/v1/admin/cj-config/warehouses/:id
 */
exports.getWarehouseDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await cjWarehouseService.getWarehouseDetail(id);
    res.status(200).json({ success: true, data: detail });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch CJ warehouse detail',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};