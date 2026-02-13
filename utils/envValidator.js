/**
 * Validates required environment variables at startup.
 * Fail-fast so deployment fails clearly if env vars are missing (e.g. on Vercel).
 */
function validateEnv(config = {}) {
  const { required = [], optional = [], defaults = {} } = config;
  const missing = [];
  const validated = {};

  for (const varName of required) {
    if (!process.env[varName]) {
      missing.push(varName);
    } else {
      validated[varName] = process.env[varName];
    }
  }

  for (const varName of optional) {
    validated[varName] = process.env[varName] || defaults[varName];
  }

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((v) => console.error(`  - ${v}`));
    console.error('Set these in Vercel Dashboard → Settings → Environment Variables');
    process.exit(1);
  }

  if (validated.MONGO_URL && !validated.MONGO_URL.startsWith('mongodb')) {
    console.warn('MONGO_URL does not appear to be a valid MongoDB connection string');
  }

  return validated;
}

module.exports = { validateEnv };
