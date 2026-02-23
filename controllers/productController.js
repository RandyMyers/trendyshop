const mongoose = require('mongoose');
const cjProductService = require('../services/cjProductService');
const cjAuthService = require('../services/cjAuthService');
const Product = require('../models/Product');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Extract variant stock from CJ inventory structures per cjdropshipping.txt.
 * CJ uses: variant.inventories[] with totalInventory per warehouse, or inventoryNum/totalInventoryNum.
 */
function getVariantStockFromCj(variant) {
  if (!variant) return 0;
  const invs = variant.inventories || [];
  if (Array.isArray(invs) && invs.length > 0) {
    const sum = invs.reduce((acc, inv) => {
      const n = inv.totalInventory ?? inv.totalInventoryNum;
      return acc + (typeof n === 'number' ? n : parseInt(n, 10) || 0);
    }, 0);
    if (sum > 0) return sum;
  }
  return (
    variant.inventoryNum ??
    variant.totalInventoryNum ??
    variant.stock ??
    0
  );
}

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
 * Helper: apply translation for a given locale to a product-like object
 */
function applyProductTranslation(product, locale) {
  if (!product) return product;

  const data = { ...(product.toObject ? product.toObject() : product) };

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

/** Normalize slug for lookup (matches Category.generateSlug logic) - handles URL-encoded apostrophes etc. */
const normalizeSlugForLookup = (s) => {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

/**
 * Search/query products (only products in your store)
 * GET /api/v1/products
 */
exports.getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category = '',
      keyword = '',
      sort = 'newest',
      sortType = 'POPULARITY_DESC',
      minPrice,
      maxPrice,
      locale,
    } = req.query;
    
    // Use sort if provided, otherwise use sortType for backward compatibility
    const finalSortType = sort || sortType;

    // Get products from your store (isInStore = true), optionally filtered by store
    // Use status: 'active' so product list matches category counts (getPublicCategories uses same)
    const productFilter = getStoreFilter(req.storeId);
    const query = { ...productFilter, isInStore: true, status: 'active' };
    
    if (category) {
      // Category can be ID, slug, or name - need to find the category first
      // Only use _id when it's a valid ObjectId; otherwise MongoDB throws CastError for slugs like "skirts"
      const Category = require('../models/Category');
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(category));
      const normalizedSlug = normalizeSlugForLookup(category);
      const categoryQuery = {
        isActive: true,
        $or: [
          { slug: category },
          ...(normalizedSlug && normalizedSlug !== category ? [{ slug: normalizedSlug }] : []),
          { name: new RegExp(`^${escapeRegExp(String(category))}$`, 'i') }
        ].filter(Boolean)
      };
      if (isObjectId) categoryQuery.$or.unshift({ _id: category });
      const categoryDoc = await Category.findOne(categoryQuery);
      
      if (categoryDoc) {
        // Check if this is a parent category - if so, include all subcategories
        const childCategories = await Category.find({
          parentCategory: categoryDoc._id,
          isActive: true
        }).select('_id').lean();
        
        if (childCategories.length > 0) {
          // Parent category: include products from parent and all children
          const categoryIds = [categoryDoc._id, ...childCategories.map(c => c._id)];
          query.category = { $in: categoryIds };
        } else {
          // Leaf category: just this category
          query.category = categoryDoc._id;
        }
      } else {
        // If category not found, return empty results
        return res.status(200).json({
          success: true,
          data: {
            products: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0,
            },
          },
        });
      }
    }

    // Availability filter (admin / store)
    if (req.query.isAvailable === 'true') query.isAvailable = true;
    if (req.query.isAvailable === 'false') query.isAvailable = false;

    // Min stock filter (e.g. low-stock view)
    if (req.query.minStock !== undefined && req.query.minStock !== '') {
      const n = parseInt(req.query.minStock, 10);
      if (!isNaN(n)) query.stock = { $gte: n };
    }
    
    // Enhanced search - supports text search and keyword matching
    if (keyword) {
      const searchKeyword = keyword.trim();
      
      // Build search conditions array
      const searchOrConditions = [
        { $text: { $search: searchKeyword } },
        { name: { $regex: searchKeyword, $options: 'i' } },
        { description: { $regex: searchKeyword, $options: 'i' } },
        { tags: { $in: [new RegExp(searchKeyword, 'i')] } },
        { brand: { $regex: searchKeyword, $options: 'i' } },
        { sku: { $regex: searchKeyword, $options: 'i' } },
      ];
      
      // Combine search with existing query using $and
      const baseQuery = { ...query };
      query = {
        $and: [
          baseQuery,
          { $or: searchOrConditions }
        ]
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort query
    let sortQuery = { createdAt: -1 };
    const projection = {};
    let useTextScore = false;
    
    // If searching with text index, add text score for relevance
    if (keyword) {
      try {
        // Check if we can use text search (when keyword exists)
        projection.score = { $meta: 'textScore' };
        useTextScore = true;
        sortQuery = { score: { $meta: 'textScore' }, createdAt: -1 };
      } catch (e) {
        // Text index might not be ready, fallback to regular sort
        useTextScore = false;
      }
    }
    
    // Apply sort type if not using text score or as secondary sort
    if (finalSortType && !useTextScore) {
      switch (finalSortType) {
        case 'price-low':
        case 'price_asc':
          sortQuery = { price: 1, createdAt: -1 };
          break;
        case 'price-high':
        case 'price_desc':
          sortQuery = { price: -1, createdAt: -1 };
          break;
        case 'newest':
        case 'POPULARITY_DESC':
        default:
          sortQuery = { createdAt: -1 };
          break;
      }
    } else if (finalSortType && useTextScore) {
      // Combine text score with additional sort
      switch (finalSortType) {
        case 'price-low':
          sortQuery = { score: { $meta: 'textScore' }, price: 1, createdAt: -1 };
          break;
        case 'price-high':
          sortQuery = { score: { $meta: 'textScore' }, price: -1, createdAt: -1 };
          break;
        default:
          sortQuery = { score: { $meta: 'textScore' }, createdAt: -1 };
          break;
      }
    }
    
    // Add price range filtering if provided
    if (minPrice !== undefined || maxPrice !== undefined) {
      if (!query.price) query.price = {};
      if (minPrice !== undefined) {
        query.price.$gte = parseFloat(minPrice);
      }
      if (maxPrice !== undefined) {
        query.price.$lte = parseFloat(maxPrice);
      }
    }
    
    // Add onSale filter (products with compareAtPrice > price)
    if (req.query.onSale === 'true' || req.query.sale === 'true') {
      const saleCondition = {
        $and: [
          { compareAtPrice: { $exists: true, $ne: null, $gt: 0 } },
          { $expr: { $gt: ['$compareAtPrice', '$price'] } }
        ]
      };
      
      if (query.$and) {
        query.$and.push(saleCondition);
      } else {
        query = { $and: [query, saleCondition] };
      }
    }
    
    // Add "new" filter (products created in last 30 days)
    if (req.query.new === 'true' || req.query.newArrivals === 'true') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const newCondition = { createdAt: { $gte: thirtyDaysAgo } };
      
      if (query.$and) {
        query.$and.push(newCondition);
      } else {
        query = { $and: [query, newCondition] };
      }
    }
    
    // Add color filtering (if colors parameter provided)
    if (req.query.colors) {
      const colors = Array.isArray(req.query.colors) 
        ? req.query.colors 
        : req.query.colors.split(',').map(c => c.trim()).filter(Boolean);
      
      if (colors.length > 0) {
        // Search in variants for color matches
        const colorCondition = {
          'variants.name': { $regex: colors.join('|'), $options: 'i' }
        };
        
        if (query.$and) {
          query.$and.push(colorCondition);
        } else {
          Object.assign(query, colorCondition);
        }
      }
    }
    
    // Add size filtering (if sizes parameter provided)
    if (req.query.sizes) {
      const sizes = Array.isArray(req.query.sizes) 
        ? req.query.sizes 
        : req.query.sizes.split(',').map(s => s.trim()).filter(Boolean);
      
      if (sizes.length > 0) {
        // Search in variants for size matches
        const sizeCondition = {
          'variants.name': { $regex: sizes.join('|'), $options: 'i' }
        };
        
        if (query.$and) {
          query.$and.push(sizeCondition);
        } else {
          Object.assign(query, sizeCondition);
        }
      }
    }
    
    // Build query with projection for text search scoring
    let productQuery = Product.find(query);
    
    // Do not use .select(projection) when useTextScore - that would return only _id and score and omit images etc.
    
    const products = await productQuery
      .populate('category', 'name slug image')
      .populate('storeId', 'name slug')
      .sort(sortQuery)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Apply translations for locale (if provided) and add availableLocales
    const localizedProducts = products.map((p) => applyProductTranslation(p, locale));
    
    const total = await Product.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        products: localizedProducts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error('Error getting products', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get products',
      error: error.message,
    });
  }
};

