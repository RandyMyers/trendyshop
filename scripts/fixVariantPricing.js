/**
 * Fix variant pricing for existing products
 * This script updates variant prices to use suggested prices when pricingStrategy is "suggested"
 * and fixes variants that have CJ costs instead of store prices
 */

const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fixVariantPricing = async () => {
  try {
    // Connect to MongoDB - use same config as app.js
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    // Find all products with variants and CJ data
    const products = await Product.find({ 
      variants: { $exists: true, $ne: [] },
      cjData: { $exists: true },
      'cjData.variants': { $exists: true, $ne: [] }
    });

    console.log(`Found ${products.length} products to check`);

    let fixedCount = 0;
    let updatedVariantsCount = 0;

    for (const product of products) {
      if (!product.cjData?.variants || !Array.isArray(product.cjData.variants)) {
        console.log(`Skipping product ${product._id}: No CJ variants data`);
        continue;
      }

      console.log(`\nProcessing product: ${product.name || product._id}`);
      console.log(`  Pricing Strategy: ${product.pricingStrategy || 'none'}`);
      console.log(`  Variants count: ${product.variants?.length || 0}`);
      console.log(`  CJ Variants count: ${product.cjData.variants?.length || 0}`);

      let needsUpdate = false;
      const useSuggestedPrice = product.pricingStrategy === 'suggested' || !product.pricingStrategy;
      
      console.log(`  Will ${useSuggestedPrice ? 'force' : 'check'} update variants to use suggested prices`);
      
      let variantIndex = 0;
      const updatedVariants = product.variants.map(variant => {
        // Find matching CJ variant - try both string and number comparison
        const variantId = variant.variantId || variant.vid;
        const cjVariant = product.cjData.variants.find(cjv => {
          const cjVid = cjv.vid || cjv.variantId;
          return cjVid == variantId || String(cjVid) === String(variantId); // Use == for type coercion
        });

        if (!cjVariant) {
          variantIndex++;
          return variant; // Keep as-is if no CJ data
        }
        
        // Debug logging for variants that need fixing
        const currentPrice = variant.price || 0;
        const variantCjPrice = parseFloat(cjVariant.variantSellPrice) || 0;
        const variantSuggestedPrice = parseFloat(cjVariant.variantSugSellPrice) || 0;
        
        if (variantIndex === 0) {
          console.log(`  Sample variant: ${variantId}, Price: ${currentPrice}, CJ Cost: ${variantCjPrice}, Suggested: ${variantSuggestedPrice}`);
        }
        
        // Check if current price matches CJ cost (needs fixing)
        const isCjCost = variantCjPrice > 0 && Math.abs(currentPrice - variantCjPrice) < 0.02;
        
        if (isCjCost) {
          console.log(`  ⚠️  Variant ${variantId} has CJ cost price: ${currentPrice} (should be ${variantSuggestedPrice})`);
        }
        
        variantIndex++;

        // Get CJ prices (already parsed above in debug section)
        // const variantCjPrice = parseFloat(cjVariant.variantSellPrice) || 0;
        // const variantSuggestedPrice = parseFloat(cjVariant.variantSugSellPrice) || 0;
        // const currentPrice = variant.price || 0;
        
        // Also check if product uses suggested pricing strategy
        const useSuggestedPrice = product.pricingStrategy === 'suggested' || !product.pricingStrategy;

        // If price is CJ cost and we have suggested price, fix it
        if (isCjCost && variantSuggestedPrice > 0) {
          needsUpdate = true;
          updatedVariantsCount++;
          console.log(`  Fixing variant ${variant.variantId}: ${currentPrice} -> ${variantSuggestedPrice} (CJ cost was ${variantCjPrice})`);
          
          const variantObj = variant.toObject ? variant.toObject() : { ...variant };
          return {
            ...variantObj,
            price: variantSuggestedPrice, // Use suggested price
            cjPrice: variantCjPrice, // Store CJ cost
            suggestedPrice: variantSuggestedPrice, // Store suggested price
          };
        }
        
        // If product uses suggested pricing and variant price is not using suggested, update it
        if (useSuggestedPrice && variantSuggestedPrice > 0 && Math.abs(currentPrice - variantSuggestedPrice) > 0.02) {
          // Only update if price is significantly different from suggested
          needsUpdate = true;
          updatedVariantsCount++;
          console.log(`  Updating variant ${variant.variantId} to use suggested price: ${currentPrice} -> ${variantSuggestedPrice}`);
          
          const variantObj = variant.toObject ? variant.toObject() : { ...variant };
          return {
            ...variantObj,
            price: variantSuggestedPrice,
            cjPrice: variant.cjPrice || variantCjPrice,
            suggestedPrice: variantSuggestedPrice,
          };
        }

        // Always ensure cjPrice and suggestedPrice are stored
        const variantObj = variant.toObject ? variant.toObject() : { ...variant };
        
        // For suggested pricing strategy, always ensure price matches suggested price
        let shouldUpdate = false;
        let newPrice = currentPrice;
        
        if (useSuggestedPrice && variantSuggestedPrice > 0) {
          // Force update to use suggested price (ensures consistency)
          if (Math.abs(currentPrice - variantSuggestedPrice) > 0.01) {
            newPrice = variantSuggestedPrice;
            shouldUpdate = true;
            console.log(`  🔧 Updating variant ${variantId}: ${currentPrice} -> ${variantSuggestedPrice}`);
            updatedVariantsCount++;
          }
        } else if (isCjCost && variantSuggestedPrice > 0) {
          // Fix CJ cost prices
          newPrice = variantSuggestedPrice;
          shouldUpdate = true;
          console.log(`  🔧 Fixing variant ${variantId}: ${currentPrice} -> ${variantSuggestedPrice} (was CJ cost)`);
          updatedVariantsCount++;
        }
        
        // Always ensure pricing fields exist
        const missingFields = !variantObj.cjPrice || variantObj.cjPrice === undefined || 
                             !variantObj.suggestedPrice || variantObj.suggestedPrice === undefined;
        
        if (shouldUpdate || missingFields) {
          needsUpdate = true;
          // Log all updates for first few variants
          if (variantIndex < 3) {
            console.log(`  Variant ${variantId}: Price=${newPrice}, cjPrice=${variantCjPrice}, suggestedPrice=${variantSuggestedPrice}`);
          }
          return {
            ...variantObj,
            price: newPrice,
            cjPrice: variantCjPrice,
            suggestedPrice: variantSuggestedPrice,
          };
        }

        return variant;
      });

      if (needsUpdate) {
        product.variants = updatedVariants;
        await product.save();
        fixedCount++;
        console.log(`✓ Fixed product: ${product.name} (${product._id})`);
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} products`);
    console.log(`✅ Updated ${updatedVariantsCount} variants`);
    
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing variant pricing:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the script
fixVariantPricing();

