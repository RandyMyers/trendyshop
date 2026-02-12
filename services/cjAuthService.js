const axios = require('axios');
const CjToken = require('../models/CjToken');
const CjConfig = require('../models/CjConfig');
const { logger } = require('../utils/logger');
const cjConfig = require('../config/cj-dropshipping');

class CjAuthService {
  constructor() {
    this.baseURL = cjConfig.baseURL;
    this.apiKey = cjConfig.apiKey;
    this._dbConfigLoaded = false; // Track if we've tried loading from DB
  }

  /**
   * Load API key from database if not in environment
   */
  async loadApiKeyFromDatabase() {
    // If already loaded or API key exists, skip
    if (this._dbConfigLoaded || this.apiKey) {
      return;
    }

    try {
      // Try to load from database
      const dbConfig = await CjConfig.getConfig();
      if (dbConfig && dbConfig.apiKey) {
        this.apiKey = dbConfig.apiKey;
        cjConfig.apiKey = dbConfig.apiKey;
        this._dbConfigLoaded = true;
        logger.info('CJ API key loaded from database');
      }
    } catch (error) {
      // Silently fail - database might not be ready yet
      logger.debug('Could not load API key from database', { error: error.message });
    } finally {
      this._dbConfigLoaded = true; // Mark as attempted even if failed
    }
  }

  /**
   * Update API key dynamically
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    // Also update the config module
    cjConfig.apiKey = apiKey;
  }

  /**
   * Get API key from database or environment
   */
  async getApiKey() {
    // Try in-memory first
    if (this.apiKey) {
      return this.apiKey;
    }

    // Try environment variable
    if (cjConfig.apiKey) {
      this.apiKey = cjConfig.apiKey;
      return this.apiKey;
    }

    // Try database
    await this.loadApiKeyFromDatabase();
    return this.apiKey;
  }

  /**
   * Check if CJ API key is configured
   * Checks both in-memory and database
   */
  async hasApiKey() {
    // Check in-memory first
    if (this.apiKey || cjConfig.apiKey) {
      return true;
    }

    // If not in memory, try to load from database
    try {
      await this.loadApiKeyFromDatabase();
      return !!(this.apiKey || cjConfig.apiKey);
    } catch (error) {
      logger.debug('Error checking API key in database', { error: error.message });
      return false;
    }
  }

