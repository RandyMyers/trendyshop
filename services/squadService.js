const axios = require('axios');
const PaymentMethod = require('../models/PaymentMethod');
const flutterwaveService = require('./flutterwaveService');
const { logger } = require('../utils/logger');

class SquadService {
  constructor() {
    this.baseURL = process.env.SQUAD_BASE_URL || 'https://sandbox-api.squadco.com';
  }

  /**
   * Get active Squad payment method
   */
  async getPaymentMethod() {
    const paymentMethod = await PaymentMethod.findOne({
      type: 'squad',
      isActive: true,
    }).select('+config.secretKey');

    if (!paymentMethod) {
      throw new Error('Squad payment method not configured or inactive');
    }

    return paymentMethod;
  }

  /**
   * Initialize a payment transaction
   */
  async initializePayment(paymentData) {
    try {
      const paymentMethod = await this.getPaymentMethod();
      const secretKey = flutterwaveService.decryptSecretKey(paymentMethod.config.secretKey);

      // Amount in lowest currency unit (kobo for NGN, cents for USD)
      const amountInCents = Math.round(paymentData.amount * 100);

      const payload = {
        email: paymentData.customer.email,
        amount: amountInCents,
        currency: paymentData.currency || paymentMethod.config.currency || 'NGN',
        initiate_type: 'inline',
        transaction_ref: `SQ-${Date.now()}-${paymentData.orderNumber}`,
        callback_url: paymentMethod.config.callbackUrl || `${process.env.CLIENT_URL || 'http://localhost:3000'}/checkout`,
        payment_channels: paymentMethod.config.paymentChannels || ['card', 'bank', 'ussd', 'transfer'],
      };

      logger.info('Initializing Squad payment', { transaction_ref: payload.transaction_ref, orderNumber: paymentData.orderNumber });

      const response = await axios.post(
        `${this.baseURL}/payment/Initiate`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data && response.data.status === 200 && response.data.data) {
        return {
          checkout_url: response.data.data.checkout_url,
          transaction_ref: payload.transaction_ref,
        };
      }

      throw new Error(response.data?.message || 'Failed to initialize Squad payment');
    } catch (error) {
      logger.error('Error initializing Squad payment', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify a payment transaction
   */
  async verifyPayment(transactionRef) {
    try {
      const paymentMethod = await this.getPaymentMethod();
      const secretKey = flutterwaveService.decryptSecretKey(paymentMethod.config.secretKey);

      const response = await axios.get(
        `${this.baseURL}/transaction/verify/${transactionRef}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Squad payment verified', { transactionRef, status: response.data?.data?.transaction_status });

      return {
        status: response.data?.data?.transaction_status,
        amount: response.data?.data?.transaction_amount,
        currency: response.data?.data?.currency,
        data: response.data?.data,
      };
    } catch (error) {
      logger.error('Error verifying Squad payment', { error: error.message, transactionRef });
      throw error;
    }
  }
}

module.exports = new SquadService();
