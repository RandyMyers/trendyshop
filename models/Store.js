const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    domains: [
      {
        type: String,
        trim: true,
      },
    ],
    defaultCurrency: {
      type: String,
      default: 'USD',
    },
    defaultCountry: {
      type: String,
      default: 'US',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Store niche: 'clothing' | 'electronics' | 'kitchen' | etc. Categories with matching niche (or null) are shown.
    niche: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    metaVerification: {
      google: { type: String, trim: true, default: '' },
      bing: { type: String, trim: true, default: '' },
      yandex: { type: String, trim: true, default: '' },
      pinterest: { type: String, trim: true, default: '' },
      facebook: { type: String, trim: true, default: '' },
      custom: [
        {
          name: { type: String, required: true },
          content: { type: String, required: true },
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

storeSchema.index({ slug: 1 }, { unique: true });
storeSchema.index({ domains: 1, isActive: 1 });

storeSchema.statics.getDefaultStore = async function () {
  let store = await this.findOne({ slug: 'default' });
  if (!store) {
    store = await this.create({
      name: 'Default Store',
      slug: 'default',
      domains: [],
      defaultCurrency: 'USD',
      defaultCountry: 'US',
      isActive: true,
    });
  }
  return store;
};

module.exports = mongoose.model('Store', storeSchema);

