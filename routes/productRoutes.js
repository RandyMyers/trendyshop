const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const reviewController = require('../controllers/reviewController');
const { authenticate, optionalAuth, hasAdminAccess } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { resolveStore } = require('../middleware/resolveStore');
const productsPermission = requirePermission('products');

// Public routes (with optional auth) - only products in store
// resolveStore runs for store filtering (admin sends X-Store-Id; storefront gets default)
router.get('/', optionalAuth, resolveStore, productController.getProducts);
router.get('/categories', optionalAuth, productController.getCategories);

// Admin routes - CJ catalog browsing (must come before /:id routes)
router.get('/admin/cj-products/search', authenticate, hasAdminAccess, productsPermission, resolveStore, productController.browseCJCatalog);
router.get('/admin/cj-products/:cjProductId', authenticate, hasAdminAccess, productsPermission, resolveStore, productController.getCJProductDetails);

// Admin routes - Store product management
router.post('/admin/add-from-cj', authenticate, hasAdminAccess, productsPermission, resolveStore, productController.addProductFromCJ);
router.put('/admin/:id/price', authenticate, hasAdminAccess, productsPermission, resolveStore, productController.updateProductPrice);
router.put('/admin/:id', authenticate, hasAdminAccess, productsPermission, resolveStore, productController.updateProduct);
router.delete('/admin/:id', authenticate, hasAdminAccess, productsPermission, resolveStore, productController.deleteProduct);
router.put('/admin/:id/translations/:locale', authenticate, hasAdminAccess, productsPermission, resolveStore, productController.updateProductTranslation);

// Public routes with :id (must come after admin routes)
router.get('/filter-options', optionalAuth, resolveStore, productController.getFilterOptions);
router.get('/slug/:slug', optionalAuth, resolveStore, productController.getProductBySlug);
router.get('/:id/reviews', optionalAuth, resolveStore, reviewController.getProductReviews);
router.post('/:id/reviews', authenticate, resolveStore, reviewController.createProductReview);
router.get('/:id', optionalAuth, resolveStore, productController.getProduct);
router.get('/:id/freight', optionalAuth, productController.getFreightOptions);
router.post('/:id/sync', authenticate, hasAdminAccess, productsPermission, resolveStore, productController.syncProduct);

module.exports = router;

