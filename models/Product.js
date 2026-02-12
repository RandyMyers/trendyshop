const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
      index: true,
    },
    cjProductId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    images: [String],
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    // Keep categoryName for backward compatibility during migration
    categoryName: {
      type: String,
    },
    categories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
    }],
    brand: {
      type: String,
    },
    sku: {
      type: String,
      index: true,
    },
    // Your selling price (custom price you set)
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    // CJ's original price (what you pay CJ)
    cjPrice: {
      type: Number,
      min: 0,
    },
    compareAtPrice: {
      type: Number,
      min: 0,
    },
    // CJ's suggested retail price (what we show to customers; internal selling price is in price)
    suggestedPrice: {
      type: Number,
      min: 0,
    },
    // Whether this product is active in your store
    isInStore: {
      type: Boolean,
      default: false,
      index: true,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    stock: {
      type: Number,
      default: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    weight: {
      type: Number,
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
    },
    variants: [
      {
        variantId: String,
        name: String,
        price: Number,              // Our store selling price (custom or suggested)
        cjPrice: Number,            // CJ's cost (variantSellPrice) - optional
        suggestedPrice: Number,     // CJ's suggested selling price (variantSugSellPrice) - optional
        stock: Number,
        sku: String,
      },
    ],
    // Cache metadata
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    cjData: {
      type: mongoose.Schema.Types.Mixed,
    },
    // New fields for enhanced import wizard
    tags: [String],
    slug: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    metaTitle: String,
    metaDescription: String,
    focusKeyword: String,
    keywords: String,
    status: {
      type: String,
      enum: ['draft', 'active', 'inactive'],
      default: 'active',
      index: true,
    },
    visibility: {
      type: String,
      enum: ['public', 'hidden'],
      default: 'public',
    },
    trackInventory: {
      type: Boolean,
      default: true,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
    },
    shippingWeight: Number,
    shippingClass: String,
    availableDate: Date,
    customImages: [String], // Images uploaded by admin
    pricingStrategy: String, // Store how price was calculated (custom, suggested, markup_percentage, markup_fixed)
    markupValue: Number, // Store markup if used
    // Multilingual SEO: manual translations per locale
    translations: [
      {
        locale: {
          type: String,
          required: true,
          trim: true,
        },
        name: String,
        description: String,
        slug: String,
        metaTitle: String,
        metaDescription: String,
        focusKeyword: String,
        keywords: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to ensure category is never an empty string
productSchema.pre('save', function(next) {
  // Convert empty string category to null
  if (this.category === '' || this.category === undefined) {
    this.category = null;
  }
  next();
});

// Pre-update hook for findOneAndUpdate operations
productSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  const update = this.getUpdate();
  if (update && (update.category === '' || update.$set?.category === '')) {
    if (update.$set) {
      update.$set.category = null;
    } else {
      update.category = null;
    }
  }
  next();
});

// Indexes
// Text index for full-text search (include tags and variant names in searchable fields)
productSchema.index({ 
  name: 'text', 
  description: 'text',
  tags: 'text',
  'variants.name': 'text',
  brand: 'text',
  sku: 'text'
}, {
  weights: {
    name: 10,
    tags: 5,
    brand: 3,
    'variants.name': 3,
    description: 2,
    sku: 1
  }
});
productSchema.index({ category: 1, isInStore: 1, status: 1 });
productSchema.index({ categories: 1 });
productSchema.index({ categoryName: 1 }); // For backward compatibility
productSchema.index({ isAvailable: 1 });
productSchema.index({ status: 1, visibility: 1, isInStore: 1 });
productSchema.index({ price: 1 });
productSchema.index({ slug: 1 });
productSchema.index({ 'translations.locale': 1 });
productSchema.index({ 'translations.slug': 1 });
productSchema.index({ isInStore: 1, status: 1, price: 1 });
productSchema.index({ compareAtPrice: 1 }); // For sale items filtering

module.exports = mongoose.model('Product', productSchema);

