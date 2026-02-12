const cjAuthService = require('./cjAuthService');
const Product = require('../models/Product');
const { logger } = require('../utils/logger');

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

class CjProductService {
  /**
   * Query products from CJ API
   */
  async queryProducts(params = {}) {
    try {
      const {
        pageNum = 1,
        pageSize = 20,
        categoryId = '',
        keyword = '',
        sortType = 'POPULARITY_DESC',
      } = params;

      // Build query parameters for GET request
      const queryParams = new URLSearchParams();
      queryParams.append('page', pageNum.toString());
      queryParams.append('size', pageSize.toString());
      
      if (keyword) {
        queryParams.append('keyWord', keyword);
      }
      
      if (categoryId) {
        queryParams.append('categoryId', categoryId);
      }

      // Map sortType to CJ API format
      // CJ API: orderBy (0=best match, 1=listing count, 2=sell price, 3=create time, 4=inventory)
      // sort: desc/asc
      let orderBy = '0'; // default: best match
      let sort = 'desc';
      
      if (sortType === 'PRICE_ASC') {
        orderBy = '2';
        sort = 'asc';
      } else if (sortType === 'PRICE_DESC') {
        orderBy = '2';
        sort = 'desc';
      } else if (sortType === 'POPULARITY_DESC') {
        orderBy = '1';
        sort = 'desc';
      } else if (sortType === 'NEWEST') {
        orderBy = '3';
        sort = 'desc';
      } else if (sortType === 'INVENTORY_DESC') {
        orderBy = '4';
        sort = 'desc';
      }
      
      queryParams.append('orderBy', orderBy);
      queryParams.append('sort', sort);

      // Use GET request with query parameters
      const queryString = queryParams.toString();
      const endpoint = `/product/listV2${queryString ? `?${queryString}` : ''}`;

      const response = await cjAuthService.makeAuthenticatedRequest(
        'GET',
        endpoint,
        null // No body for GET request
      );

      return response.data || {};
    } catch (error) {
      logger.error('Error querying CJ products', { error: error.message, params });
      throw error;
    }
  }

  /**
   * Get product details by CJ product ID
   */
  async getProductDetails(cjProductId, options = {}) {
    try {
      const { includeVideos = true, includeInventory = true } = options;
      
      // Build query parameters
      const queryParams = new URLSearchParams();
      queryParams.append('pid', cjProductId);
      
      // Add features if requested
      const features = [];
      if (includeVideos) features.push('enable_video');
      if (includeInventory) features.push('enable_inventory');
      
      if (features.length > 0) {
        queryParams.append('features', features.join(','));
      }
      
      const endpoint = `/product/query?${queryParams.toString()}`;
      
      const response = await cjAuthService.makeAuthenticatedRequest(
        'GET',
        endpoint,
        null // No body for GET request
      );

      // Response structure: { code, result, data: { ...product details... } }
      return response.data || null;
    } catch (error) {
      logger.error('Error getting CJ product details', {
        error: error.message,
        cjProductId,
      });
      throw error;
    }
  }

