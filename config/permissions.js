/**
 * Permission keys for admin panel access.
 * Users with role 'admin' have full access; role 'member' (invited users) have only user.permissions.
 */
const ALL_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'stores', label: 'Stores' },
  { key: 'products', label: 'Products' },
  { key: 'categories', label: 'Categories' },
  { key: 'blog', label: 'Blog' },
  { key: 'orders', label: 'Orders' },
  { key: 'payments', label: 'Payments' },
  { key: 'payment_methods', label: 'Payment Methods' },
  { key: 'users', label: 'Users' },
  { key: 'faq', label: 'FAQ' },
  { key: 'coupons', label: 'Coupons' },
  { key: 'cj_config', label: 'CJ Configuration' },
  { key: 'store_content', label: 'Store Content' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'disputes', label: 'Disputes' },
];

const PERMISSION_KEYS = ALL_PERMISSIONS.map((p) => p.key);

function isValidPermission(key) {
  return PERMISSION_KEYS.includes(key);
}

module.exports = {
  ALL_PERMISSIONS,
  PERMISSION_KEYS,
  isValidPermission,
};