/**
 * Get available filter options (colors, sizes, etc.)
 * GET /api/v1/products/filter-options
 */
exports.getFilterOptions = async (req, res) => {
  try {
    const { category } = req.query;
    const productFilter = getStoreFilter(req.storeId);
    
    // Build query for products
    const query = { 
      ...productFilter,
      isInStore: true, 
      status: 'active',
      visibility: 'public'
    };
    
    // Filter by category if provided
    if (category) {
      const Category = require('../models/Category');
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(category));
      const normalizedSlug = normalizeSlugForLookup(category);
      const categoryQuery = {
        isActive: true,
        $or: [
          { slug: category },
          ...(normalizedSlug && normalizedSlug !== category ? [{ slug: normalizedSlug }] : []),
          { name: new RegExp(`^${escapeRegExp(String(category))}$`, 'i') }
        ].filter(Boolean)
      };
      if (isObjectId) categoryQuery.$or.unshift({ _id: category });
      const categoryDoc = await Category.findOne(categoryQuery);
      
      if (categoryDoc) {
        query.category = categoryDoc._id;
      }
    }
    
    // Get all products matching criteria (only variants field for performance)
    const products = await Product.find(query)
      .select('variants')
      .lean();
    
    // Extract unique colors and sizes from variants
    const colorsSet = new Set();
    const sizesSet = new Set();
    
    products.forEach(product => {
      if (product.variants && Array.isArray(product.variants)) {
        product.variants.forEach(variant => {
          if (variant.name) {
            const variantName = variant.name.toLowerCase();
            
            // Common color keywords
            const colorKeywords = [
              'black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple',
              'orange', 'brown', 'gray', 'grey', 'beige', 'tan', 'navy', 'maroon',
              'gold', 'silver', 'bronze', 'copper', 'ivory', 'cream', 'burgundy'
            ];
            
            // Common size keywords
            const sizeKeywords = [
              'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl',
              'small', 'medium', 'large', 'extra-large',
              '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'
            ];
            
            // Check for colors
            colorKeywords.forEach(color => {
              if (variantName.includes(color)) {
                colorsSet.add(color.charAt(0).toUpperCase() + color.slice(1));
              }
            });
            
            // Check for sizes
            sizeKeywords.forEach(size => {
              if (variantName === size || variantName.includes(` ${size} `) || variantName.endsWith(` ${size}`)) {
                sizesSet.add(size.toUpperCase());
              }
            });
          }
        });
      }
    });
    
    const colors = Array.from(colorsSet).sort();
    const sizes = Array.from(sizesSet).sort();
    
    res.status(200).json({
      success: true,
      data: {
        colors,
        sizes,
      },
    });
  } catch (error) {
    logger.error('Error getting filter options', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get filter options',
      error: error.message,
    });
  }
};

/**
 * Get product by ID
 * GET /api/v1/products/:id
 */
