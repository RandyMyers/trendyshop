const Category = require('../models/Category');
const Product = require('../models/Product');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');
const cloudinary = require('cloudinary').v2;

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
 * Helper: apply translation for a given locale to a category-like object
 */
function applyCategoryTranslation(category, locale) {
  if (!category) return category;

  const data = { ...category };

  if (locale && Array.isArray(data.translations) && data.translations.length > 0) {
    const t = data.translations.find(tr => tr && tr.locale === locale);
    if (t) {
      if (t.name) data.name = t.name;
      if (t.slug) data.slug = t.slug;
      if (t.description) data.description = t.description;
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
 * Get all categories (admin) - categories are global, no store filter
 */
exports.getCategories = async (req, res) => {
  try {
    const { tree = false, activeOnly = true } = req.query;

    let categories;
    const baseFilter = activeOnly === 'true' ? { isActive: true } : {};

    if (tree === 'true') {
      const parentId = req.query.parentId || null;
      const treeQuery = { ...baseFilter, parentCategory: parentId };
      categories = await Category.find(treeQuery).sort({ sortOrder: 1, name: 1 }).lean();
      for (const cat of categories) {
        cat.children = await Category.find({ ...baseFilter, parentCategory: cat._id })
          .sort({ sortOrder: 1, name: 1 }).lean();
      }
    } else {
      categories = await Category.find(baseFilter)
        .populate('parentCategory', 'name slug')
        .sort({ sortOrder: 1, name: 1 });
    }

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error('Error getting categories', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get categories',
      error: error.message,
    });
  }
};

/**
 * Get single category by ID (admin) - categories are global
 */
exports.getCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findOne({ _id: id }).populate('parentCategory', 'name slug');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    logger.error('Error getting category', { error: error.message, categoryId: req.params.id });
    res.status(500).json({
      success: false,
      message: 'Failed to get category',
      error: error.message,
    });
  }
};

/**
 * Create category
 */
exports.createCategory = async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      parentCategory,
      image,
      isActive,
      sortOrder,
      metaTitle,
      metaDescription,
      focusKeyword,
      keywords,
      niche,
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    // Check if parent category exists (if provided) - categories are global
    if (parentCategory) {
      const parent = await Category.findOne({ _id: parentCategory });
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: 'Parent category not found',
        });
      }
    }

    // Handle image upload if file is provided
    let imageUrl = image;
    if (req.files && req.files.image) {
      try {
        const file = req.files.image;
        
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.',
          });
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
          return res.status(400).json({
            success: false,
            message: 'File size too large. Maximum size is 5MB.',
          });
        }

        // Upload to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: 'categories',
          resource_type: 'image',
          transformation: [
            { width: 800, height: 800, crop: 'limit' },
            { quality: 'auto' },
          ],
        });

        imageUrl = uploadResult.secure_url;
        logger.info('Category image uploaded to Cloudinary', { 
          categoryName: name,
          imageUrl 
        });
      } catch (uploadError) {
        logger.error('Error uploading category image', { 
          error: uploadError.message,
          categoryName: name 
        });
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image',
          error: uploadError.message,
        });
      }
    }

    // Generate slug from name if not provided
    let categorySlug = slug;
    if (!categorySlug && name) {
      categorySlug = Category.generateSlug(name);
      
      // Ensure slug uniqueness
      let slugExists = true;
      let counter = 1;
      let testSlug = categorySlug;
      
      while (slugExists) {
        const existingCategory = await Category.findOne({ slug: testSlug });
        if (!existingCategory) {
          slugExists = false;
          categorySlug = testSlug;
        } else {
          testSlug = `${categorySlug}-${counter}`;
          counter++;
        }
      }
    }

    // Create category - global (storeId: null)
    const categoryData = {
      storeId: null,
      name,
      slug: categorySlug,
      description,
      parentCategory: parentCategory || null,
      image: imageUrl,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder || 0,
      metaTitle,
      metaDescription,
      focusKeyword,
      keywords,
      niche: niche ? String(niche).toLowerCase().trim() : null,
    };

    const category = await Category.create(categoryData);

    logger.info('Category created', { categoryId: category._id, name: category.name });

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category,
    });
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error
      return res.status(400).json({
        success: false,
        message: 'Category with this name or slug already exists',
      });
    }

    logger.error('Error creating category', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: error.message,
    });
  }
};

