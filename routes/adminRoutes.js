const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const dashboardController = require('../controllers/dashboardController');
const paymentController = require('../controllers/paymentController');
const userController = require('../controllers/userController');
const productController = require('../controllers/productController');
const customerController = require('../controllers/customerController');
const analyticsController = require('../controllers/analyticsController');
const storeController = require('../controllers/storeController');
const { authenticate, hasAdminAccess, requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { resolveStore } = require('../middleware/resolveStore');

router.use(authenticate);
router.use(hasAdminAccess);
router.use(resolveStore);

// Dashboard & analytics
router.get('/dashboard/stats', requirePermission('dashboard'), dashboardController.getDashboardStats);
router.get('/dashboard/trends', requirePermission('dashboard'), dashboardController.getDashboardTrends);
router.get('/cj/balance', requirePermission('dashboard'), dashboardController.getCjBalance);
router.get('/analytics/top-products', requirePermission('dashboard'), analyticsController.getTopProducts);
router.get('/analytics/revenue-by-country', requirePermission('dashboard'), analyticsController.getRevenueByCountry);
router.get('/analytics/revenue-by-payment-method', requirePermission('dashboard'), analyticsController.getRevenueByPaymentMethod);
router.get('/analytics/by-store', requirePermission('dashboard'), analyticsController.getAnalyticsByStore);

// Stores
router.get('/stores', requirePermission('stores'), storeController.getStores);
router.get('/stores/:id', requirePermission('stores'), storeController.getStore);
router.post('/stores', requirePermission('stores'), storeController.createStore);
router.put('/stores/:id', requirePermission('stores'), storeController.updateStore);
router.delete('/stores/:id', requirePermission('stores'), storeController.deleteStore);

// Orders & customers
router.get('/customers', requirePermission('orders'), customerController.getCustomers);
router.get('/customers/ltv-distribution', requirePermission('orders'), customerController.getLtvDistribution);
router.post('/customers/backfill-stats', requirePermission('orders'), customerController.backfillCustomerStats);
router.get('/customers/by-ip/:ip', requirePermission('orders'), customerController.getOrdersByIp);
router.get('/customers/:id/orders', requirePermission('orders'), customerController.getCustomerOrders);
router.get('/customers/:id', requirePermission('orders'), customerController.getCustomerDetail);
router.get('/orders', requirePermission('orders'), orderController.getAdminOrders);
router.get('/orders/:id', requirePermission('orders'), orderController.getAdminOrder);
router.post('/orders/:id/mark-paid', requirePermission('orders'), orderController.markOrderAsPaid);

// Payments
router.get('/payments', requirePermission('payments'), paymentController.getAdminPayments);

// Users (full admin only)
router.post('/users/invite', requireAdmin, userController.inviteUser);
router.get('/users', requireAdmin, userController.getAdminUsers);
router.put('/users/:id', requireAdmin, userController.updateUser);
router.delete('/users/:id', requireAdmin, userController.deleteUser);

// Products (CJ stock)
router.get('/cj/stock', requirePermission('products'), productController.getCjStock);

module.exports = router;
