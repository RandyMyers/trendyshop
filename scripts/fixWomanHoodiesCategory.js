/**
 * Fix "Woman Hoodies" - move from Men to Women
 * Run: node server/scripts/fixWomanHoodiesCategory.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');

async function fix() {
  await mongoose.connect(process.env.MONGO_URL);
  try {
    const womanHoodies = await Category.findOne({
      $or: [
        { name: /woman hoodies/i },
        { name: /women's? hoodies/i },
        { slug: /woman-hoodies/ },
        { slug: /women-hoodies/ },
      ],
    });
    if (!womanHoodies) {
      console.log('Category "Woman Hoodies" not found. Nothing to fix.');
      return;
    }

    const women = await Category.findOne({
      $or: [
        { name: /^women$/i },
        { slug: 'women' },
      ],
      parentCategory: null,
    });
    if (!women) {
      console.log('Parent category "Women" not found.');
      return;
    }

    if (womanHoodies.parentCategory?.toString() === women._id.toString()) {
      console.log('Woman Hoodies is already under Women. Nothing to fix.');
      return;
    }

    womanHoodies.parentCategory = women._id;
    if (/^woman hoodies$/i.test(womanHoodies.name)) {
      womanHoodies.name = "Women's Hoodies";
    }
    await womanHoodies.save();
    console.log(`Fixed: Moved "${womanHoodies.name}" under Women.`);
  } finally {
    await mongoose.disconnect();
  }
}

fix().catch((err) => {
  console.error(err);
  process.exit(1);
});
