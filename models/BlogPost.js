const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      index: true,
    },
    content: {
      type: String,
      default: '',
    },
    excerpt: {
      type: String,
      trim: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    featuredImage: {
      type: String,
    },
    tags: [String],
    metaTitle: String,
    metaDescription: String,
    focusKeyword: String,
    keywords: String,
    // Multilingual SEO: manual translations per locale
    translations: [
      {
        locale: {
          type: String,
          required: true,
          trim: true,
        },
        title: String,
        slug: String,
        content: String,
        excerpt: String,
        metaTitle: String,
        metaDescription: String,
        focusKeyword: String,
        keywords: String,
      },
    ],
  },
  { timestamps: true }
);

blogPostSchema.index({ storeId: 1, slug: 1 });
blogPostSchema.index({ storeId: 1, status: 1, publishedAt: -1 });
blogPostSchema.index({ 'translations.locale': 1 });
blogPostSchema.index({ storeId: 1, 'translations.slug': 1 });

module.exports = mongoose.model('BlogPost', blogPostSchema);
