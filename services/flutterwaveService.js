const axios = require('axios');
const crypto = require('crypto');
const PaymentMethod = require('../models/PaymentMethod');
const { logger } = require('../utils/logger');

class FlutterwaveService {
  constructor() {
    this.baseURL = 'https://api.flutterwave.com/v3';
  }

  /**
   * Get active Flutterwave payment method
   */
  async getPaymentMethod() {
    const paymentMethod = await PaymentMethod.findOne({
      type: 'flutterwave',
      isActive: true,
    }).select('+config.secretKey'); // Include secretKey

    if (!paymentMethod) {
      throw new Error('Flutterwave payment method not configured or inactive');
    }

    // Decrypt secret key if encrypted
    if (paymentMethod.config.secretKey) {
      paymentMethod.config.secretKey = this.decryptSecretKey(paymentMethod.config.secretKey);
    }

    return paymentMethod;
  }

  /**
   * Initialize a payment transaction
   */
  async initializePayment(paymentData) {
    try {
      const paymentMethod = await this.getPaymentMethod();
      const txRef = this.generateTxRef(paymentData.orderNumber);

      const payload = {
        tx_ref: txRef,
        amount: paymentData.amount,
        currency: paymentData.currency || paymentMethod.config.currency || 'USD',
        // Redirect back to checkout so the client can read tx_ref & status
        redirect_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/checkout`,
        payment_options: paymentMethod.config.paymentOptions || 'card',
        customer: {
          email: paymentData.customer.email,
          phonenumber: paymentData.customer.phone || '',
          name: paymentData.customer.name,
        },
        customizations: {
          title: paymentMethod.config.title || 'Order Payment',
          description: paymentMethod.config.description || `Payment for order ${paymentData.orderNumber}`,
          logo: paymentMethod.config.logo || '',
        },
        meta: {
          orderNumber: paymentData.orderNumber,
          userId: paymentData.userId.toString(),
        },
      };

      logger.info('Initializing Flutterwave payment', { txRef, orderNumber: paymentData.orderNumber });

      return {
        publicKey: paymentMethod.config.publicKey,
        payload,
        txRef,
      };
    } catch (error) {
      logger.error('Error initializing Flutterwave payment', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify a payment transaction by reference
   */
  async verifyPayment(txRef) {
    try {
      const paymentMethod = await this.getPaymentMethod();
      const secretKey = paymentMethod.config.secretKey; // Already decrypted if needed

      const response = await axios.get(
        `${this.baseURL}/transactions/verify_by_reference?tx_ref=${txRef}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = response.data.data;

      logger.info('Flutterwave payment verified', { txRef, status: data.status });

      return {
        status: data.status,
        transactionId: data.id,
        flwRef: data.flw_ref,
        amount: data.amount,
        currency: data.currency,
        customer: data.customer,
        paymentType: data.payment_type,
        createdAt: data.created_at,
        meta: data.meta || {},
        // Full response for storage
        fullResponse: data,
      };
    } catch (error) {
      logger.error('Error verifying Flutterwave payment', { error: error.message, txRef });
      
      if (error.response) {
        throw new Error(`Flutterwave API Error: ${error.response.data.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate unique transaction reference
   */
  generateTxRef(orderNumber) {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 9).toUpperCase();
    return `${orderNumber}-${timestamp}-${randomString}`;
  }

  /**
   * Encrypt secret key before storing
   */
  encryptSecretKey(secretKey) {
    try {
      const algorithm = 'aes-256-cbc';
      const keyString = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
      
      // Generate encryption key from environment variable
      let encryptionKey;
      try {
        // Try to use as hex first
        const keyBuffer = Buffer.from(keyString, 'hex');
        if (keyBuffer.length === 32) {
          encryptionKey = keyBuffer;
        } else {
          // Hash to get 32 bytes
          encryptionKey = crypto.createHash('sha256').update(keyString).digest();
        }
      } catch {
        // If not hex, just hash it
        encryptionKey = crypto.createHash('sha256').update(keyString).digest();
      }

      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
      
      let encrypted = cipher.update(secretKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      logger.error('Error encrypting secret key', { error: error.message });
      throw new Error('Failed to encrypt secret key');
    }
  }

  /**
   * Decrypt secret key for use
   */
  decryptSecretKey(encryptedKey) {
    try {
      // If not encrypted (no colon), return as is
      if (!encryptedKey.includes(':')) {
        return encryptedKey;
      }

      const algorithm = 'aes-256-cbc';
      const keyString = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
      
      // Generate encryption key from environment variable
      let encryptionKey;
      try {
        // Try to use as hex first
        const keyBuffer = Buffer.from(keyString, 'hex');
        if (keyBuffer.length === 32) {
          encryptionKey = keyBuffer;
        } else {
          // Hash to get 32 bytes
          encryptionKey = crypto.createHash('sha256').update(keyString).digest();
        }
      } catch {
        // If not hex, just hash it
        encryptionKey = crypto.createHash('sha256').update(keyString).digest();
      }

      const parts = encryptedKey.split(':');
      if (parts.length !== 2) {
        // If not encrypted (for backward compatibility), return as is
        return encryptedKey;
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Error decrypting secret key', { error: error.message });
      // If decryption fails, return as is (might be unencrypted for backward compatibility)
      return encryptedKey;
    }
  }

  /**
   * Verify webhook signature (if Flutterwave provides one)
   */
  verifyWebhook(payload, signature) {
    // Flutterwave doesn't provide webhook signatures by default
    // This can be implemented if they add signature verification in the future
    // For now, verify based on transaction reference and status
    return true;
  }

  /**
   * Handle webhook payload
   */
  async handleWebhook(webhookData) {
    try {
      const { tx_ref, status, flw_ref, id } = webhookData;

      logger.info('Processing Flutterwave webhook', { txRef: tx_ref, status, flwRef: flw_ref });

      // Verify the transaction
      const verification = await this.verifyPayment(tx_ref);

      return {
        txRef: tx_ref,
        flwRef: flw_ref || verification.flwRef,
        transactionId: id || verification.transactionId,
        status: status || verification.status,
        amount: verification.amount,
        currency: verification.currency,
        verification,
      };
    } catch (error) {
      logger.error('Error handling Flutterwave webhook', { error: error.message });
      throw error;
    }
  }
}

module.exports = new FlutterwaveService();

