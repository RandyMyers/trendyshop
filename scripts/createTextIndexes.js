/**
 * Script to create/ensure text indexes for Product model
 * Run this script to set up full-text search indexes
 * 
 * Usage: node server/scripts/createTextIndexes.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const Product = require('../models/Product');

async function createTextIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Drop existing text indexes if they exist (optional - remove if you want to keep existing)
    try {
      await Product.collection.dropIndex('name_text_description_text');
      console.log('Dropped old text index');
    } catch (e) {
      console.log('No existing text index to drop');
    }

    // Create new text index with weights
    await Product.collection.createIndex(
      { 
        name: 'text', 
        description: 'text',
        tags: 'text',
        'variants.name': 'text',
        brand: 'text',
        sku: 'text'
      },
      {
        weights: {
          name: 10,
          tags: 5,
          brand: 3,
          'variants.name': 3,
          description: 2,
          sku: 1
        },
        name: 'product_text_search'
      }
    );

    console.log('✅ Text index created successfully!');
    console.log('Index weights:');
    console.log('  - name: 10');
    console.log('  - tags: 5');
    console.log('  - brand: 3');
    console.log('  - variants.name: 3');
    console.log('  - description: 2');
    console.log('  - sku: 1');

    // List all indexes
    const indexes = await Product.collection.getIndexes();
    console.log('\nAll Product indexes:');
    console.log(JSON.stringify(indexes, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error creating text indexes:', error);
    process.exit(1);
  }
}

createTextIndexes();


