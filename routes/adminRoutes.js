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
const { authenticate, isAdmin } = require('../middleware/auth');
const { resolveStore } = require('../middleware/resolveStore');

router.use(authenticate);
router.use(isAdmin);
router.use(resolveStore);

router.get('/stores', storeController.getStores);
router.get('/stores/:id', storeController.getStore);
router.post('/stores', storeController.createStore);
router.put('/stores/:id', storeController.updateStore);

router.get('/dashboard/stats', dashboardController.getDashboardStats);
router.get('/dashboard/trends', dashboardController.getDashboardTrends);
router.get('/cj/balance', dashboardController.getCjBalance);
router.get('/analytics/top-products', analyticsController.getTopProducts);
router.get('/analytics/revenue-by-country', analyticsController.getRevenueByCountry);
router.get('/analytics/revenue-by-payment-method', analyticsController.getRevenueByPaymentMethod);
router.get('/analytics/by-store', analyticsController.getAnalyticsByStore);
router.get('/customers', customerController.getCustomers);
router.get('/customers/ltv-distribution', customerController.getLtvDistribution);
router.post('/customers/backfill-stats', customerController.backfillCustomerStats);
router.get('/customers/by-ip/:ip', customerController.getOrdersByIp);
router.get('/customers/:id/orders', customerController.getCustomerOrders);
router.get('/customers/:id', customerController.getCustomerDetail);
router.get('/orders', orderController.getAdminOrders);
router.get('/orders/:id', orderController.getAdminOrder);
router.post('/orders/:id/mark-paid', orderController.markOrderAsPaid);
router.get('/payments', paymentController.getAdminPayments);
router.get('/users', userController.getAdminUsers);
router.put('/users/:id', userController.updateUser);
router.delete('/users/:id', userController.deleteUser);
router.delete('/stores/:id', storeController.deleteStore);
router.get('/cj/stock', productController.getCjStock);

module.exports = router;