exports.getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { locale } = req.query;
    const productFilter = getStoreFilter(req.storeId);

    // Try to get from cache first
    let product = await Product.findOne({
      $or: [{ _id: id }, { cjProductId: id }],
      ...productFilter,
    }).populate({
      path: 'category',
      select: 'name slug image',
      match: { _id: { $exists: true } } // Only populate if category is a valid ObjectId
    }).populate('storeId', 'name slug');

    // If product not found due to invalid category, try without category filter
    if (!product) {
      product = await Product.findOne({
        $or: [{ _id: id }, { cjProductId: id }],
        ...productFilter,
      });
      
      // If product has invalid category (empty string), fix it
      if (product && product.category === '') {
        product.category = null;
        await product.save();
      }
      
      // Try to populate if category exists and is valid
      if (product && product.category && product.category !== '') {
        try {
          await product.populate('category', 'name slug image');
        } catch (populateError) {
          // If populate fails (invalid ObjectId), set to null
          product.category = null;
          await product.save();
        }
      }
    }

    // If not in cache or needs refresh, sync from CJ
    if (!product || (product.cjProductId && product.lastSyncedAt && Date.now() - product.lastSyncedAt.getTime() > 3600000)) {
      // Sync product if we have CJ product ID
      const cjProductId = product?.cjProductId || id;
      try {
        product = await cjProductService.syncProduct(cjProductId);
        // Re-populate category after sync (only if valid)
        if (product && product.category && product.category !== '') {
          try {
            await product.populate('category', 'name slug image');
          } catch (populateError) {
            // If populate fails, category is invalid - set to null
            product.category = null;
            await product.save();
          }
        }
      } catch (syncError) {
        logger.error('Error syncing product', { error: syncError.message, cjProductId });
        // Continue with existing product if sync fails
      }
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Check if request is from admin panel (admin or invited member)
    const isAdminRequest = req.user && (req.user.role === 'admin' || req.user.role === 'member');
    
    // Ensure product is active and visible for public access (unless admin)
    if (!isAdminRequest && (!product.isInStore || product.status !== 'active' || product.visibility !== 'public')) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or not available',
      });
    }

    // Get related products (from same category, excluding current product)
    let relatedProducts = [];
    if (product.category) {
      relatedProducts = await Product.find({
        category: product.category,
        isInStore: true,
        status: 'active',
        visibility: 'public',
        _id: { $ne: product._id }
      })
        .populate('category', 'name slug image')
        .select('name price images slug category')
        .limit(4)
        .lean();
    }

    // Convert to plain object for JSON response
    let productData = product.toObject ? product.toObject() : product;
    
    // Fix product name if it's a Chinese array string
    if (productData.name && typeof productData.name === 'string') {
      if (productData.name.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(productData.name);
          if (Array.isArray(parsed) && parsed.length > 0 && productData.cjData?.productNameEn) {
            productData.name = productData.cjData.productNameEn;
          } else if (Array.isArray(parsed) && parsed.length > 0) {
            productData.name = parsed[0];
          }
        } catch (e) {
          // Not valid JSON, check if Chinese and use English from cjData
          if (/[\u4e00-\u9fa5]/.test(productData.name) && productData.cjData?.productNameEn) {
            productData.name = productData.cjData.productNameEn;
          }
        }
      } else if (/[\u4e00-\u9fa5]/.test(productData.name) && productData.cjData?.productNameEn) {
        // If name contains Chinese characters, use English name if available
        productData.name = productData.cjData.productNameEn;
      }
    }
    
    // Parse variants and create variant mapping structure
    const variantMap = {}; // { "color-size": variantObject }
    const colorSizeMap = {}; // { "color": { "size": variantObject } }
    const availableColors = new Set();
    const availableSizes = new Set();
    const allUniqueSizes = new Set(); // All possible sizes across all variants
    
    // Get CJ variant data if available for parsing variantKey/variantNameEn
    const cjVariants = productData.cjData?.variants || [];
    const cjVariantMap = new Map();
    if (cjVariants.length > 0) {
      cjVariants.forEach(cjVariant => {
        const vid = cjVariant.vid || cjVariant.variantId || cjVariant.id;
        if (vid) {
          cjVariantMap.set(vid.toString(), cjVariant);
        }
      });
    }
    
    if (productData.variants && Array.isArray(productData.variants)) {
      productData.variants.forEach(variant => {
        // Merge CJ variant data for parsing, but use our stored variant price (our store price)
        const variantId = variant.variantId || variant.vid || variant.id;
        const cjVariant = variantId ? cjVariantMap.get(variantId.toString()) : null;
        
        // Create enriched variant object with our store price
        const enrichedVariant = {
          ...variant,
          // Use our store price (variant.price), not CJ's price
          price: variant.price, // This is our store price (our selling price)
          // Keep CJ data for parsing purposes only
          variantKey: cjVariant?.variantKey || variant.variantKey,
          variantNameEn: cjVariant?.variantNameEn || variant.variantNameEn || variant.name,
        };
        
        // Only include CJ pricing fields for admin requests
        if (isAdminRequest) {
          enrichedVariant.cjPrice = variant.cjPrice || cjVariant?.variantSellPrice;
          enrichedVariant.suggestedPrice = variant.suggestedPrice || cjVariant?.variantSugSellPrice;
        }
        
        let color = null;
        let size = null;
        
        // Strategy 1: Parse from variantKey (e.g., "Black-2XL", "Green-L")
        if (enrichedVariant.variantKey) {
          const keyParts = enrichedVariant.variantKey.split(/[- ]/);
          if (keyParts.length >= 2) {
            // Last part is usually size, rest is color
            size = keyParts[keyParts.length - 1].trim();
            color = keyParts.slice(0, -1).join(' ').trim();
          }
        }
        
        // Strategy 2: Parse from variantNameEn if variantKey didn't work
        if ((!color || !size) && enrichedVariant.variantNameEn) {
          const variantName = enrichedVariant.variantNameEn.toLowerCase();
          
          // Extract color keywords
          const colorKeywords = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown', 'gray', 'grey', 'navy blue', 'navy', 'beige', 'tan'];
          for (const keyword of colorKeywords) {
            if (variantName.includes(keyword)) {
              color = keyword.charAt(0).toUpperCase() + keyword.slice(1);
              break;
            }
          }
          
          // Extract size from end of name (common patterns: "Black L", "Black XL", "Black 2XL")
          const sizePatterns = [
            /\b(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl)\b/i,
            /\b(small|medium|large|extra large|extra-small)\b/i,
            /\b(\d+xl)\b/i
          ];
          
          for (const pattern of sizePatterns) {
            const match = variantName.match(pattern);
            if (match) {
              size = match[1].toUpperCase();
              break;
            }
          }
        }
        
        // Strategy 3: Try variant.name if it exists
        if ((!color || !size) && enrichedVariant.name) {
          const variantName = enrichedVariant.name.toLowerCase();
          
          const colorKeywords = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown', 'gray', 'grey', 'navy blue', 'navy'];
          for (const keyword of colorKeywords) {
            if (variantName.includes(keyword)) {
              color = keyword.charAt(0).toUpperCase() + keyword.slice(1);
              break;
            }
          }
          
          const sizeMatch = variantName.match(/\b(xs|s|m|l|xl|xxl|xxxl|2xl|3xl)\b/i);
          if (sizeMatch) {
            size = sizeMatch[1].toUpperCase();
          }
        }
        
        // If we successfully extracted color and size, build maps
        if (color && size) {
          // Normalize color name (handle variations like "Navy Blue" vs "Navy")
          const normalizedColor = color;
          const normalizedSize = size;
          
          // Build variantMap: "color-size" => variant (with our store price)
          const key = `${normalizedColor}-${normalizedSize}`;
          variantMap[key] = enrichedVariant;
          
          // Build colorSizeMap: color => { size => variant }
          if (!colorSizeMap[normalizedColor]) {
            colorSizeMap[normalizedColor] = {};
          }
          colorSizeMap[normalizedColor][normalizedSize] = enrichedVariant;
          
          // Track available colors and sizes
          availableColors.add(normalizedColor);
          availableSizes.add(normalizedSize);
          allUniqueSizes.add(normalizedSize);
        }
      });
    }
    
    // Also extract from variant.name for backward compatibility
    if (productData.variants && Array.isArray(productData.variants)) {
      productData.variants.forEach(variant => {
        if (variant.name) {
          const variantName = variant.name.toLowerCase();
          
          // Extract colors
          const colorKeywords = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown', 'gray', 'grey'];
          colorKeywords.forEach(color => {
            if (variantName.includes(color)) {
              availableColors.add(color.charAt(0).toUpperCase() + color.slice(1));
            }
          });
          
          // Extract sizes
          const sizeKeywords = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'small', 'medium', 'large'];
          sizeKeywords.forEach(size => {
            if (variantName === size || variantName.includes(` ${size} `)) {
              availableSizes.add(size.toUpperCase());
              allUniqueSizes.add(size.toUpperCase());
            }
          });
        }
      });
    }
    
    productData.availableColors = Array.from(availableColors);
    productData.availableSizes = Array.from(availableSizes);
    productData.allSizes = Array.from(allUniqueSizes).sort(); // All unique sizes across all variants
    productData.variantMap = variantMap; // Lookup: "Color-Size" => variant
    productData.colorSizeMap = colorSizeMap; // Lookup: color => { size => variant }
    productData.relatedProducts = relatedProducts;

    // Apply translations for requested locale (if any) and add availableLocales
    productData = applyProductTranslation(productData, locale);

    res.status(200).json({
      success: true,
      data: productData,
    });
  } catch (error) {
    logger.error('Error getting product', { error: error.message, productId: req.params.id });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get product',
      error: error.message,
    });
  }
};

