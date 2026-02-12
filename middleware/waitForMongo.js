const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const MONGO_READY_STATE = 1; // connected
const TIMEOUT_MS = 15000;

let connectPromise = null;

/**
 * Wait for MongoDB connection before handling requests.
 * Critical for Vercel serverless where cold starts can serve requests before mongoose connects.
 */
async function waitForMongo(req, res, next) {
  if (mongoose.connection.readyState === MONGO_READY_STATE) {
    return next();
  }

  if (!connectPromise) {
    connectPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('MongoDB connection timeout'));
      }, TIMEOUT_MS);

      const onOpen = () => {
        clearTimeout(timeout);
        mongoose.connection.removeListener('error', onError);
        resolve();
      };

      const onError = (err) => {
        clearTimeout(timeout);
        mongoose.connection.removeListener('open', onOpen);
        reject(err);
      };

      mongoose.connection.once('open', onOpen);
      mongoose.connection.once('error', onError);
    });
  }

  try {
    await connectPromise;
    next();
  } catch (error) {
    logger.error('MongoDB not ready', { error: error.message });
    next(error);
  }
}

module.exports = { waitForMongo };
