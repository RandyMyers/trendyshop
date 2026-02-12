/**
 * Seed Flutterwave and SEPA (Bank Transfer) payment methods for test orders.
 * Run: node scripts/seedPaymentMethods.js
 * Or: npm run seed:payment-methods
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const PaymentMethod = require('../models/PaymentMethod');
const flutterwaveService = require('../services/flutterwaveService');

dotenv.config();

const FLUTTERWAVE = {
  name: 'Flutterwave',
  type: 'flutterwave',
  description: 'Primary payment gateway for card payments. Supports NGN, USD, EUR, GBP…',
  isActive: true,
  isDefault: true,
  config: {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || 'FLWPUBK_TEST-0cfc4338858cd764a92d3749fa39fde4-X',
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-c80cd8fb027f63d8315c6a20c3b0ac1e-X',
    webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET || 'FLWSECK_TEST4158836a5221',
    title: 'Order Payment',
    description: 'Complete your order payment',
    logo: '/logos/flutterwave.png',
    currency: 'USD',
    paymentOptions: 'card,banktransfer,ussd,account',
  },
};

const SEPA_BANK_TRANSFER = {
  name: 'Bank Transfer',
  type: 'bank_transfer',
  description: 'SEPA bank transfer for EUR. Use reference when paying.',
  isActive: true,
  isDefault: false,
  config: {
    bankTransfers: [
      {
        currency: 'EUR',
        label: 'SEPA (EUR)',
        bankName: 'Test Bank (Demo)',
        accountName: 'Shop Demo Account',
        iban: 'DE89370400440532013000',
        bic: 'COBADEFFXXX',
        swiftCode: 'COBADEFFXXX',
        referenceFormat: 'ORDR-{orderNumber}',
        instructions: 'Please include your order number (ORDR-XXXX) as the payment reference. Orders are processed after payment is received.',
      },
      {
        currency: 'GBP',
        label: 'UK Bank Transfer',
        bankName: 'Test Bank UK (Demo)',
        accountName: 'Shop Demo Account',
        accountNumber: '12345678',
        sortCode: '12-34-56',
        referenceFormat: 'ORDR-{orderNumber}',
        instructions: 'Please include your order number (ORDR-XXXX) as the payment reference.',
      },
    ],
  },
};

const seedPaymentMethods = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // 1. Flutterwave
    let fw = await PaymentMethod.findOne({ type: 'flutterwave' });
    if (fw) {
      fw.config = { ...fw.config, ...FLUTTERWAVE.config };
      fw.isActive = FLUTTERWAVE.isActive;
      fw.isDefault = FLUTTERWAVE.isDefault;
      // Encrypt secret key if not already encrypted
      if (fw.config.secretKey && !String(fw.config.secretKey).includes(':')) {
        fw.config.secretKey = flutterwaveService.encryptSecretKey(fw.config.secretKey);
      }
      await fw.save();
      console.log('✅ Flutterwave payment method updated');
    } else {
      const secretKey = FLUTTERWAVE.config.secretKey;
      if (secretKey && !String(secretKey).includes(':')) {
        FLUTTERWAVE.config.secretKey = flutterwaveService.encryptSecretKey(secretKey);
      }
      fw = await PaymentMethod.create(FLUTTERWAVE);
      console.log('✅ Flutterwave payment method created');
    }
    console.log('   - Public Key:', FLUTTERWAVE.config.publicKey?.substring(0, 20) + '...');
    console.log('   - Active:', fw.isActive, '| Default:', fw.isDefault);

    // 2. SEPA / Bank Transfer
    let bankTransfer = await PaymentMethod.findOne({ type: 'bank_transfer' });
    if (bankTransfer) {
      bankTransfer.config = SEPA_BANK_TRANSFER.config;
      bankTransfer.isActive = SEPA_BANK_TRANSFER.isActive;
      await bankTransfer.save();
      console.log('✅ Bank Transfer (SEPA) payment method updated');
    } else {
      bankTransfer = await PaymentMethod.create(SEPA_BANK_TRANSFER);
      console.log('✅ Bank Transfer (SEPA) payment method created');
    }
    console.log('   - SEPA EUR IBAN:', SEPA_BANK_TRANSFER.config.bankTransfers[0].iban);
    console.log('   - SEPA BIC:', SEPA_BANK_TRANSFER.config.bankTransfers[0].bic);

    console.log('\nYou can now place test orders using Flutterwave (card) or Bank Transfer (SEPA).');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding payment methods:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedPaymentMethods();
