module.exports = {
  // Order statuses
  ORDER_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
    PAYMENT_FAILED: 'payment_failed',
  },

  // Payment statuses
  PAYMENT_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded',
  },

  // Payment method types
  PAYMENT_METHOD_TYPES: {
    FLUTTERWAVE: 'flutterwave',
    STRIPE: 'stripe',
    PAYPAL: 'paypal',
  },

  // User roles
  USER_ROLES: {
    CUSTOMER: 'customer',
    ADMIN: 'admin',
  },

  // Pagination defaults
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },
};