/**
 * Get product by slug (default or translated)
 * GET /api/v1/products/slug/:slug?locale=en-US
 */
exports.getProductBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const { locale } = req.query;
    const productFilter = getStoreFilter(req.storeId);
    const normalizedSlug = normalizeSlugForLookup(slug);

    const slugQuery = {
      ...productFilter,
      isInStore: true,
      status: 'active',
      visibility: 'public',
      isAvailable: true,
      $or: [{ slug }],
    };

    if (normalizedSlug && normalizedSlug !== slug) {
      slugQuery.$or.push({ slug: normalizedSlug });
    }

    if (locale) {
      slugQuery.$or.push({ 'translations.locale': locale, 'translations.slug': slug });
      if (normalizedSlug && normalizedSlug !== slug) {
        slugQuery.$or.push({ 'translations.locale': locale, 'translations.slug': normalizedSlug });
      }
    }

    const product = await Product.findOne(slugQuery);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    req.params.id = product._id.toString();
    return exports.getProduct(req, res);
  } catch (error) {
    logger.error('Error getting product by slug', { error: error.message, slug: req.params?.slug });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get product',
      error: error.message,
    });
  }
};

/**
 * Get product categories
 * GET /api/v1/products/categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await cjProductService.getCategories();

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error('Error getting categories', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get categories',
      error: error.message,
    });
  }
};

/**
 * Get freight options for product
 * GET /api/v1/products/:id/freight
 */
