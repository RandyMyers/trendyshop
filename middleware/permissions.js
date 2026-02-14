const { isValidPermission } = require('../config/permissions');

/**
 * Require a specific permission. Pass if user is admin (full access) or member with permission.
 * Must be used after authenticate middleware.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (req.user.role === 'admin') {
      return next();
    }
    if (req.user.role === 'member' && Array.isArray(req.user.permissions) && req.user.permissions.includes(permission)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'Access denied. Missing permission.',
    });
  };
}

/**
 * Validate permissions array (e.g. from invite/edit body). Only 'users' is restricted to full admins when granting.
 */
function validatePermissions(permissions, allowUsersPermission = false) {
  if (!Array.isArray(permissions)) return [];
  const filtered = permissions.filter((p) => typeof p === 'string' && isValidPermission(p));
  if (!allowUsersPermission) {
    return filtered.filter((p) => p !== 'users');
  }
  return filtered;
}

module.exports = {
  requirePermission,
  validatePermissions,
};
