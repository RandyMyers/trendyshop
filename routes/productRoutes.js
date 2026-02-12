const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const reviewController = require('../controllers/reviewController');
const { authenticate, optionalAuth, isAdmin } = require('../middleware/auth');
const { resolveStore } = require('../middleware/resolveStore');

// Public routes (with optional auth) - only products in store
// resolveStore runs for store filtering (admin sends X-Store-Id; storefront gets default)
router.get('/', optionalAuth, resolveStore, productController.getProducts);
router.get('/categories', optionalAuth, productController.getCategories);

// Admin routes - CJ catalog browsing (must come before /:id routes)
router.get('/admin/cj-products/search', authenticate, isAdmin, resolveStore, productController.browseCJCatalog);
router.get('/admin/cj-products/:cjProductId', authenticate, isAdmin, resolveStore, productController.getCJProductDetails);

// Admin routes - Store product management
router.post('/admin/add-from-cj', authenticate, isAdmin, resolveStore, productController.addProductFromCJ);
router.put('/admin/:id/price', authenticate, isAdmin, resolveStore, productController.updateProductPrice);
router.put('/admin/:id', authenticate, isAdmin, resolveStore, productController.updateProduct);
router.delete('/admin/:id', authenticate, isAdmin, resolveStore, productController.deleteProduct);
router.put('/admin/:id/translations/:locale', authenticate, isAdmin, resolveStore, productController.updateProductTranslation);

// Public routes with :id (must come after admin routes)
router.get('/filter-options', optionalAuth, resolveStore, productController.getFilterOptions);
router.get('/slug/:slug', optionalAuth, resolveStore, productController.getProductBySlug);
router.get('/:id/reviews', optionalAuth, resolveStore, reviewController.getProductReviews);
router.post('/:id/reviews', authenticate, resolveStore, reviewController.createProductReview);
router.get('/:id', optionalAuth, resolveStore, productController.getProduct);
router.get('/:id/freight', optionalAuth, productController.getFreightOptions);
router.post('/:id/sync', authenticate, isAdmin, resolveStore, productController.syncProduct);

module.exports = router;