exports.getFreightOptions = async (req, res) => {
  try {
    const { id } = req.params;
    const { variantId, countryCode, quantity = 1 } = req.query;

    if (!countryCode) {
      return res.status(400).json({
        success: false,
        message: 'Country code is required',
      });
    }

    // Get product to find CJ product ID
    const product = await Product.findOne({
      $or: [{ _id: id }, { cjProductId: id }],
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const freightOptions = await cjProductService.getFreightOptions({
      productId: product.cjProductId,
      variantId: variantId || '',
      countryCode,
      quantity: parseInt(quantity),
    });

    res.status(200).json({
      success: true,
      data: freightOptions,
    });
  } catch (error) {
    logger.error('Error getting freight options', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get freight options',
      error: error.message,
    });
  }
};

/**
 * Browse CJ catalog (search products from CJ)
 * GET /api/v1/admin/cj-products/search (Admin only)
 */
exports.browseCJCatalog = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      categoryId = '',
      keyword = '',
      sortType = 'POPULARITY_DESC',
    } = req.query;

    // Check if CJ API key is configured
    const hasApiKey = await cjAuthService.hasApiKey();
    if (!hasApiKey) {
      return res.status(400).json({
        success: false,
        message: 'CJ API key is not configured. Please configure it in CJ Configuration page.',
        error: 'CJ API key is not configured',
      });
    }

    const params = {
      pageNum: parseInt(page),
      pageSize: parseInt(limit),
      categoryId,
      keyword,
      sortType,
    };

    // Search CJ catalog
    const result = await cjProductService.searchCJCatalog(params);

    res.status(200).json({
      success: true,
      data: {
        products: result.products || [],
        pagination: {
          page: result.pageNum || parseInt(page),
          limit: result.pageSize || parseInt(limit),
          total: result.total || 0,
          pages: result.totalPages || 0,
        },
      },
    });
  } catch (error) {
    logger.error('Error browsing CJ catalog', { 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    // Check if it's an API key configuration error
    if (error.message && error.message.includes('API key is not configured')) {
      return res.status(400).json({
        success: false,
        message: 'CJ API key is not configured. Please configure it in CJ Configuration page.',
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to browse CJ catalog',
      error: error.message,
    });
  }
};

/**
 * Get CJ product details for preview
 * GET /api/v1/admin/cj-products/:cjProductId (Admin only)
 */
exports.getCJProductDetails = async (req, res) => {
  try {
    const { cjProductId } = req.params;
    const { includeVideos, includeInventory } = req.query;

    // Check if CJ API key is configured
    const hasApiKey = await cjAuthService.hasApiKey();
    if (!hasApiKey) {
      return res.status(400).json({
        success: false,
        message: 'CJ API key is not configured. Please configure it in CJ Configuration page.',
        error: 'CJ API key is not configured',
      });
    }

    const options = {
      includeVideos: includeVideos !== 'false',
      includeInventory: includeInventory !== 'false',
    };

    const cjProduct = await cjProductService.getProductDetails(cjProductId, options);

    if (!cjProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in CJ catalog',
      });
    }

    res.status(200).json({
      success: true,
      data: cjProduct,
    });
  } catch (error) {
    logger.error('Error getting CJ product details', { 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    // Check if it's an API key configuration error
    if (error.message && error.message.includes('API key is not configured')) {
      return res.status(400).json({
        success: false,
        message: 'CJ API key is not configured. Please configure it in CJ Configuration page.',
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get product details',
      error: error.message,
    });
  }
};

/**
 * Add product from CJ to store with custom price
 * POST /api/v1/admin/products/add-from-cj (Admin only)
 */
exports.addProductFromCJ = async (req, res) => {
  try {
    const {
      cjProductId,
      storeId: bodyStoreId, // Explicit store selection from import wizard
      price, // Legacy support - if provided, use it
      isActive = true, // Legacy support
      // New enhanced options
      categoryId,
      pricingStrategy = 'custom',
      markupValue,
      productName,
      description,
      tags = [],
      metaTitle,
      metaDescription,
      slug,
      images = [],
      variants = [],
      status = 'active',
      visibility = 'public',
      trackInventory = true,
      lowStockThreshold = 10,
      shippingWeight,
      shippingClass,
      availableDate,
      customImages = [],
    } = req.body;

    if (!cjProductId) {
      return res.status(400).json({
        success: false,
        message: 'cjProductId is required',
      });
    }

    // Get CJ product details
    const cjProduct = await cjProductService.getProductDetails(cjProductId);
    if (!cjProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in CJ catalog',
      });
    }

    // Calculate CJ price
    let cjPrice = 0;
    if (typeof cjProduct.sellPrice === 'string' && cjProduct.sellPrice.includes('-')) {
      // Handle price range - take the minimum
      const priceRange = cjProduct.sellPrice.split('-');
      cjPrice = parseFloat(priceRange[0].trim()) || 0;
    } else {
      cjPrice = parseFloat(cjProduct.sellPrice) || parseFloat(cjProduct.price) || parseFloat(cjProduct.nowPrice) || 0;
    }

    // Calculate final price based on pricing strategy
    let finalPrice = 0;
    if (price) {
      // Legacy: use provided price
      finalPrice = parseFloat(price);
    } else {
      // New: calculate based on strategy
      switch (pricingStrategy) {
        case 'suggested':
          if (cjProduct.suggestSellPrice) {
            if (typeof cjProduct.suggestSellPrice === 'string' && cjProduct.suggestSellPrice.includes('-')) {
              const suggestedRange = cjProduct.suggestSellPrice.split('-');
              finalPrice = parseFloat(suggestedRange[0].trim()) || cjPrice * 2;
            } else {
              finalPrice = parseFloat(cjProduct.suggestSellPrice) || cjPrice * 2;
            }
          } else {
            finalPrice = cjPrice * 2; // Default 2x markup
          }
          break;
        case 'markup_percentage':
          const markupPercent = parseFloat(markupValue) || 100;
          finalPrice = cjPrice * (1 + markupPercent / 100);
          break;
        case 'markup_fixed':
          const markupFixed = parseFloat(markupValue) || 0;
          finalPrice = cjPrice + markupFixed;
          break;
        case 'custom':
        default:
          finalPrice = parseFloat(req.body.customPrice) || cjPrice * 2;
          break;
      }
    }

    // Get product images per cjdropshipping.txt: productImage/bigImage (main), productImageSet (array), variants[].variantImage
    const toUrl = (x) => (typeof x === 'string' ? x.trim() : '');
    let productImages = [];
    if (images && images.length > 0) {
      productImages = images.map(toUrl).filter(Boolean);
    } else {
      const mainUrl = toUrl(cjProduct.productImage) || toUrl(cjProduct.bigImage);
      const seen = new Set();
      if (mainUrl) {
        productImages.push(mainUrl);
        seen.add(mainUrl);
      }
      if (Array.isArray(cjProduct.productImageSet)) {
        cjProduct.productImageSet.forEach((url) => {
          const u = toUrl(url);
          if (u && !seen.has(u)) {
            productImages.push(u);
            seen.add(u);
          }
        });
      }
      (cjProduct.variants || []).forEach((v) => {
        const url = toUrl(v.variantImage || v.variant_image);
        if (url && !seen.has(url)) {
          productImages.push(url);
          seen.add(url);
        }
      });
      if (productImages.length === 0 && cjProduct.productImage) {
        try {
          const parsed = JSON.parse(cjProduct.productImage);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          productImages = arr.map(toUrl).filter(Boolean);
        } catch (e) {
          const u = toUrl(cjProduct.productImage);
          if (u) productImages = [u];
        }
      }
      if (productImages.length === 0 && mainUrl) productImages = [mainUrl];
    }

    // Add custom images if provided
    if (customImages && customImages.length > 0) {
      productImages = [...productImages, ...customImages];
    }

    // Filter variants - only include selected ones
    const allVariants = cjProduct.variants || [];
    let selectedVariants = allVariants;
    
    if (variants && variants.length > 0) {
      const variantMap = new Map(variants.map(v => [v.vid, v.include !== false]));
      selectedVariants = allVariants.filter(v => {
        const vid = v.vid || v.variantId;
        return variantMap.has(vid) ? variantMap.get(vid) : true;
      });
    }

    // Generate slug if not provided
    let productSlug = slug;
    if (!productSlug && (productName || cjProduct.productNameEn)) {
      const nameToSlug = productName || cjProduct.productNameEn || cjProduct.productName || '';
      productSlug = nameToSlug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      // Ensure uniqueness by appending number if needed
      let slugExists = true;
      let slugCounter = 1;
      let finalSlug = productSlug;
      
      while (slugExists) {
        const existing = await Product.findOne({ slug: finalSlug });
        if (!existing) {
          slugExists = false;
          productSlug = finalSlug;
        } else {
          finalSlug = `${productSlug}-${slugCounter}`;
          slugCounter++;
        }
      }
    }

    // Check if product already exists
    let product = await Product.findOne({ cjProductId: cjProduct.pid || cjProductId });

    // Use storeId from body (wizard selection) if provided, otherwise from request context
    const targetStoreId = (bodyStoreId && mongoose.Types.ObjectId.isValid(bodyStoreId))
      ? new mongoose.Types.ObjectId(bodyStoreId)
      : req.storeId;

    // Prepare product data
    const productData = {
      ...(targetStoreId && { storeId: targetStoreId }),
      cjProductId: cjProduct.pid || cjProductId,
      name: (() => {
        // Helper function to extract English product name
        const getProductName = (providedName, cjProd) => {
          // 1. Use explicitly provided productName (from wizard)
          if (providedName && typeof providedName === 'string' && providedName.trim()) {
            return providedName.trim();
          }
          
          // 2. Use productNameEn from CJ
          if (cjProd.productNameEn && typeof cjProd.productNameEn === 'string') {
            return cjProd.productNameEn.trim();
          }
          
          // 3. Use nameEn from CJ
          if (cjProd.nameEn && typeof cjProd.nameEn === 'string') {
            return cjProd.nameEn.trim();
          }
          
          // 4. Parse Chinese array if needed (fallback)
          let chineseName = cjProd.productName || cjProd.name || '';
          if (typeof chineseName === 'string' && chineseName.trim().startsWith('[')) {
            try {
              const parsed = JSON.parse(chineseName);
              if (Array.isArray(parsed) && parsed.length > 0) {
                chineseName = parsed[0];
              }
            } catch (e) {
              // Not valid JSON, use as-is
            }
          } else if (Array.isArray(chineseName) && chineseName.length > 0) {
            chineseName = chineseName[0];
          }
          
          return typeof chineseName === 'string' ? chineseName : '';
        };
        
        return getProductName(productName, cjProduct);
      })(),
      description: description || cjProduct.description || '',
      images: productImages,
      category: categoryId || null, // Category reference (ObjectId)
      categoryName: cjProduct.categoryName || cjProduct.threeCategoryName || '', // Keep for backward compatibility
      categories: categoryId ? [categoryId] : [], // Multiple categories support
      brand: cjProduct.brand || '',
      sku: cjProduct.productSku || cjProduct.sku || '',
      price: finalPrice,
      cjPrice: cjPrice,
      compareAtPrice: cjProduct.originalPrice || cjProduct.price || cjPrice,
      suggestedPrice: (() => {
        const raw = cjProduct.suggestSellPrice || cjProduct.sugSellPrice;
        if (!raw) return finalPrice;
        if (typeof raw === 'string' && raw.includes('-')) {
          const parts = raw.split('-');
          return parseFloat(parts[0].trim()) || finalPrice;
        }
        return parseFloat(raw) || finalPrice;
      })(),
      currency: cjProduct.currency || 'USD',
      stock: (() => {
        const direct = cjProduct.stock ?? cjProduct.warehouseInventoryNum ?? cjProduct.totalVerifiedInventory ?? 0;
        if (direct > 0) return direct;
        const sumVariants = selectedVariants.reduce((acc, v) => {
          const cjv = cjProduct.variants?.find(x => (x.vid || x.variantId) === (v.vid || v.variantId)) || v;
          return acc + (getVariantStockFromCj(cjv) || getVariantStockFromCj(v) || 0);
        }, 0);
        return sumVariants > 0 ? sumVariants : 0;
      })(),
      isAvailable: status === 'active',
      isInStore: true,
      status: status,
      visibility: visibility,
      weight: (() => {
        // Handle weight - can be a number, string, or range like "254.00-355.00"
        let weightValue = cjProduct.productWeight || shippingWeight || null;
        if (weightValue) {
          if (typeof weightValue === 'string') {
            // If it's a range (contains '-'), take the first value
            if (weightValue.includes('-')) {
              weightValue = parseFloat(weightValue.split('-')[0].trim());
            } else {
              weightValue = parseFloat(weightValue);
            }
          }
          // Ensure it's a valid number
          return isNaN(weightValue) ? null : weightValue;
        }
        return null;
      })(),
      dimensions: cjProduct.dimensions || null,
      variants: selectedVariants.map((variant) => {
        // Get CJ variant data
        const cjVariant = cjProduct.variants?.find(v => 
          (v.vid || v.variantId) === (variant.vid || variant.variantId)
        ) || variant;
        
        // Calculate variant CJ price (base price for this variant)
        let variantCjPrice = 0;
        const variantSellPriceValue = cjVariant.variantSellPrice || variant.variantSellPrice || variant.price || 0;
        if (typeof variantSellPriceValue === 'string' && variantSellPriceValue.includes('-')) {
          // Handle price range - take the minimum
          const priceRange = variantSellPriceValue.split('-');
          variantCjPrice = parseFloat(priceRange[0].trim()) || 0;
        } else {
          variantCjPrice = parseFloat(variantSellPriceValue) || 0;
        }
        
        // Parse variant suggested price
        let variantSuggestedPrice = 0;
        const variantSugSellPriceValue = cjVariant.variantSugSellPrice || variant.variantSugSellPrice || 0;
        if (variantSugSellPriceValue) {
          if (typeof variantSugSellPriceValue === 'string' && variantSugSellPriceValue.includes('-')) {
            const suggestedRange = variantSugSellPriceValue.split('-');
            variantSuggestedPrice = parseFloat(suggestedRange[0].trim()) || 0;
          } else {
            variantSuggestedPrice = parseFloat(variantSugSellPriceValue) || 0;
          }
        }
        
        // Calculate variant selling price
        // Priority: customPrice > useSuggested > pricing strategy
        let variantFinalPrice;
        
        if (variant.customPrice !== undefined && variant.customPrice !== null && variant.customPrice !== '') {
          // User set custom price
          variantFinalPrice = parseFloat(variant.customPrice);
        } else if (variant.useSuggested && variantSuggestedPrice > 0) {
          // Use CJ suggested price
          variantFinalPrice = variantSuggestedPrice;
        } else if (variantCjPrice > 0) {
          // Apply pricing strategy (same as main product)
          switch (pricingStrategy) {
            case 'suggested':
              // ALWAYS use variant's suggested price if available (this is what user expects)
              if (variantSuggestedPrice > 0) {
                variantFinalPrice = variantSuggestedPrice;
              } else {
                // Apply same markup ratio as main product as fallback
                const mainMarkupRatio = cjPrice > 0 ? finalPrice / cjPrice : 2;
                variantFinalPrice = variantCjPrice * mainMarkupRatio;
              }
              break;
            case 'markup_percentage':
              const markupPercent = parseFloat(markupValue) || 100;
              variantFinalPrice = variantCjPrice * (1 + markupPercent / 100);
              break;
            case 'markup_fixed':
              const markupFixed = parseFloat(markupValue) || 0;
              variantFinalPrice = variantCjPrice + markupFixed;
              break;
            case 'custom':
              // For custom pricing, calculate based on ratio from main product
              const priceRatio = cjPrice > 0 ? finalPrice / cjPrice : 2;
              variantFinalPrice = variantCjPrice * priceRatio;
              break;
            default:
              // Default 2x markup
              variantFinalPrice = variantCjPrice * 2;
              break;
          }
        } else {
          // Fallback to main product price
          variantFinalPrice = finalPrice;
        }
        
        // Ensure price is valid
        if (!variantFinalPrice || variantFinalPrice <= 0) {
          variantFinalPrice = variantCjPrice || finalPrice;
        }
        
        const variantStock = getVariantStockFromCj(cjVariant) || getVariantStockFromCj(variant) || 0;
        return {
          variantId: variant.vid || variant.variantId || variant.id || cjVariant.vid || cjVariant.variantId,
          name: cjVariant.variantNameEn || variant.variantNameEn || variant.variantName || cjVariant.variantName || variant.name || '',
          price: variantFinalPrice,        // Our selling price
          cjPrice: variantCjPrice,         // CJ's cost
          suggestedPrice: variantSuggestedPrice, // CJ's suggested
          stock: variantStock,
          sku: variant.variantSku || cjVariant.variantSku || variant.sku || cjVariant.sku || '',
        };
      }),
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
      slug: productSlug,
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      trackInventory: trackInventory,
      lowStockThreshold: lowStockThreshold,
      shippingWeight: (() => {
        // Handle shippingWeight - can be a number, string, or range
        let weightValue = shippingWeight || null;
        if (weightValue) {
          if (typeof weightValue === 'string') {
            // If it's a range (contains '-'), take the first value
            if (weightValue.includes('-')) {
              weightValue = parseFloat(weightValue.split('-')[0].trim());
            } else {
              weightValue = parseFloat(weightValue);
            }
          }
          // Ensure it's a valid number
          return isNaN(weightValue) ? null : weightValue;
        }
        return null;
      })(),
      shippingClass: shippingClass || null,
      availableDate: availableDate ? new Date(availableDate) : null,
      customImages: customImages,
      pricingStrategy: pricingStrategy,
      markupValue: markupValue ? parseFloat(markupValue) : null,
      lastSyncedAt: new Date(),
      cjData: cjProduct,
    };

    // Update or create product (scope by store for multi-tenant)
    const upsertFilter = { cjProductId: productData.cjProductId };
    if (targetStoreId) {
      upsertFilter.storeId = { $in: [targetStoreId, null] };
    }
    product = await Product.findOneAndUpdate(
      upsertFilter,
      productData,
      { upsert: true, new: true }
    );

    // Populate category for response
    await product.populate('category', 'name slug');

    logger.info('Product added to store', { 
      cjProductId, 
      productId: product._id, 
      price: finalPrice,
      pricingStrategy,
      categoryId 
    });

    res.status(200).json({
      success: true,
      message: 'Product added to store successfully',
      data: product,
    });
  } catch (error) {
    logger.error('Error adding product from CJ', { 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to add product to store',
      error: error.message,
    });
  }
};

/**
 * Update product price
 * PUT /api/v1/admin/products/:id/price (Admin only)
 */
exports.updateProductPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { price } = req.body;

    if (!price || price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid price is required',
      });
    }

    const productFilter = getStoreFilter(req.storeId);
    const product = await Product.findOneAndUpdate(
      { _id: id, ...productFilter },
      { price: parseFloat(price) },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product price updated successfully',
      data: product,
    });
  } catch (error) {
    logger.error('Error updating product price', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update product price',
      error: error.message,
    });
  }
};

