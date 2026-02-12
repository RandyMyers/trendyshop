const mongoose = require('mongoose');

const cjTokenSchema = new mongoose.Schema(
  {
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    tokenType: {
      type: String,
      default: 'Bearer',
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one token document exists
cjTokenSchema.statics.getLatestToken = async function () {
  return await this.findOne().sort({ createdAt: -1 });
};

cjTokenSchema.statics.saveToken = async function (tokenData) {
  // Delete old tokens
  await this.deleteMany({});
  
  // Save new token
  return await this.create({
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
    tokenType: tokenData.token_type || 'Bearer',
  });
};

module.exports = mongoose.model('CjToken', cjTokenSchema);




