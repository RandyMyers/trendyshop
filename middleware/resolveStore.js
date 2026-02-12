const Store = require('../models/Store');
const mongoose = require('mongoose');

/**
 * Normalize host for domain matching (strip port, lowercase).
 */
function normalizeHost(host) {
  if (!host || typeof host !== 'string') return '';
  return host.split(':')[0].toLowerCase().trim();
}

/**
 * Resolve store for the request.
 * - Admin: Use X-Store-Id header or ?storeId= query param.
 * - Storefront: Map req.headers.host to Store via Store.domains.
 * - Falls back to default store.
 * Attaches req.store and req.storeId for downstream use.
 */
async function resolveStore(req, res, next) {
  try {
    const headerStoreId = req.get('X-Store-Id');
    const queryStoreId = req.query.storeId;
    const storeId = headerStoreId || queryStoreId;

    // 1. Admin: explicit store ID
    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
      const store = await Store.findById(storeId).lean();
      if (store && store.isActive) {
        req.store = store;
        req.storeId = store._id;
        return next();
      }
    }

    // 2. Storefront: host-based mapping via Store.domains
    const host = normalizeHost(req.headers.host);
    if (host) {
      const store = await Store.findOne({
        domains: host,
        isActive: true,
      }).lean();
      if (store) {
        req.store = store;
        req.storeId = store._id;
        return next();
      }
    }

    // 3. Fall back to default store
    const defaultStore = await Store.getDefaultStore();
    req.store = defaultStore;
    req.storeId = defaultStore._id;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * For admin routes: include legacy data (storeId: null) when viewing default store.
 * Returns a MongoDB filter: { storeId: { $in: [id, null] } } or { storeId: id }
 */
function getStoreFilter(storeId, includeLegacy = true) {
  if (!storeId) return {};
  const defaultStoreSlug = 'default';
  // We'd need to know if this is the default store - for now include null when includeLegacy
  if (includeLegacy) {
    return { storeId: { $in: [storeId, null] } };
  }
  return { storeId };
}

/**
 * Like resolveStore but never fails - on error, continues with req.store/req.storeId = null.
 * Use for public routes (e.g. categories) that must work even without a store.
 */
async function optionalResolveStore(req, res, next) {
  try {
    await resolveStore(req, res, next);
  } catch (error) {
    req.store = null;
    req.storeId = null;
    next();
  }
}

module.exports = { resolveStore, optionalResolveStore, getStoreFilter };