/**
 * Sync product from CJ (update existing product data)
 * POST /api/v1/products/:id/sync (Admin only)
 */
exports.syncProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const productFilter = getStoreFilter(req.storeId);

    // Get product to find CJ product ID
    const product = await Product.findOne({
      $or: [{ _id: id }, { cjProductId: id }],
      ...productFilter,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const cjProductId = product.cjProductId || id;
    const syncedProduct = await cjProductService.syncProduct(cjProductId);

    res.status(200).json({
      success: true,
      message: 'Product synced successfully',
      data: syncedProduct,
    });
  } catch (error) {
    logger.error('Error syncing product', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to sync product',
      error: error.message,
    });
  }
};

/**
 * Update product (full) - Admin only
 * PUT /api/v1/products/admin/:id
 */
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      'name', 'description', 'images', 'category', 'categoryName', 'brand', 'sku',
      'price', 'compareAtPrice', 'suggestedPrice', 'status', 'visibility', 'isAvailable',
      'stock', 'tags', 'slug', 'metaTitle', 'metaDescription', 'focusKeyword', 'keywords', 'trackInventory',
      'lowStockThreshold', 'shippingWeight', 'shippingClass', 'availableDate', 'weight', 'dimensions'
    ];
    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        if (key === 'category' && (req.body[key] === '' || req.body[key] === null)) {
          updates[key] = null;
        } else {
          updates[key] = req.body[key];
        }
      }
    });
    const productFilter = getStoreFilter(req.storeId);
    const product = await Product.findOneAndUpdate({ _id: id, ...productFilter }, updates, { new: true })
      .populate('category', 'name slug');
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.status(200).json({ success: true, message: 'Product updated', data: product });
  } catch (error) {
    logger.error('Error updating product', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update product',
      error: error.message,
    });
  }
};

