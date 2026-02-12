const mongoose = require('mongoose');

const cjConfigSchema = new mongoose.Schema(
  {
    apiKey: {
      type: String,
      required: true,
      select: false, // Don't include in queries by default for security
    },
    webhook: {
      // Base callback URL CJ should call (HTTPS)
      callbackUrl: { type: String, default: '' },
      // Topic toggles
      product: { type: Boolean, default: false },
      stock: { type: Boolean, default: false },
      order: { type: Boolean, default: false },
      logistics: { type: Boolean, default: false },
      // Last time we pushed settings to CJ
      lastPushedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one config document exists
cjConfigSchema.statics.getConfig = async function () {
  return await this.findOne().select('+apiKey'); // Include apiKey when explicitly requested
};

cjConfigSchema.statics.saveApiKey = async function (apiKey) {
  // Upsert single config doc without wiping other fields (e.g. webhook settings)
  return await this.findOneAndUpdate({}, { apiKey }, { upsert: true, new: true, setDefaultsOnInsert: true });
};

cjConfigSchema.statics.hasApiKey = async function () {
  const config = await this.findOne();
  return !!config;
};

cjConfigSchema.statics.getWebhookConfig = async function () {
  const config = await this.findOne().select('webhook');
  return config?.webhook || null;
};

cjConfigSchema.statics.saveWebhookConfig = async function (webhook) {
  return await this.findOneAndUpdate(
    {},
    { webhook },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('CjConfig', cjConfigSchema);




