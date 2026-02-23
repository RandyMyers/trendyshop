const BlogPost = require('../models/BlogPost');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

/**
 * Helper: collect available locales from translations array
 */
function getAvailableLocalesFromTranslations(entity) {
  if (!entity || !Array.isArray(entity.translations)) return [];
  const locales = new Set();
  for (const t of entity.translations) {
    if (t && t.locale) locales.add(t.locale);
  }
  return Array.from(locales);
}

/**
 * Helper: apply translation for a given locale to a blog post
 */
function applyBlogTranslation(post, locale) {
  if (!post) return post;

  const data = { ...post };

  if (locale && Array.isArray(data.translations) && data.translations.length > 0) {
    const t = data.translations.find(tr => tr && tr.locale === locale);
    if (t) {
      if (t.title) data.title = t.title;
      if (t.slug) data.slug = t.slug;
      if (t.content) data.content = t.content;
      if (t.excerpt) data.excerpt = t.excerpt;
      if (t.metaTitle) data.metaTitle = t.metaTitle;
      if (t.metaDescription) data.metaDescription = t.metaDescription;
      if (t.focusKeyword) data.focusKeyword = t.focusKeyword;
      if (t.keywords) data.keywords = t.keywords;
    }
  }

  data.availableLocales = getAvailableLocalesFromTranslations(data);
  return data;
}

/**
 * Admin: List blog posts
 */
exports.getAdminPosts = async (req, res) => {
  try {
    const filter = getStoreFilter(req.storeId);
    const posts = await BlogPost.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, data: posts });
  } catch (error) {
    logger.error('Error getting blog posts', { error: error.message });
    res.status(500).json({ success: false, message: error?.message || 'Failed to get blog posts', error: error?.message });
  }
};

/**
 * Admin: Get single blog post by ID
 */
exports.getAdminPostById = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = getStoreFilter(req.storeId);
    const post = await BlogPost.findOne({ _id: id, ...filter }).lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.status(200).json({ success: true, data: post });
  } catch (error) {
    logger.error('Error getting blog post', { error: error.message, postId: req.params.id });
    res.status(500).json({ success: false, message: error?.message || 'Failed to get blog post', error: error?.message });
  }
};

/**
 * Admin: Create blog post
 */
exports.createPost = async (req, res) => {
  try {
    const { title, slug, content, excerpt, status, featuredImage, tags, metaTitle, metaDescription, focusKeyword, keywords } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
    const post = await BlogPost.create({
      ...(req.storeId && { storeId: req.storeId }),
      title,
      slug: slug || title.toLowerCase().replace(/\s+/g, '-'),
      content: content || '',
      excerpt: excerpt || '',
      authorId: req.user?.id,
      status: status || 'draft',
      publishedAt: status === 'published' ? new Date() : null,
      featuredImage: featuredImage || undefined,
      tags: Array.isArray(tags) ? tags : tags ? String(tags).split(',').map((t) => t.trim()).filter(Boolean) : [],
      metaTitle: metaTitle || undefined,
      metaDescription: metaDescription || undefined,
      focusKeyword: focusKeyword || undefined,
      keywords: keywords || undefined,
    });
    res.status(201).json({ success: true, data: post });
  } catch (error) {
    logger.error('Error creating blog post', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to create blog post' });
  }
};

/**
 * Admin: Update blog post (default locale fields and SEO)
 */
exports.updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      slug,
      content,
      excerpt,
      status,
      featuredImage,
      tags,
      metaTitle,
      metaDescription,
      focusKeyword,
      keywords,
    } = req.body || {};

    const filter = getStoreFilter(req.storeId);
    const post = await BlogPost.findOne({ _id: id, ...filter });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (title !== undefined) post.title = title;
    if (slug !== undefined) post.slug = slug;
    if (content !== undefined) post.content = content;
    if (excerpt !== undefined) post.excerpt = excerpt;
    if (featuredImage !== undefined) post.featuredImage = featuredImage;
    if (metaTitle !== undefined) post.metaTitle = metaTitle;
    if (metaDescription !== undefined) post.metaDescription = metaDescription;
    if (focusKeyword !== undefined) post.focusKeyword = focusKeyword;
    if (keywords !== undefined) post.keywords = keywords;
    if (tags !== undefined) {
      post.tags = Array.isArray(tags)
        ? tags
        : tags
        ? String(tags).split(',').map((t) => t.trim()).filter(Boolean)
        : [];
    }

    if (status !== undefined) {
      post.status = status;
      if (status === 'published' && !post.publishedAt) {
        post.publishedAt = new Date();
      }
      if (status === 'draft') {
        post.publishedAt = null;
      }
    }

    await post.save();

    res.status(200).json({ success: true, data: post });
  } catch (error) {
    logger.error('Error updating blog post', { error: error.message, postId: req.params.id });
    res.status(500).json({ success: false, message: error?.message || 'Failed to update blog post', error: error?.message });
  }
};