/**
 * Admin: Upsert translation for a product
 * PUT /api/v1/products/admin/:id/translations/:locale
 */
exports.updateProductTranslation = async (req, res) => {
  try {
    const { id, locale } = req.params;
    const { name, slug, description, metaTitle, metaDescription, focusKeyword, keywords } = req.body || {};

    if (!locale) {
      return res.status(400).json({
        success: false,
        message: 'Locale is required',
      });
    }

    const productFilter = getStoreFilter(req.storeId);
    const product = await Product.findOne({ _id: id, ...productFilter });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Enforce uniqueness of slug per locale within the same store
    if (slug) {
      const slugConflict = await Product.findOne({
        _id: { $ne: product._id },
        storeId: product.storeId || null,
        translations: { $elemMatch: { locale, slug } },
      }).lean();

      if (slugConflict) {
        return res.status(400).json({
          success: false,
          message: 'A product with this slug already exists for the selected locale',
        });
      }
    }

    if (!Array.isArray(product.translations)) {
      product.translations = [];
    }

    const existing = product.translations.find((t) => t.locale === locale);

    if (existing) {
      if (name !== undefined) existing.name = name;
      if (slug !== undefined) existing.slug = slug;
      if (description !== undefined) existing.description = description;
      if (metaTitle !== undefined) existing.metaTitle = metaTitle;
      if (metaDescription !== undefined) existing.metaDescription = metaDescription;
      if (focusKeyword !== undefined) existing.focusKeyword = focusKeyword;
      if (keywords !== undefined) existing.keywords = keywords;
    } else {
      product.translations.push({
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

    await product.save();

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Error updating product translation', { error: error.message, productId: req.params.id });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update product translation',
      error: error.message,
    });
  }
};

/**
 * Delete product - Admin only
 * DELETE /api/v1/products/admin/:id
 */
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const productFilter = getStoreFilter(req.storeId);
    const product = await Product.findOneAndDelete({ _id: id, ...productFilter });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.status(200).json({ success: true, message: 'Product deleted' });
  } catch (error) {
    logger.error('Error deleting product', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to delete product',
      error: error.message,
    });
  }
};

/**
 * Admin: Get CJ stock by pid, vid, or sku (proxy to CJ API)
 * GET /api/v1/admin/cj/stock?pid=... | ?vid=... | ?sku=...
 */
exports.getCjStock = async (req, res) => {
  try {
    const { pid, vid, sku } = req.query;
    if (pid) {
      const data = await cjProductService.getInventoryByPid(pid);
      return res.status(200).json({ success: true, data: data?.data ?? data, source: 'getInventoryByPid' });
    }
    if (vid) {
      const data = await cjProductService.getStockByVid(vid);
      return res.status(200).json({ success: true, data: data?.data ?? data, source: 'queryByVid' });
    }
    if (sku) {
      const data = await cjProductService.getStockBySku(sku);
      return res.status(200).json({ success: true, data: data?.data ?? data, source: 'queryBySku' });
    }
    return res.status(400).json({
      success: false,
      message: 'Provide one of: pid, vid, or sku',
    });
  } catch (error) {
    logger.error('Error getting CJ stock', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get CJ stock',
      error: error.message,
    });
  }
};