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
    const domains = ['localhost', '127.0.0.1', 'trendyshop-three.vercel.app'];
    const vercelHost = process.env.VERCEL_URL && !process.env.VERCEL_URL.includes('.')
      ? `${process.env.VERCEL_URL}.vercel.app`
      : process.env.VERCEL_URL;
    if (vercelHost && !domains.includes(vercelHost)) domains.push(vercelHost);
    store = await this.create({
      name: 'Default Store',
      slug: 'default',
      domains,
      defaultCurrency: 'USD',
      defaultCountry: 'US',
      isActive: true,
    });
  } else {
    // Ensure Vercel domain is in store for host-based lookup (idempotent)
    const vercelHost = process.env.VERCEL_URL
      ? (process.env.VERCEL_URL.includes('.') ? process.env.VERCEL_URL : `${process.env.VERCEL_URL}.vercel.app`)
      : 'trendyshop-three.vercel.app';
    if (vercelHost && !store.domains.includes(vercelHost)) {
      store.domains.push(vercelHost);
      await store.save();
    }
  }
  return store;
};

module.exports = mongoose.model('Store', storeSchema);

