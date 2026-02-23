const Store = require('../models/Store');
const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

function normalizeMetaVerification(mv) {
  if (!mv || typeof mv !== 'object') return {};
  const custom = Array.isArray(mv.custom)
    ? mv.custom.filter((c) => c && c.name && c.content).map((c) => ({ name: String(c.name).trim(), content: String(c.content).trim() }))
    : [];
  return {
    google: mv.google ? String(mv.google).trim() : '',
    bing: mv.bing ? String(mv.bing).trim() : '',
    yandex: mv.yandex ? String(mv.yandex).trim() : '',
    pinterest: mv.pinterest ? String(mv.pinterest).trim() : '',
    facebook: mv.facebook ? String(mv.facebook).trim() : '',
    custom,
  };
}

/**
 * List all stores (admin)
 * GET /api/v1/admin/stores
 */
exports.getStores = async (req, res) => {
  try {
    const stores = await Store.find().sort({ name: 1 }).lean();
    res.status(200).json({ success: true, data: stores });
  } catch (error) {
    logger.error('Error getting stores', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get stores',
      error: error.message,
    });
  }
};

/**
 * Get single store (admin)
 * GET /api/v1/admin/stores/:id
 */
exports.getStore = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid store ID' });
    }
    const store = await Store.findById(id).lean();
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }
    res.status(200).json({ success: true, data: store });
  } catch (error) {
    logger.error('Error getting store', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get store',
      error: error.message,
    });
  }
};

/**
 * Create store (admin)
 * POST /api/v1/admin/stores
 */
exports.createStore = async (req, res) => {
  try {
    const { name, slug, domains, defaultCurrency, defaultCountry, isActive, niche, description, metaVerification } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ success: false, message: 'Name and slug are required' });
    }
    const normalizedSlug = String(slug).toLowerCase().trim().replace(/\s+/g, '-');
    if (normalizedSlug === 'default') {
      return res.status(400).json({ success: false, message: 'Slug "default" is reserved' });
    }
    const existing = await Store.findOne({ slug: normalizedSlug });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A store with this slug already exists' });
    }
    const store = await Store.create({
      name: name.trim(),
      slug: normalizedSlug,
      domains: Array.isArray(domains) ? domains.filter(Boolean).map((d) => String(d).trim()) : [],
      defaultCurrency: defaultCurrency || 'USD',
      defaultCountry: defaultCountry || 'US',
      isActive: isActive !== false,
      niche: niche ? String(niche).toLowerCase().trim() : null,
      description: description ? String(description).trim() : '',
      metaVerification: normalizeMetaVerification(metaVerification),
    });
    res.status(201).json({ success: true, data: store });
  } catch (error) {
    logger.error('Error creating store', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create store',
      error: error.message,
    });
  }
};

/**
 * Update store (admin)
 * PUT /api/v1/admin/stores/:id
 */
exports.updateStore = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, domains, defaultCurrency, defaultCountry, isActive, niche, description, metaVerification } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid store ID' });
    }
    const store = await Store.findById(id);
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }
    const isDefaultStore = store.slug === 'default';
    if (name != null && !isDefaultStore) store.name = name.trim();
    if (slug != null && !isDefaultStore) {
      const normalizedSlug = String(slug).toLowerCase().trim().replace(/\s+/g, '-');
      const existing = await Store.findOne({ slug: normalizedSlug, _id: { $ne: id } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'A store with this slug already exists' });
      }
      store.slug = normalizedSlug;
    }
    if (domains !== undefined && !isDefaultStore) store.domains = Array.isArray(domains) ? domains.filter(Boolean).map((d) => String(d).trim()) : [];
    if (defaultCurrency != null && !isDefaultStore) store.defaultCurrency = defaultCurrency;
    if (defaultCountry != null && !isDefaultStore) store.defaultCountry = defaultCountry;
    if (typeof isActive === 'boolean' && !isDefaultStore) store.isActive = isActive;
    if (niche !== undefined && !isDefaultStore) store.niche = niche ? String(niche).toLowerCase().trim() : null;
    if (description !== undefined) store.description = description ? String(description).trim() : '';
    if (metaVerification !== undefined) store.metaVerification = normalizeMetaVerification(metaVerification);
    await store.save();
    res.status(200).json({ success: true, data: store });
  } catch (error) {
    logger.error('Error updating store', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update store',
      error: error.message,
    });
  }
};

/**
 * Delete store (admin)
 * DELETE /api/v1/admin/stores/:id
 */
exports.deleteStore = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid store ID' });
    }
    const store = await Store.findById(id);
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }
    if (store.slug === 'default') {
      return res.status(400).json({ success: false, message: 'Cannot delete the default store' });
    }
    await Store.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Store deleted' });
  } catch (error) {
    logger.error('Error deleting store', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to delete store',
      error: error.message,
    });
  }
};
