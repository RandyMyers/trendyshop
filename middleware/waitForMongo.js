const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const MONGO_READY_STATE = 1; // connected
const MONGO_CONNECTING = 2;
const TIMEOUT_MS = 45000; // Allow enough time for slow/local MongoDB

let connectPromise = null;

/**
 * Wait for MongoDB connection before handling requests.
 * Critical for Vercel serverless where cold starts can serve requests before mongoose connects.
 */
async function waitForMongo(req, res, next) {
  if (mongoose.connection.readyState === MONGO_READY_STATE) {
    return next();
  }

  // If already connecting, reuse the same promise; if we previously failed, allow retry
  if (connectPromise && mongoose.connection.readyState === MONGO_CONNECTING) {
    try {
      await connectPromise;
      return next();
    } catch (error) {
      logger.error('MongoDB not ready', { error: error.message });
      return next(error);
    }
  }

  if (!connectPromise || mongoose.connection.readyState === 0) {
    connectPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        connectPromise = null;
        reject(new Error('MongoDB connection timeout. Check MONGO_URL and that MongoDB is running.'));
      }, TIMEOUT_MS);

      const onOpen = () => {
        clearTimeout(timeout);
        mongoose.connection.removeListener('error', onError);
        resolve();
      };

      const onError = (err) => {
        clearTimeout(timeout);
        mongoose.connection.removeListener('open', onOpen);
        connectPromise = null;
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
