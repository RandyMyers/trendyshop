const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Category = require('../models/Category');
const Product = require('../models/Product');

dotenv.config();

const checkCategories = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });

    console.log('Connected to MongoDB\n');
    console.log('=== CATEGORIES ===\n');

    const categories = await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean();
    const topLevel = categories.filter((c) => !c.parentCategory);
    const subcategories = categories.filter((c) => c.parentCategory);

    // Get product counts in one aggregation
    const productCounts = await Product.aggregate([
      { $match: { category: { $exists: true, $ne: null } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(productCounts.map((r) => [r._id.toString(), r.count]));

    console.log(`Total categories: ${categories.length}`);
    console.log(`Top-level (no parent): ${topLevel.length}`);
    console.log(`Subcategories (has parent): ${subcategories.length}\n`);

    console.log('--- Top-level categories ---');
    for (const c of topLevel) {
      const children = categories.filter((cat) => cat.parentCategory?.toString() === c._id.toString());
      const productCount = countMap[c._id.toString()] || 0;
      console.log(`  ${c.name} (slug: ${c.slug}, _id: ${c._id})`);
      console.log(`    Products in this category: ${productCount}`);
      console.log(`    Children: ${children.map((ch) => ch.name).join(', ') || 'none'}`);
      for (const ch of children) {
        const subProductCount = countMap[ch._id.toString()] || 0;
        console.log(`      - ${ch.name} (slug: ${ch.slug}) - Products: ${subProductCount}`);
      }
      console.log('');
    }

    console.log('--- Subcategories without matching parent ---');
    const orphanSubs = subcategories.filter((c) => !categories.some((p) => p._id.toString() === c.parentCategory?.toString()));
    if (orphanSubs.length) {
      for (const c of orphanSubs) {
        const productCount = countMap[c._id.toString()] || 0;
        console.log(`  ${c.name} (slug: ${c.slug}) - parentId: ${c.parentCategory} - Products: ${productCount}`);
      }
    } else {
      console.log('  (none)\n');
    }

    console.log('=== PRODUCTS BY CATEGORY ===\n');
    const productCategoryMap = {};
    for (const cat of categories) {
      const count = countMap[cat._id.toString()] || 0;
      if (count > 0) {
        productCategoryMap[cat.name] = { slug: cat.slug, parentCategory: cat.parentCategory, count };
      }
    }
    for (const [name, info] of Object.entries(productCategoryMap).sort((a, b) => b[1].count - a[1].count)) {
      const parent = categories.find((c) => c._id?.toString() === info.parentCategory?.toString());
      const parentName = parent ? parent.name : '(top-level)';
      console.log(`  ${name} (${info.slug}) - ${info.count} products - parent: ${parentName}`);
    }

    console.log('\n=== SAMPLE PRODUCTS (first 5 with category) ===\n');
    const sampleProducts = await Product.find({ category: { $exists: true, $ne: null } })
      .populate('category', 'name slug parentCategory')
      .limit(5)
      .lean();
    const catIds = [...new Set(sampleProducts.map((p) => p.category?.parentCategory).filter(Boolean))];
    const parents = await Category.find({ _id: { $in: catIds } }).select('name').lean();
    const parentMap = Object.fromEntries(parents.map((p) => [p._id.toString(), p.name]));
    for (const p of sampleProducts) {
      const cat = p.category;
      const parentName = cat?.parentCategory ? parentMap[cat.parentCategory.toString()] || '(unknown)' : '(top-level)';
      console.log(`  ${p.name}`);
      console.log(`    Category: ${cat?.name} (${cat?.slug}) - parent: ${parentName}`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

checkCategories();
