const AboutUs = require('../models/AboutUs');
const ShippingInfo = require('../models/ShippingInfo');
const ReturnsPolicy = require('../models/ReturnsPolicy');
const PrivacyPolicy = require('../models/PrivacyPolicy');
const TermsAndConditions = require('../models/TermsAndConditions');
const StoreFAQ = require('../models/StoreFAQ');
const ContactInfo = require('../models/ContactInfo');

// Map content type to model
const contentModels = {
  about: AboutUs,
  shipping: ShippingInfo,
  returns: ReturnsPolicy,
  privacy: PrivacyPolicy,
  terms: TermsAndConditions,
  faq: StoreFAQ,
  contact: ContactInfo,
};

/**
 * Get all content for a store (admin)
 * GET /api/v1/admin/stores/:storeId/content
 */
exports.getAllContent = async (req, res) => {
  try {
    const { storeId } = req.params;

    const [about, shipping, returns, privacy, terms, faq, contact] = await Promise.all([
      AboutUs.findOne({ storeId }).lean(),
      ShippingInfo.findOne({ storeId }).lean(),
      ReturnsPolicy.findOne({ storeId }).lean(),
      PrivacyPolicy.findOne({ storeId }).lean(),
      TermsAndConditions.findOne({ storeId }).lean(),
      StoreFAQ.findOne({ storeId }).lean(),
      ContactInfo.findOne({ storeId }).lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        about,
        shipping,
        returns,
        privacy,
        terms,
        faq,
        contact,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch store content',
      error: error?.message,
    });
  }
};

/**
 * Update or create content for a store (admin)
 * PUT /api/v1/admin/stores/:storeId/content/:type
 * type: 'about', 'shipping', 'returns', 'privacy', 'terms', 'faq', 'contact'
 */
exports.updateContent = async (req, res) => {
  try {
    const { storeId, type } = req.params;
    const { content, email, phone, address } = req.body;

    const Model = contentModels[type];
    if (!Model) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content type',
      });
    }

    let doc = await Model.findOne({ storeId });

    if (!doc) {
      // Create new
      const data = { storeId };
      if (type === 'contact') {
        data.email = email || '';
        data.phone = phone || '';
        data.address = address || '';
      } else {
        data.content = content || '';
      }
      doc = await Model.create(data);
    } else {
      // Update existing
      if (type === 'contact') {
        if (email !== undefined) doc.email = email;
        if (phone !== undefined) doc.phone = phone;
        if (address !== undefined) doc.address = address;
      } else {
        if (content !== undefined) doc.content = content;
      }
      await doc.save();
    }

    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update content',
      error: error?.message,
    });
  }
};

/**
 * Update translation for content (admin)
 * PUT /api/v1/admin/stores/:storeId/content/:type/translations/:locale
 */
exports.updateTranslation = async (req, res) => {
  try {
    const { storeId, type, locale } = req.params;
    const { content, address } = req.body;

    const Model = contentModels[type];
    if (!Model) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content type',
      });
    }

    let doc = await Model.findOne({ storeId });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Content not found. Please create default content first.',
      });
    }

    // Find or create translation
    const existingIdx = doc.translations.findIndex((t) => t.locale === locale);

    if (type === 'contact') {
      const translation = { locale, address: address || '' };
      if (existingIdx >= 0) {
        doc.translations[existingIdx] = translation;
      } else {
        doc.translations.push(translation);
      }
    } else {
      const translation = { locale, content: content || '' };
      if (existingIdx >= 0) {
        doc.translations[existingIdx] = translation;
      } else {
        doc.translations.push(translation);
      }
    }

    await doc.save();

    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update translation',
      error: error?.message,
    });
  }
};

/**
 * Get content for storefront (public)
 * GET /api/v1/content/:type?locale=en-US
 */
exports.getPublicContent = async (req, res) => {
  try {
    const { type } = req.params;
    const locale = req.query.locale || 'en-US';
    const storeId = req.storeId; // From resolveStore middleware

    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: 'Store could not be determined',
      });
    }

    const Model = contentModels[type];
    if (!Model) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content type',
      });
    }

    const doc = await Model.findOne({ storeId }).lean();

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      });
    }

    // Find translation or use default
    let result;
    if (type === 'contact') {
      result = {
        email: doc.email,
        phone: doc.phone,
        address: doc.address,
      };

      if (locale !== 'en-US' && doc.translations) {
        const translation = doc.translations.find((t) => t.locale === locale);
        if (translation && translation.address) {
          result.address = translation.address;
        }
      }
    } else {
      result = {
        content: doc.content,
      };

      if (locale !== 'en-US' && doc.translations) {
        const translation = doc.translations.find((t) => t.locale === locale);
        if (translation && translation.content) {
          result.content = translation.content;
        }
      }
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch content',
      error: error?.message,
    });
  }
};