/**
 * Update category
 */
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    if (updateData.niche !== undefined) {
      updateData.niche = updateData.niche ? String(updateData.niche).toLowerCase().trim() : null;
    }

    // Prevent setting parent to itself
    if (updateData.parentCategory === id) {
      return res.status(400).json({
        success: false,
        message: 'Category cannot be its own parent',
      });
    }

    // Check if parent category exists (if being updated)
    if (updateData.parentCategory) {
      const parent = await Category.findOne({ _id: updateData.parentCategory });
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: 'Parent category not found',
        });
      }

      // Prevent circular reference (check if parent is a descendant)
      const isDescendant = await checkIfDescendant(id, updateData.parentCategory);
      if (isDescendant) {
        return res.status(400).json({
          success: false,
          message: 'Cannot set parent category - would create circular reference',
        });
      }
    }

    const category = await Category.findOneAndUpdate({ _id: id }, updateData, {
      new: true,
      runValidators: true,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    logger.info('Category updated', { categoryId: category._id, name: category.name });

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: category,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name or slug already exists',
      });
    }

    logger.error('Error updating category', { error: error.message, categoryId: req.params.id });
    res.status(500).json({
      success: false,
      message: 'Failed to update category',
      error: error.message,
    });
  }
};

/**
 * Delete category
 */
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findOne({ _id: id });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Check if category has children
    const childCount = await Category.countDocuments({ parentCategory: id });
    if (childCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with subcategories. Please delete or move subcategories first.',
      });
    }

    // Check if category has products
    const productCount = await Product.countDocuments({ category: id });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with products. Please remove or reassign products first.',
      });
    }

    await Category.findOneAndDelete({ _id: id });

    logger.info('Category deleted', { categoryId: id, name: category.name });

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting category', { error: error.message, categoryId: req.params.id });
    res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: error.message,
    });
  }
};

/**
 * Admin: Upsert translation for a category
 * PUT /admin/categories/:id/translations/:locale
 */
exports.updateCategoryTranslation = async (req, res) => {
  try {
    const { id, locale } = req.params;
    const { name, slug, description, metaTitle, metaDescription, focusKeyword, keywords } = req.body || {};

    if (!locale) {
      return res.status(400).json({
        success: false,
        message: 'Locale is required',
      });
    }

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Enforce uniqueness of slug per locale across categories
    if (slug) {
      const slugConflict = await Category.findOne({
        _id: { $ne: category._id },
        translations: { $elemMatch: { locale, slug } },
      }).lean();

      if (slugConflict) {
        return res.status(400).json({
          success: false,
          message: 'A category with this slug already exists for the selected locale',
        });
      }
    }

    if (!Array.isArray(category.translations)) {
      category.translations = [];
    }

    const existing = category.translations.find((t) => t.locale === locale);

    if (existing) {
      if (name !== undefined) existing.name = name;
      if (slug !== undefined) existing.slug = slug;
      if (description !== undefined) existing.description = description;
      if (metaTitle !== undefined) existing.metaTitle = metaTitle;
      if (metaDescription !== undefined) existing.metaDescription = metaDescription;
      if (focusKeyword !== undefined) existing.focusKeyword = focusKeyword;
      if (keywords !== undefined) existing.keywords = keywords;
    } else {
      category.translations.push({
        locale,
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(description !== undefined && { description }),
        ...(metaTitle !== undefined && { metaTitle }),
        ...(metaDescription !== undefined && { metaDescription }),
        ...(focusKeyword !== undefined && { focusKeyword }),
        ...(keywords !== undefined && { keywords }),
      });
    }

    await category.save();

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    logger.error('Error updating category translation', { error: error.message, categoryId: req.params.id });
    res.status(500).json({
      success: false,
      message: 'Failed to update category translation',
      error: error.message,
    });
  }
};

/**
 * Build category filter: no store (categories are global). Optionally filter by niche.
 */
function getCategoryFilter(storeNiche) {
  const filter = { isActive: true };
  if (storeNiche) {
    filter.$or = [{ niche: storeNiche }, { niche: null }];
  }
  return filter;
}

/**
 * Get single public category by ID or slug
 * Categories are GLOBAL (no store filter). Product counts are scoped by store.
 */
