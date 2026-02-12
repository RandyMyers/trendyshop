const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Category = require('../models/Category');
const Store = require('../models/Store');

dotenv.config();

const CATEGORIES = [
  // Top-level: Men
  {
    name: 'Men',
    slug: 'men',
    description: 'Men\'s fashion collection',
    parentCategory: null,
    sortOrder: 0,
    subcategories: [
      { name: 'Men\'s Blazers', slug: 'blazers', description: 'Men\'s blazers and formal jackets', sortOrder: 0 },
      { name: 'Men\'s Jackets', slug: 'jackets', description: 'Men\'s jackets and coats', sortOrder: 1 },
      { name: 'Shirts', slug: 'shirts', description: 'Men\'s shirts and tops', sortOrder: 2 },
      { name: 'Suits', slug: 'suits', description: 'Men\'s suits and tailoring', sortOrder: 3 },
      { name: 'Trousers', slug: 'trousers', description: 'Men\'s trousers and pants', sortOrder: 4 },
      { name: 'Men\'s Accessories', slug: 'mens-accessories', description: 'Men\'s accessories', sortOrder: 5 },
    ],
  },
  // Top-level: Women
  {
    name: 'Women',
    slug: 'women',
    description: 'Women\'s fashion collection',
    parentCategory: null,
    sortOrder: 1,
    subcategories: [
      { name: 'Women\'s Blazers', slug: 'womens-blazers', description: 'Women\'s blazers and formal jackets', sortOrder: 0 },
      { name: 'Dresses', slug: 'dresses', description: 'Women\'s dresses', sortOrder: 1 },
      { name: 'Blouses & Tops', slug: 'blouses-tops', description: 'Women\'s blouses and tops', sortOrder: 2 },
      { name: 'Women\'s Jackets', slug: 'womens-jackets', description: 'Women\'s jackets and coats', sortOrder: 3 },
      { name: 'Skirts', slug: 'skirts', description: 'Women\'s skirts', sortOrder: 4 },
      { name: 'Women\'s Accessories', slug: 'womens-accessories', description: 'Women\'s accessories', sortOrder: 5 },
    ],
  },
  // Top-level: Accessories (standalone)
  {
    name: 'Accessories',
    slug: 'accessories',
    description: 'General accessories collection',
    parentCategory: null,
    sortOrder: 2,
    subcategories: [],
  },
];

const seedCategories = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    for (const parent of CATEGORIES) {
      const parentDoc = await Category.findOneAndUpdate(
        { slug: parent.slug },
        {
          name: parent.name,
          slug: parent.slug,
          description: parent.description,
          parentCategory: null,
          sortOrder: parent.sortOrder,
          isActive: true,
          niche: 'clothing',
          storeId: null,
        },
        { upsert: true, new: true }
      );
      console.log(`✓ ${parent.name} (${parent.slug})`);

      for (const sub of parent.subcategories) {
        await Category.findOneAndUpdate(
          { slug: sub.slug },
          {
            name: sub.name,
            slug: sub.slug,
            description: sub.description,
            parentCategory: parentDoc._id,
            sortOrder: sub.sortOrder,
            isActive: true,
            niche: 'clothing',
            storeId: null,
          },
          { upsert: true, new: true }
        );
        console.log(`  ✓ ${sub.name} (${sub.slug})`);
      }
    }

    // Set default store niche to clothing (so clothing categories show)
    const defaultStore = await Store.findOne({ slug: 'default' });
    if (defaultStore) {
      defaultStore.niche = 'clothing';
      await defaultStore.save();
      console.log('\n✓ Default store niche set to "clothing"');
    }

    console.log('\n✅ Categories seeded successfully!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding categories:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedCategories();