  /**
   * Get valid access token (from cache or refresh)
   */
  async getAccessToken() {
    try {
      // Ensure we have an API key (check database if needed)
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        const error = new Error('CJ API key is not configured');
        logger.warn('Cannot get CJ access token: API key not configured');
        throw error;
      }

      // Get latest token from database
      const tokenDoc = await CjToken.getLatestToken();

      // Check if token exists and is still valid
      if (tokenDoc && new Date(tokenDoc.expiresAt) > new Date()) {
        // Token is still valid, return it
        logger.debug('Using cached CJ access token');
        return tokenDoc.accessToken;
      }

      // Token expired or doesn't exist, get new one
      return await this.refreshAccessToken(tokenDoc?.refreshToken);
    } catch (error) {
      // Only log as error if it's not about missing API key
      if (error.message.includes('API key is not configured')) {
        logger.warn('Cannot get CJ access token: API key not configured');
      } else {
        logger.error('Error getting CJ access token', { error: error.message });
      }
      throw error;
    }
  }

  /**
   * Get initial access token using API key
   */
  async getInitialAccessToken() {
    try {
      // Ensure we have an API key (check database if needed)
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        throw new Error('CJ API key is not configured');
      }

      const response = await axios.post(
        `${this.baseURL}/authentication/getAccessToken`,
        {
          apiKey: apiKey,
        }
      );

      const { code, result, data, message } = response.data;

      if (code !== 200 || !result) {
        const errorMsg = message || data?.message || 'Failed to get access token from CJ API';
        logger.error('CJ API returned error', {
          code,
          result,
          message: errorMsg,
          responseData: response.data,
        });
        throw new Error(errorMsg);
      }

      if (!data || !data.accessToken) {
        throw new Error('CJ API did not return an access token');
      }

      // Save token to database
      await CjToken.saveToken({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
        expires_in: this.calculateExpiresIn(data.accessTokenExpiryDate),
        token_type: 'Bearer',
      });

      logger.info('CJ access token obtained and saved');

      return data.accessToken;
    } catch (error) {
      logger.error('Error getting initial CJ access token', {
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken = null) {
    try {
      // Ensure we have an API key (check database if needed)
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        const error = new Error('CJ API key is not configured');
        logger.warn('Cannot refresh CJ access token: API key not configured');
        throw error;
      }

      // If no refresh token provided, get initial token
      if (!refreshToken) {
        return await this.getInitialAccessToken();
      }

      // Check if refresh token is still valid
      const tokenDoc = await CjToken.getLatestToken();
      if (tokenDoc && tokenDoc.refreshToken !== refreshToken) {
        // Refresh token doesn't match, get new initial token
        return await this.getInitialAccessToken();
      }

      // Try to refresh using refresh token endpoint
      // Note: CJ API may use the same endpoint with refreshToken
      // This needs to be verified with actual API docs
      const response = await axios.post(
        `${this.baseURL}/authentication/getAccessToken`,
        {
          refreshToken: refreshToken,
        }
      );

      const { code, result, data, message } = response.data;

      if (code !== 200 || !result) {
        // If refresh fails, get new initial token
        logger.warn('CJ refresh token failed, getting new initial token');
        return await this.getInitialAccessToken();
      }

      // Save new token
      await CjToken.saveToken({
        access_token: data.accessToken,
        refresh_token: data.refreshToken || refreshToken,
        expires_in: this.calculateExpiresIn(data.accessTokenExpiryDate),
        token_type: 'Bearer',
      });

      logger.info('CJ access token refreshed');

      return data.accessToken;
    } catch (error) {
      // Only log as error if it's not about missing API key
      if (error.message.includes('API key is not configured')) {
        logger.warn('Cannot refresh CJ access token: API key not configured');
        throw error; // Don't try to get initial token if API key is missing
      }

      logger.error('Error refreshing CJ access token', {
        error: error.message,
        response: error.response?.data,
      });

      // If refresh fails, try to get new initial token
      try {
        return await this.getInitialAccessToken();
      } catch (initError) {
        // If getting initial token also fails, throw the original error
        throw error;
      }
    }
  }

  /**
   * Calculate expires_in from expiry date string
   */
  calculateExpiresIn(expiryDateString) {
    const expiryDate = new Date(expiryDateString);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    return Math.floor(diffMs / 1000); // Convert to seconds
  }

  /**
   * Make authenticated request to CJ API
   */
  async makeAuthenticatedRequest(method, endpoint, data = null) {
    try {
      const accessToken = await this.getAccessToken();

      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'CJ-Access-Token': accessToken,
        },
      };

      // Only add Content-Type for POST/PUT/PATCH requests
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        config.headers['Content-Type'] = 'application/json';
        if (data) {
          config.data = data;
        }
      }

      const response = await axios(config);

      // Check response format
      if (response.data && typeof response.data === 'object') {
        const { code, result, message } = response.data;

        // If token expired, refresh and retry once
        if (code === 401 || code === 403) {
          logger.warn('CJ API returned unauthorized, refreshing token and retrying');
          await this.refreshAccessToken();
          const newAccessToken = await this.getAccessToken();
          config.headers['CJ-Access-Token'] = newAccessToken;
          const retryResponse = await axios(config);
          return retryResponse.data;
        }

        // If not success, throw error
        if (code !== 200 && code !== undefined) {
          throw new Error(message || `CJ API error: ${code}`);
        }
      }

      return response.data;
    } catch (error) {
      logger.error('Error making authenticated CJ API request', {
        method,
        endpoint,
        error: error.message,
        response: error.response?.data,
      });

      // If it's an auth error, try refreshing token once
      if (error.response?.status === 401 || error.response?.status === 403) {
        try {
          await this.refreshAccessToken();
          const accessToken = await this.getAccessToken();
          const retryConfig = {
            method,
            url: `${this.baseURL}${endpoint}`,
            headers: {
              'CJ-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          };
          if (data) retryConfig.data = data;
          const retryResponse = await axios(retryConfig);
          return retryResponse.data;
        } catch (retryError) {
          throw retryError;
        }
      }

      throw error;
    }
  }
}

module.exports = new CjAuthService();

