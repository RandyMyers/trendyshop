const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    image: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    metaTitle: {
      type: String,
      trim: true,
    },
    metaDescription: {
      type: String,
      trim: true,
    },
    focusKeyword: { type: String, trim: true },
    keywords: { type: String, trim: true },
    // Niche/type for multi-store: 'clothing' | 'electronics' | 'kitchen' | null (null = show for all)
    niche: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: null,
    },
    // Multilingual SEO: manual translations per locale
    translations: [
      {
        locale: {
          type: String,
          required: true,
          trim: true,
        },
        name: String,
        slug: String,
        description: String,
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

// Index for efficient querying
categorySchema.index({ parentCategory: 1, sortOrder: 1 });
categorySchema.index({ isActive: 1, sortOrder: 1 });
categorySchema.index({ 'translations.locale': 1 });
categorySchema.index({ 'translations.slug': 1 });

// Virtual for getting child categories
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parentCategory',
});

// Static method to generate slug from name
categorySchema.statics.generateSlug = function (name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// Pre-save hook to auto-generate slug if not provided
categorySchema.pre('save', async function (next) {
  if (!this.slug && this.name) {
    let slug = this.constructor.generateSlug(this.name);
    let slugExists = true;
    let counter = 1;
    
    while (slugExists) {
      const existingCategory = await this.constructor.findOne({ slug });
      if (!existingCategory || existingCategory._id.toString() === this._id.toString()) {
        slugExists = false;
      } else {
        slug = `${this.constructor.generateSlug(this.name)}-${counter}`;
        counter++;
      }
    }
    
    this.slug = slug;
  }
  next();
});

// Method to get category tree
categorySchema.statics.getCategoryTree = async function (parentId = null) {
  const categories = await this.find({
    parentCategory: parentId,
    isActive: true,
  })
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  for (const category of categories) {
    category.children = await this.getCategoryTree(category._id);
  }

  return categories;
};

module.exports = mongoose.model('Category', categorySchema);




