const ContactInfo = require('../models/ContactInfo');

/**
 * Get public store settings for storefront (no auth).
 * Resolves store from Host header via resolveStore middleware.
 * Returns name, description, contact info, meta verification tags.
 */
exports.getPublicSettings = async (req, res) => {
  try {
    const store = req.store;
    const storeId = req.storeId;

    if (!store) {
      return res.status(400).json({
        success: false,
        message: 'Store could not be determined',
      });
    }

    let address = '';
    let phone = '';
    let email = '';

    if (storeId) {
      const contact = await ContactInfo.findOne({ storeId }).lean();
      if (contact) {
        address = contact.address || '';
        phone = contact.phone || '';
        email = contact.email || '';
      }
    }

    const metaVerification = store.metaVerification || {};
    const data = {
      name: store.name || '',
      description: store.description || '',
      address,
      phone,
      email,
      metaVerification: {
        google: metaVerification.google || '',
        bing: metaVerification.bing || '',
        yandex: metaVerification.yandex || '',
        pinterest: metaVerification.pinterest || '',
        facebook: metaVerification.facebook || '',
        custom: Array.isArray(metaVerification.custom) ? metaVerification.custom : [],
      },
    };

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch store settings',
      error: error.message,
    });
  }
};