exports.getPublicCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { locale } = req.query;
    const storeNiche = req.store?.niche || null;
    const categoryFilter = getCategoryFilter(storeNiche);

    // Find by slug (prefer) or ID - categories are global, no store filter
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    let category;

    if (isObjectId) {
      category = await Category.findOne({
        ...categoryFilter,
        _id: id,
      }).lean();
    } else if (locale) {
      // Try matching by default slug or translation slug for the requested locale
      category = await Category.findOne({
        ...categoryFilter,
        $or: [
          { slug: id },
          { translations: { $elemMatch: { locale, slug: id } } },
        ],
      }).lean();
    } else {
      category = await Category.findOne({
        ...categoryFilter,
        slug: id,
      }).lean();
    }

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Product counts: scope by store (products belong to stores)
    const productFilter = getStoreFilter(req.storeId);
    
    // Get subcategories (children) - same niche filter
    const childrenFilter = {
      parentCategory: category._id,
      ...categoryFilter,
    };
    const children = await Category.find(childrenFilter)
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    
    for (const child of children) {
      const childCount = await Product.countDocuments({
        ...productFilter,
        category: child._id,
        isInStore: true,
        status: 'active'
      });
      child.productCount = childCount || 0;
    }
    
    // Apply translations to children first
    const localizedChildren = children.map((child) => applyCategoryTranslation(child, locale));
    category.children = localizedChildren;
    
    let productCount = 0;
    if (children.length > 0) {
      const categoryIds = [category._id, ...children.map(c => c._id)];
      productCount = await Product.countDocuments({
        ...productFilter,
        category: { $in: categoryIds },
        isInStore: true,
        status: 'active'
      });
    } else {
      productCount = await Product.countDocuments({
        ...productFilter,
        category: category._id,
        isInStore: true,
        status: 'active'
      });
    }
    category.productCount = productCount || 0;

    const localizedCategory = applyCategoryTranslation(category, locale);

    res.status(200).json({
      success: true,
      data: localizedCategory,
    });
  } catch (error) {
    logger.error('Error getting public category', { error: error.message, categoryId: req.params.id });
    res.status(500).json({
      success: false,
      message: 'Failed to get category',
      error: error.message,
    });
  }
};

/**
 * Get public categories (for client-facing pages)
 * Categories are GLOBAL (no store filter). Product counts scoped by store.
 */
exports.getPublicCategories = async (req, res) => {
  try {
    const { tree, activeOnly = true, locale } = req.query;
    const storeNiche = req.store?.niche || null;
    const categoryFilter = { ...getCategoryFilter(storeNiche), isActive: activeOnly !== 'false' };
    const productFilter = getStoreFilter(req.storeId);
    
    let categories;
    
    if (tree === 'true') {
      categories = await Category.find({ ...categoryFilter, parentCategory: null })
        .sort({ sortOrder: 1, name: 1 })
        .lean();
      for (const cat of categories) {
        cat.children = await Category.find({ ...categoryFilter, parentCategory: cat._id })
          .sort({ sortOrder: 1, name: 1 })
          .lean();
      }
    } else {
      categories = await Category.find({ ...categoryFilter, parentCategory: null })
        .sort({ sortOrder: 1, name: 1 })
        .lean();
    }
    
    for (const category of categories) {
      const count = await Product.countDocuments({ 
        ...productFilter,
        category: category._id,
        isInStore: true,
        status: 'active'
      });
      category.productCount = count || 0;
      
      if (tree === 'true' && category.children) {
        for (const child of category.children) {
          const childCount = await Product.countDocuments({ 
            ...productFilter,
            category: child._id,
            isInStore: true,
            status: 'active'
          });
          child.productCount = childCount || 0;
        }
      }
    }

    // Apply translations
    const localizedCategories = categories.map((cat) => {
      const localized = applyCategoryTranslation(cat, locale);
      if (tree === 'true' && Array.isArray(cat.children)) {
        localized.children = cat.children.map((child) => applyCategoryTranslation(child, locale));
      }
      return localized;
    });
    
    res.status(200).json({
      success: true,
      data: localizedCategories
    });
  } catch (error) {
    logger.error('Error getting public categories', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get categories',
      error: error.message,
    });
  }
};

/**
 * Helper function to check if a category is a descendant of another
 */
async function checkIfDescendant(categoryId, potentialParentId) {
  let currentParentId = potentialParentId;

  // Limit depth to prevent infinite loops
  let depth = 0;
  const maxDepth = 100;

  while (currentParentId && depth < maxDepth) {
    if (currentParentId.toString() === categoryId.toString()) {
      return true;
    }

    const parent = await Category.findById(currentParentId);
    if (!parent || !parent.parentCategory) {
      break;
    }

    currentParentId = parent.parentCategory;
    depth++;
  }

  return false;
}

