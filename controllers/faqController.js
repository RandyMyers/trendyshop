const Faq = require('../models/Faq');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

/**
 * Admin: List FAQs
 * GET /api/v1/admin/faqs
 */
exports.getAdminFaqs = async (req, res) => {
  try {
    const { category, isActive } = req.query;
    const faqFilter = getStoreFilter(req.storeId);
    const query = { ...faqFilter };
    if (category) query.category = category;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const faqs = await Faq.find(query).sort({ sortOrder: 1, createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: faqs,
    });
  } catch (error) {
    logger.error('Error getting FAQs', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get FAQs',
      error: error.message,
    });
  }
};

/**
 * Admin: Create FAQ
 * POST /api/v1/admin/faqs
 */
exports.createFaq = async (req, res) => {
  try {
    const { question, answer, category, sortOrder, isActive } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        message: 'Question and answer are required',
      });
    }

    const faq = await Faq.create({
      ...(req.storeId && { storeId: req.storeId }),
      question: question.trim(),
      answer: answer.trim(),
      category: (category || 'general').trim(),
      sortOrder: parseInt(sortOrder, 10) || 0,
      isActive: isActive !== false,
    });

    res.status(201).json({
      success: true,
      message: 'FAQ created successfully',
      data: faq,
    });
  } catch (error) {
    logger.error('Error creating FAQ', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create FAQ',
      error: error.message,
    });
  }
};

/**
 * Admin: Update FAQ
 * PUT /api/v1/admin/faqs/:id
 */
exports.updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, sortOrder, isActive } = req.body;

    const faqFilter = getStoreFilter(req.storeId);
    const faq = await Faq.findOne({ _id: id, ...faqFilter });
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found',
      });
    }

    if (question !== undefined) faq.question = question.trim();
    if (answer !== undefined) faq.answer = answer.trim();
    if (category !== undefined) faq.category = category.trim();
    if (sortOrder !== undefined) faq.sortOrder = parseInt(sortOrder, 10) || 0;
    if (isActive !== undefined) faq.isActive = isActive;

    await faq.save();

    res.status(200).json({
      success: true,
      message: 'FAQ updated successfully',
      data: faq,
    });
  } catch (error) {
    logger.error('Error updating FAQ', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update FAQ',
      error: error.message,
    });
  }
};

/**
 * Admin: Delete FAQ
 * DELETE /api/v1/admin/faqs/:id
 */
exports.deleteFaq = async (req, res) => {
  try {
    const { id } = req.params;

    const faqFilter = getStoreFilter(req.storeId);
    const faq = await Faq.findOneAndDelete({ _id: id, ...faqFilter });
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'FAQ deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting FAQ', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete FAQ',
      error: error.message,
    });
  }
};

/**
 * Public: List active FAQs (for client storefront)
 * GET /api/v1/faqs
 */
exports.getPublicFaqs = async (req, res) => {
  try {
    const { category } = req.query;
    const faqFilter = getStoreFilter(req.storeId);
    const query = { ...faqFilter, isActive: true };
    if (category) query.category = category;

    const faqs = await Faq.find(query).sort({ sortOrder: 1, createdAt: -1 }).select('question answer category').lean();

    res.status(200).json({
      success: true,
      data: faqs,
    });
  } catch (error) {
    logger.error('Error getting public FAQs', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get FAQs',
      error: error.message,
    });
  }
};
