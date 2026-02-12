const mongoose = require('mongoose');

const termsAndConditionsSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
    },
    content: {
      type: String,
      default: '',
    },
    translations: [
      {
        locale: {
          type: String,
          required: true,
        },
        content: {
          type: String,
          default: '',
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

termsAndConditionsSchema.index({ storeId: 1 }, { unique: true });

module.exports = mongoose.model('TermsAndConditions', termsAndConditionsSchema);
