/**
 * Migration script: Move products from top-level Men/Women to subcategories.
 *
 * Run AFTER: npm run check:categories (review current state)
 * Run: npm run migrate:categories
 *
 * Logic:
 * - Products in top-level Men → try to match categoryName to subcategory, else Men's Shirts
 * - Products in top-level Women → try to match categoryName to subcategory, else Dresses
 * - Products in top-level Accessories → stay as-is (or move to subcategory if we add one)
 * - Products in existing subcategories → unchanged
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Category = require('../models/Category');
const Product = require('../models/Product');

dotenv.config();

// Keywords in product categoryName -> target subcategory slug
const MEN_KEYWORD_MAP = {
  blazer: 'blazers',
  jacket: 'jackets',
  coat: 'jackets',
  shirt: 'shirts',
  suit: 'suits',
  trouser: 'trousers',
  pant: 'trousers',
  accessory: 'mens-accessories',
  tie: 'mens-accessories',
  belt: 'mens-accessories',
};

const WOMEN_KEYWORD_MAP = {
  blazer: 'womens-blazers',
  jacket: 'womens-jackets',
  coat: 'womens-jackets',
  dress: 'dresses',
  blouse: 'blouses-tops',
  top: 'blouses-tops',
  skirt: 'skirts',
  accessory: 'womens-accessories',
  bag: 'womens-accessories',
  jewelry: 'womens-accessories',
};

const MEN_DEFAULT_SUBCATEGORY_SLUG = 'shirts';
const WOMEN_DEFAULT_SUBCATEGORY_SLUG = 'dresses';

const findSubcategoryByKeyword = (keyword, slugMap) => {
  if (!keyword || typeof keyword !== 'string') return null;
  const lower = keyword.toLowerCase();
  for (const [kw, slug] of Object.entries(slugMap)) {
    if (lower.includes(kw)) return slug;
  }
  return null;
};

const migrate = async (dryRun = true) => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
    });

    console.log('Connected to MongoDB');
    console.log(dryRun ? '\n--- DRY RUN (no changes) ---\n' : '\n--- MIGRATING ---\n');

    const men = await Category.findOne({ slug: 'men', parentCategory: null }).lean();
    const women = await Category.findOne({ slug: 'women', parentCategory: null }).lean();

    if (!men) console.log('⚠ Men category not found. Run seed:categories first.');
    if (!women) console.log('⚠ Women category not found. Run seed:categories first.');

    const menSubs = await Category.find({ parentCategory: men?._id }).lean();
    const womenSubs = await Category.find({ parentCategory: women?._id }).lean();

    const menSubBySlug = Object.fromEntries(menSubs.map((s) => [s.slug, s._id]));
    const womenSubBySlug = Object.fromEntries(womenSubs.map((s) => [s.slug, s._id]));

    let migratedCount = 0;
    const stats = { men: { matched: 0, defaulted: 0 }, women: { matched: 0, defaulted: 0 } };

    for (const [parentName, parent, slugMap, defaultSlug, subBySlug] of [
      ['Men', men, MEN_KEYWORD_MAP, MEN_DEFAULT_SUBCATEGORY_SLUG, menSubBySlug],
      ['Women', women, WOMEN_KEYWORD_MAP, WOMEN_DEFAULT_SUBCATEGORY_SLUG, womenSubBySlug],
    ]) {
      if (!parent) continue;

      const products = await Product.find({ category: parent._id }).lean();
      console.log(`\n${parentName}: ${products.length} products in top-level`);

      for (const p of products) {
        const source = p.categoryName || p.name || '';
        const matchedSlug = findSubcategoryByKeyword(source, slugMap);
        const targetSlug = matchedSlug || defaultSlug;
        const targetId = subBySlug[targetSlug];

        if (!targetId) {
          console.log(`  ⚠ No subcategory for slug: ${targetSlug} - skipping ${p.name}`);
          continue;
        }

        if (matchedSlug) stats[parentName.toLowerCase()].matched++;
        else stats[parentName.toLowerCase()].defaulted++;

        if (!dryRun) {
          await Product.updateOne({ _id: p._id }, { $set: { category: targetId } });
        }
        migratedCount++;
        if (dryRun && migratedCount <= 10) {
          console.log(`  ${p.name} → ${targetSlug} (${matchedSlug ? 'matched' : 'default'})`);
        }
      }
    }

    console.log('\n--- Summary ---');
    console.log(`Products to migrate: ${migratedCount}`);
    console.log(`Men: ${stats.men.matched} keyword-matched, ${stats.men.defaulted} defaulted to ${MEN_DEFAULT_SUBCATEGORY_SLUG}`);
    console.log(`Women: ${stats.women.matched} keyword-matched, ${stats.women.defaulted} defaulted to ${WOMEN_DEFAULT_SUBCATEGORY_SLUG}`);
    if (dryRun && migratedCount > 0) {
      console.log('\nRun with --apply to apply changes: node scripts/migrateCategoriesAndProducts.js --apply');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

const dryRun = !process.argv.includes('--apply');
migrate(dryRun);
