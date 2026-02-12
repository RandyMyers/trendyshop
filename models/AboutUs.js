const mongoose = require('mongoose');

const aboutUsSchema = new mongoose.Schema(
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

// Index for unique store
aboutUsSchema.index({ storeId: 1 }, { unique: true });

module.exports = mongoose.model('AboutUs', aboutUsSchema);