/**
 * Admin: Delete blog post
 */
exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = getStoreFilter(req.storeId);

    const deleted = await BlogPost.findOneAndDelete({ _id: id, ...filter });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.status(200).json({ success: true, message: 'Post deleted' });
  } catch (error) {
    logger.error('Error deleting blog post', { error: error.message, postId: req.params.id });
    res.status(500).json({ success: false, message: 'Failed to delete blog post' });
  }
};

/**
 * Admin: Upsert translation for a blog post
 * PUT /admin/blog/:id/translations/:locale
 */
exports.updatePostTranslation = async (req, res) => {
  try {
    const { id, locale } = req.params;
    const { title, slug, content, excerpt, metaTitle, metaDescription, focusKeyword, keywords } = req.body || {};

    if (!locale) {
      return res.status(400).json({
        success: false,
        message: 'Locale is required',
      });
    }

    const filter = getStoreFilter(req.storeId);
    const post = await BlogPost.findOne({ _id: id, ...filter });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    // Enforce uniqueness of slug per locale within the same store
    if (slug) {
      const slugConflict = await BlogPost.findOne({
        _id: { $ne: post._id },
        storeId: post.storeId || null,
        translations: { $elemMatch: { locale, slug } },
      }).lean();

      if (slugConflict) {
        return res.status(400).json({
          success: false,
          message: 'A blog post with this slug already exists for the selected locale',
        });
      }
    }

    if (!Array.isArray(post.translations)) {
      post.translations = [];
    }

    const existing = post.translations.find((t) => t.locale === locale);

    if (existing) {
      if (title !== undefined) existing.title = title;
      if (slug !== undefined) existing.slug = slug;
      if (content !== undefined) existing.content = content;
      if (excerpt !== undefined) existing.excerpt = excerpt;
      if (metaTitle !== undefined) existing.metaTitle = metaTitle;
      if (metaDescription !== undefined) existing.metaDescription = metaDescription;
      if (focusKeyword !== undefined) existing.focusKeyword = focusKeyword;
      if (keywords !== undefined) existing.keywords = keywords;
    } else {
      post.translations.push({
        locale,
        ...(title !== undefined && { title }),
        ...(slug !== undefined && { slug }),
        ...(content !== undefined && { content }),
        ...(excerpt !== undefined && { excerpt }),
        ...(metaTitle !== undefined && { metaTitle }),
        ...(metaDescription !== undefined && { metaDescription }),
        ...(focusKeyword !== undefined && { focusKeyword }),
        ...(keywords !== undefined && { keywords }),
      });
    }

    await post.save();

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    logger.error('Error updating blog post translation', { error: error.message, postId: req.params.id });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update blog post translation',
      error: error?.message,
    });
  }
};

/**
 * Public: List published posts
 */
exports.getPublicPosts = async (req, res) => {
  try {
    const { locale } = req.query;
    const filter = getStoreFilter(req.storeId);
    const posts = await BlogPost.find({
      ...filter,
      status: 'published',
    })
      .sort({ publishedAt: -1 })
      .select('title slug excerpt featuredImage publishedAt metaTitle metaDescription translations')
      .lean();

    const localizedPosts = posts.map((post) => applyBlogTranslation(post, locale));

    res.status(200).json({ success: true, data: localizedPosts });
  } catch (error) {
    logger.error('Error getting blog posts', { error: error.message });
    res.status(500).json({ success: false, message: error?.message || 'Failed to get blog posts', error: error?.message });
  }
};

/**
 * Public: Get single published post by slug
 */
exports.getPublicPostBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const { locale } = req.query;
    const filter = getStoreFilter(req.storeId);

    const baseQuery = {
      ...filter,
      status: 'published',
    };

    let post;

    if (locale) {
      // Try matching by default slug, or by translation slug for the requested locale
      post = await BlogPost.findOne({
        ...baseQuery,
        $or: [
          { slug },
          { translations: { $elemMatch: { locale, slug } } },
        ],
      })
        .select('title slug content excerpt featuredImage publishedAt tags metaTitle metaDescription translations')
        .lean();
    } else {
      post = await BlogPost.findOne({
        ...baseQuery,
        slug,
      })
        .select('title slug content excerpt featuredImage publishedAt tags metaTitle metaDescription translations')
        .lean();
    }

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const localizedPost = applyBlogTranslation(post, locale);

    res.status(200).json({ success: true, data: localizedPost });
  } catch (error) {
    logger.error('Error getting blog post', { error: error.message });
    res.status(500).json({ success: false, message: error?.message || 'Failed to get blog post', error: error?.message });
  }
};
