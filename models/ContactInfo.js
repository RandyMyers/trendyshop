const mongoose = require('mongoose');

const contactInfoSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
    },
    email: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    translations: [
      {
        locale: {
          type: String,
          required: true,
        },
        address: {
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

contactInfoSchema.index({ storeId: 1 }, { unique: true });

module.exports = mongoose.model('ContactInfo', contactInfoSchema);