  /**
   * Sync product to local cache
   */
  async syncProduct(cjProductId) {
    try {
      const cjProduct = await this.getProductDetails(cjProductId);

      if (!cjProduct) {
        throw new Error(`Product ${cjProductId} not found`);
      }

      // Get existing product to preserve custom price and isInStore status
      const existingProduct = await Product.findOne({ cjProductId: cjProduct.pid || cjProductId });
      
      // Calculate CJ price (what you pay CJ) - handle string ranges
      let cjPrice = 0;
      const sellPriceValue = cjProduct.sellPrice || cjProduct.price || cjProduct.nowPrice || 0;
      if (typeof sellPriceValue === 'string' && sellPriceValue.includes('-')) {
        // Handle price range - take the minimum (first value)
        const priceRange = sellPriceValue.split('-');
        cjPrice = parseFloat(priceRange[0].trim()) || 0;
      } else {
        cjPrice = parseFloat(sellPriceValue) || 0;
      }
      
      // Map CJ product data to our Product schema
      // Helper function to extract English product name
      const getProductName = (existingName, cjProduct) => {
        // If existing name is English (no Chinese chars and not JSON array), preserve it
        if (existingName && typeof existingName === 'string') {
          const isChineseName = /[\u4e00-\u9fa5]/.test(existingName) || existingName.trim().startsWith('[');
          if (!isChineseName) {
            return existingName;
          }
        }
        
        // Prioritize English names from CJ
        if (cjProduct.productNameEn && typeof cjProduct.productNameEn === 'string') {
          return cjProduct.productNameEn.trim();
        }
        
        if (cjProduct.nameEn && typeof cjProduct.nameEn === 'string') {
          return cjProduct.nameEn.trim();
        }
        
        // Fallback: parse Chinese array if needed
        let chineseName = cjProduct.productName || cjProduct.name || existingName || '';
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

      // Build product images per cjdropshipping.txt: productImage / bigImage (main) + productImageSet (if any) + variants[].variantImage
      const toUrl = (x) => (typeof x === 'string' ? x.trim() : '');
      const mainImageUrl = toUrl(cjProduct.productImage) || toUrl(cjProduct.bigImage);
      const imageUrls = [];
      const imageSeen = new Set();
      if (mainImageUrl) {
        imageUrls.push(mainImageUrl);
        imageSeen.add(mainImageUrl);
      }
      if (Array.isArray(cjProduct.productImageSet) && cjProduct.productImageSet.length > 0) {
        cjProduct.productImageSet.forEach((url) => {
          const u = toUrl(url);
          if (u && !imageSeen.has(u)) {
            imageUrls.push(u);
            imageSeen.add(u);
          }
        });
      }
      (cjProduct.variants || []).forEach((v) => {
        const url = toUrl(v.variantImage || v.variant_image);
        if (url && !imageSeen.has(url)) {
          imageUrls.push(url);
          imageSeen.add(url);
        }
      });
      const productImages = imageUrls.length > 0 ? imageUrls : (Array.isArray(cjProduct.images) && cjProduct.images.length > 0 ? cjProduct.images.map(toUrl).filter(Boolean) : (mainImageUrl ? [mainImageUrl] : []));

      const productData = {
        cjProductId: cjProduct.pid || cjProductId,
        name: getProductName(existingProduct?.name, cjProduct),
        description: cjProduct.description || '',
        images: productImages,
        // Don't set category here - it should be set during product import/creation
        // Preserve existing category if product exists, otherwise set to null
        category: existingProduct?.category || null,
        categoryName: cjProduct.category || cjProduct.threeCategoryName || cjProduct.categoryName || null,
        brand: cjProduct.brand || '',
        sku: cjProduct.sku || '',
        // Preserve existing custom price if product exists, otherwise use CJ price
        price: existingProduct?.price || cjPrice,
        cjPrice: cjPrice, // Store CJ's original price
        compareAtPrice: (() => {
          // Handle compareAtPrice - can be a string range or number
          let comparePrice = cjProduct.originalPrice || cjProduct.price || cjPrice;
          if (typeof comparePrice === 'string' && comparePrice.includes('-')) {
            // If it's a range, take the maximum (last value) for compareAtPrice
            const priceRange = comparePrice.split('-');
            comparePrice = parseFloat(priceRange[priceRange.length - 1].trim()) || cjPrice;
          } else {
            comparePrice = parseFloat(comparePrice) || cjPrice;
          }
          return comparePrice;
        })(),
        // CJ suggested retail price (shown to customers; internal price is in price)
        suggestedPrice: (() => {
          const raw = cjProduct.suggestSellPrice || cjProduct.sugSellPrice;
          if (!raw) return undefined;
          if (typeof raw === 'string' && raw.includes('-')) {
            const parts = raw.split('-');
            return parseFloat(parts[0].trim()) || undefined;
          }
          return parseFloat(raw) || undefined;
        })(),
        currency: cjProduct.currency || 'USD',
        stock: (() => {
          const direct = cjProduct.stock ?? cjProduct.warehouseInventoryNum ?? cjProduct.totalVerifiedInventory ?? 0;
          if (direct > 0) return direct;
          const variants = cjProduct.variants || [];
          const sumVariants = variants.reduce((acc, v) => acc + getVariantStockFromCj(v), 0);
          return sumVariants > 0 ? sumVariants : 0;
        })(),
        isAvailable: cjProduct.isActive !== false,
        // Preserve isInStore status if product exists
        isInStore: existingProduct?.isInStore || false,
        weight: cjProduct.weight || null,
        dimensions: cjProduct.dimensions || null,
        variants: (cjProduct.variants || []).map((variant) => {
          // Calculate variant CJ price (base price for this variant)
          let variantCjPrice = 0;
          const variantSellPriceValue = variant.variantSellPrice || variant.price || 0;
          if (typeof variantSellPriceValue === 'string' && variantSellPriceValue.includes('-')) {
            // Handle price range - take the minimum
            const priceRange = variantSellPriceValue.split('-');
            variantCjPrice = parseFloat(priceRange[0].trim()) || 0;
          } else {
            variantCjPrice = parseFloat(variantSellPriceValue) || 0;
          }
          
          // Get existing variant to preserve price if it exists
          const existingVariant = existingProduct?.variants?.find(
            v => (v.variantId || v.vid) === (variant.vid || variant.variantId || variant.id)
          );
          
          // Parse variant suggested price
          let variantSuggestedPrice = 0;
          if (variant.variantSugSellPrice) {
            if (typeof variant.variantSugSellPrice === 'string' && variant.variantSugSellPrice.includes('-')) {
              const suggestedRange = variant.variantSugSellPrice.split('-');
              variantSuggestedPrice = parseFloat(suggestedRange[0].trim()) || 0;
            } else {
              variantSuggestedPrice = parseFloat(variant.variantSugSellPrice) || 0;
            }
          }
          
          // Calculate variant selling price
          const pricingStrategy = existingProduct?.pricingStrategy || 'suggested';
          const markupValue = existingProduct?.markupValue || 100;
          
          // Check if existing price is actually CJ cost (if it matches CJ cost, recalculate)
          const existingPrice = existingVariant?.price;
          const isExistingPriceCjCost = existingPrice && Math.abs(existingPrice - variantCjPrice) < 0.01;
          
          // For "suggested" strategy, ALWAYS use suggested price (don't preserve existing if it's wrong)
          // Only preserve existing price if it's NOT the CJ cost AND pricing strategy allows it
          let variantFinalPrice = null;
          
          if (pricingStrategy === 'suggested') {
            // For suggested strategy, ALWAYS recalculate to use suggested price
            if (variantSuggestedPrice > 0) {
              variantFinalPrice = variantSuggestedPrice;
            } else {
              // Apply same markup ratio as main product if available
              const mainPrice = existingProduct?.price || cjPrice;
              const mainMarkupRatio = cjPrice > 0 ? mainPrice / cjPrice : 2;
              variantFinalPrice = variantCjPrice * mainMarkupRatio;
            }
          } else if (!isExistingPriceCjCost && existingPrice) {
            // For other strategies, preserve existing price if it's not CJ cost
            variantFinalPrice = existingPrice;
          }
          
          // If no valid existing price, calculate using pricing strategy
          if (!variantFinalPrice && variantCjPrice > 0) {
            switch (pricingStrategy) {
              case 'suggested':
                // Should have been handled above, but fallback
                if (variantSuggestedPrice > 0) {
                  variantFinalPrice = variantSuggestedPrice;
                } else {
                  const mainPrice = existingProduct?.price || cjPrice;
                  const mainMarkupRatio = cjPrice > 0 ? mainPrice / cjPrice : 2;
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
                const mainPriceForRatio = existingProduct?.price || cjPrice;
                const priceRatio = cjPrice > 0 ? mainPriceForRatio / cjPrice : 2;
                variantFinalPrice = variantCjPrice * priceRatio;
                break;
              default:
                // Default 2x markup
                variantFinalPrice = variantCjPrice * 2;
                break;
            }
          }
          
          // Fallback to variant CJ price if no calculation worked (should never happen, but safety)
          if (!variantFinalPrice || variantFinalPrice <= 0) {
            variantFinalPrice = variantCjPrice || cjPrice;
          }
          
          const variantStock = getVariantStockFromCj(variant);
          return {
            variantId: variant.variantId || variant.vid || variant.id,
            name: variant.name || variant.variantNameEn || '',
            price: variantFinalPrice, // Our store price (calculated or preserved)
            cjPrice: variantCjPrice,  // CJ's cost
            suggestedPrice: variantSuggestedPrice, // CJ's suggested price
            stock: variantStock,
            sku: variant.sku || variant.variantSku || '',
          };
        }),
        lastSyncedAt: new Date(),
        cjData: cjProduct, // Store full CJ response
      };

      // Update or create product
      const product = await Product.findOneAndUpdate(
        { cjProductId: productData.cjProductId },
        productData,
        { upsert: true, new: true }
      );

      logger.info('Product synced', { cjProductId, productId: product._id });

      return product;
    } catch (error) {
      logger.error('Error syncing product', { error: error.message, cjProductId });
      throw error;
    }
  }

  /**
   * Sync multiple products
   */
  async syncProducts(cjProductIds) {
    const results = {
      success: [],
      failed: [],
    };

    for (const cjProductId of cjProductIds) {
      try {
        const product = await this.syncProduct(cjProductId);
        results.success.push(product);
      } catch (error) {
        results.failed.push({ cjProductId, error: error.message });
      }
    }

    return results;
  }

  /**
   * Search products from CJ catalog (for browsing - returns raw CJ products)
   */
  async searchCJCatalog(params = {}) {
    try {
      // Check if API key is configured
      const hasApiKey = await cjAuthService.hasApiKey();
      if (!hasApiKey) {
        throw new Error('CJ API key is not configured');
      }

      // Query directly from CJ API without caching
      const cjResponse = await this.queryProducts(params);
      
      // The response from listV2 API has structure: { data: { content: [{ productList: [...] }] } }
      const cjData = cjResponse.data || cjResponse;
      
      // Extract products from content array
      let productsArray = [];
      if (cjData.content && Array.isArray(cjData.content)) {
        // Content is array of objects, each with productList
        productsArray = cjData.content.flatMap(item => {
          if (item.productList && Array.isArray(item.productList)) {
            return item.productList;
          }
          return [];
        });
      } else if (Array.isArray(cjData)) {
        productsArray = cjData;
      } else if (cjData.productList && Array.isArray(cjData.productList)) {
        productsArray = cjData.productList;
      }
      
      // Transform CJ products to a simpler format for browsing
      const formattedProducts = productsArray.map(item => ({
        cjProductId: item.id || item.pid,
        name: item.nameEn || item.productName || item.name,
        sku: item.sku || item.productSku || '',
        cjPrice: parseFloat(item.sellPrice || item.nowPrice || item.price || 0),
        currency: item.currency || 'USD',
        image: item.bigImage || item.productImage || (item.images && Array.isArray(item.images) ? item.images[0] : null),
        category: item.threeCategoryName || item.categoryName || item.category || '',
        stock: item.warehouseInventoryNum || item.totalVerifiedInventory || item.stock || 0,
      }));

      const total = cjData.totalRecords || cjData.total || formattedProducts.length;
      const pageSize = params.pageSize || cjData.pageSize || 20;
      const pageNum = params.pageNum || cjData.pageNumber || 1;
      const totalPages = cjData.totalPages || Math.ceil(total / pageSize);

      return {
        products: formattedProducts,
        total,
        pageNum,
        pageSize,
        totalPages,
      };
    } catch (error) {
      logger.error('Error searching CJ catalog', { 
        error: error.message,
        params,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Search products (combines CJ API query with cached products)
   */
  async searchProducts(params = {}) {
    try {
      // Query from CJ API
      const cjProducts = await this.queryProducts(params);

      // Map CJ product IDs
      const cjProductIds = cjProducts.map((p) => p.pid || p.cjProductId);

      // Sync products to cache
      if (cjProductIds.length > 0) {
        await this.syncProducts(cjProductIds);
      }

      // Return cached products
      const cachedProducts = await Product.find({
        cjProductId: { $in: cjProductIds },
      }).sort({ createdAt: -1 });

      return {
        products: cachedProducts,
        total: cjProducts.total || cachedProducts.length,
        pageNum: params.pageNum || 1,
        pageSize: params.pageSize || 20,
      };
    } catch (error) {
      logger.error('Error searching products', { error: error.message, params });
      throw error;
    }
  }

  /**
   * Get categories
   */
  async getCategories() {
    try {
      // CJ API uses GET for categories endpoint
      const response = await cjAuthService.makeAuthenticatedRequest(
        'GET',
        '/product/getCategory',
        null // No body for GET request
      );

      return response.data || [];
    } catch (error) {
      logger.error('Error getting CJ categories', { error: error.message });
      throw error;
    }
  }

  /**
   * Get freight options for product
   */
  async getFreightOptions(params) {
    try {
      const { productId, variantId, countryCode, quantity = 1 } = params;

      const response = await cjAuthService.makeAuthenticatedRequest(
        'POST',
        '/logistics/queryFreight',
        {
          productId,
          variantId,
          countryCode,
          quantity,
        }
      );

      return response.data || [];
    } catch (error) {
      logger.error('Error getting freight options', {
        error: error.message,
        params,
      });
      throw error;
    }
  }

  /**
   * Get stock by variant ID (CJ API: queryByVid)
   * GET /api2.0/v1/product/stock/queryByVid?vid=...
   */
  async getStockByVid(vid) {
    try {
      const endpoint = `/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`;
      const response = await cjAuthService.makeAuthenticatedRequest('GET', endpoint, null);
      return response.data || null;
    } catch (error) {
      logger.error('Error getting CJ stock by vid', { error: error.message, vid });
      throw error;
    }
  }

  /**
   * Get stock by SKU (CJ API: queryBySku)
   * GET /api2.0/v1/product/stock/queryBySku?sku=...
   */
  async getStockBySku(sku) {
    try {
      const endpoint = `/product/stock/queryBySku?sku=${encodeURIComponent(sku)}`;
      const response = await cjAuthService.makeAuthenticatedRequest('GET', endpoint, null);
      return response.data || null;
    } catch (error) {
      logger.error('Error getting CJ stock by sku', { error: error.message, sku });
      throw error;
    }
  }

  /**
   * Get inventory by product ID (CJ API: getInventoryByPid)
   * GET /api2.0/v1/product/stock/getInventoryByPid?pid=...
   */
  async getInventoryByPid(pid) {
    try {
      const endpoint = `/product/stock/getInventoryByPid?pid=${encodeURIComponent(pid)}`;
      const response = await cjAuthService.makeAuthenticatedRequest('GET', endpoint, null);
      return response.data || null;
    } catch (error) {
      logger.error('Error getting CJ inventory by pid', { error: error.message, pid });
      throw error;
    }
  }
}

module.exports = new CjProductService();

