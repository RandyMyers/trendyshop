const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Store = require('../models/Store');
const AboutUs = require('../models/AboutUs');
const ShippingInfo = require('../models/ShippingInfo');
const ReturnsPolicy = require('../models/ReturnsPolicy');
const PrivacyPolicy = require('../models/PrivacyPolicy');
const TermsAndConditions = require('../models/TermsAndConditions');
const StoreFAQ = require('../models/StoreFAQ');
const ContactInfo = require('../models/ContactInfo');

dotenv.config();

const DEFAULT_CONTENT = {
  about: `<h2>Welcome to Our Store</h2>
<p>We are committed to providing you with the best products and exceptional customer service. Our journey began with a simple mission: to make quality products accessible to everyone.</p>

<h3>Our Mission</h3>
<p>To deliver quality products that enhance your lifestyle while maintaining sustainable and ethical business practices. We believe in creating value for our customers while respecting our planet and communities.</p>

<h3>Our Values</h3>
<ul>
<li><strong>Quality First</strong> - We never compromise on product quality and craftsmanship</li>
<li><strong>Customer Satisfaction</strong> - Your happiness and satisfaction are our top priorities</li>
<li><strong>Sustainability</strong> - We care deeply about our environmental impact</li>
<li><strong>Transparency</strong> - Honest and open communication with our customers</li>
<li><strong>Innovation</strong> - Constantly improving and adapting to serve you better</li>
</ul>

<h3>Why Choose Us?</h3>
<p>With years of experience in the industry, we have built a reputation for excellence. Our team is dedicated to curating the finest products and providing outstanding customer service at every step of your journey with us.</p>`,

  shipping: `<h2>Shipping & Delivery Information</h2>
<p>We offer fast and reliable shipping to ensure your products arrive safely and on time.</p>

<h3>Shipping Methods</h3>
<ul>
<li><strong>Standard Shipping:</strong> 5-7 business days - Free on orders over $50</li>
<li><strong>Express Shipping:</strong> 2-3 business days - $9.99</li>
<li><strong>Overnight Shipping:</strong> 1 business day - $19.99</li>
</ul>

<h3>International Shipping</h3>
<p>We ship to select countries worldwide. International shipping times vary by destination, typically 10-20 business days. Additional customs fees may apply depending on your country.</p>

<h3>Order Processing</h3>
<p>Orders are typically processed within 1-2 business days. Orders placed on weekends or holidays will be processed on the next business day. You will receive a tracking number via email once your order ships.</p>

<h3>Tracking Your Order</h3>
<p>Once your order ships, you'll receive an email with tracking information. You can also check your order status anytime by logging into your account and visiting the Orders section.</p>

<h3>Delivery Issues</h3>
<p>If you experience any issues with your delivery, please contact our customer service team immediately. We're here to help resolve any shipping concerns.</p>`,

  returns: `<h2>Returns & Refunds Policy</h2>
<p>We want you to be completely satisfied with your purchase. If you're not happy with your order, we're here to help.</p>

<h3>30-Day Return Window</h3>
<p>You have 30 days from the date of delivery to return eligible items for a full refund or exchange. Items must be in their original condition to qualify for a return.</p>

<h3>Eligibility Requirements</h3>
<p>To be eligible for a return, items must be:</p>
<ul>
<li>In original, unused condition</li>
<li>Unworn with no signs of wear</li>
<li>With all original tags attached</li>
<li>In original packaging</li>
</ul>

<h3>How to Initiate a Return</h3>
<ol>
<li>Contact our customer service team to request a return authorization</li>
<li>Receive your return authorization number and shipping label</li>
<li>Pack the item securely with all original materials and packaging</li>
<li>Attach the provided shipping label</li>
<li>Drop off at your nearest shipping location</li>
</ol>

<h3>Refund Process</h3>
<p>Once we receive and inspect your return, we'll process your refund within 5-7 business days to your original payment method. You'll receive an email confirmation once the refund is processed.</p>

<h3>Exchanges</h3>
<p>If you need a different size or color, please initiate a return and place a new order. This ensures you get your preferred item as quickly as possible.</p>

<h3>Non-Returnable Items</h3>
<p>The following items cannot be returned:</p>
<ul>
<li>Final sale items</li>
<li>Gift cards</li>
<li>Downloadable products</li>
<li>Items showing signs of wear or use</li>
</ul>

<h3>Questions?</h3>
<p>If you have any questions about our returns policy, please don't hesitate to contact our customer service team.</p>`,

  privacy: `<h2>Privacy Policy</h2>
<p><em>Last updated: ${new Date().toLocaleDateString()}</em></p>

<h3>Introduction</h3>
<p>We respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, and safeguard your information when you visit our website or make a purchase.</p>

<h3>Information We Collect</h3>
<p>We collect information that you provide directly to us, including:</p>
<ul>
<li>Name and contact information (email, phone)</li>
<li>Billing and shipping addresses</li>
<li>Payment information (processed securely by our payment providers)</li>
<li>Order history and purchase information</li>
<li>Account credentials</li>
<li>Communications with our customer service team</li>
</ul>

<h3>Automatically Collected Information</h3>
<p>When you visit our website, we automatically collect:</p>
<ul>
<li>IP address and browser information</li>
<li>Device information</li>
<li>Cookies and usage data</li>
<li>Pages visited and time spent on site</li>
</ul>

<h3>How We Use Your Information</h3>
<p>We use the information we collect to:</p>
<ul>
<li>Process and fulfill your orders</li>
<li>Communicate with you about your orders and account</li>
<li>Send marketing communications (with your consent)</li>
<li>Improve our website and services</li>
<li>Prevent fraud and enhance security</li>
<li>Comply with legal obligations</li>
</ul>

<h3>Information Sharing</h3>
<p>We do not sell your personal information to third parties. We may share your information with:</p>
<ul>
<li>Service providers who assist in our operations (shipping, payment processing)</li>
<li>Payment processors for transaction processing</li>
<li>Shipping carriers for order delivery</li>
<li>Legal authorities when required by law</li>
</ul>

<h3>Your Rights</h3>
<p>You have the right to:</p>
<ul>
<li>Access your personal information</li>
<li>Correct inaccurate data</li>
<li>Request deletion of your data</li>
<li>Opt-out of marketing communications</li>
<li>Object to certain data processing</li>
<li>Data portability</li>
</ul>

<h3>Cookies and Tracking</h3>
<p>We use cookies and similar tracking technologies to enhance your experience, analyze site traffic, and for marketing purposes. You can control cookie preferences through your browser settings.</p>

<h3>Data Security</h3>
<p>We implement appropriate technical and organizational measures to protect your personal data from unauthorized access, alteration, disclosure, or destruction.</p>

<h3>Children's Privacy</h3>
<p>Our services are not directed to children under 13. We do not knowingly collect personal information from children.</p>

<h3>Changes to This Policy</h3>
<p>We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "last updated" date.</p>

<h3>Contact Us</h3>
<p>If you have questions about this privacy policy or our data practices, please contact us at privacy@example.com</p>`,

  terms: `<h2>Terms & Conditions</h2>
<p><em>Last updated: ${new Date().toLocaleDateString()}</em></p>

<h3>Agreement to Terms</h3>
<p>By accessing and using this website, you agree to be bound by these Terms and Conditions and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using this site.</p>

<h3>Use License</h3>
<p>Permission is granted to temporarily access and use the materials on this website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
<ul>
<li>Modify or copy the materials</li>
<li>Use the materials for any commercial purpose or public display</li>
<li>Attempt to decompile or reverse engineer any software contained on the website</li>
<li>Remove any copyright or proprietary notations from the materials</li>
<li>Transfer the materials to another person or "mirror" the materials on any other server</li>
</ul>

<h3>User Account</h3>
<p>When you create an account with us, you must provide accurate and complete information. You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.</p>

<h3>Product Information</h3>
<p>We strive to provide accurate product descriptions, images, and pricing. However, we do not warrant that product descriptions or other content is accurate, complete, reliable, current, or error-free. We reserve the right to correct any errors, inaccuracies, or omissions.</p>

<h3>Pricing and Availability</h3>
<p>All prices are subject to change without notice. We reserve the right to modify, limit, or discontinue products at any time. Product availability is subject to change and we do not guarantee that products will be in stock.</p>

<h3>Orders and Payment</h3>
<p>By placing an order, you represent that:</p>
<ul>
<li>You are legally capable of entering into binding contracts</li>
<li>The information you provide is accurate and complete</li>
<li>You will pay for all purchases you make</li>
</ul>
<p>We reserve the right to refuse or cancel orders at our discretion for any reason, including but not limited to product availability, errors in pricing or product information, or suspected fraud.</p>

<h3>Intellectual Property</h3>
<p>All content on this website, including but not limited to text, graphics, logos, images, and software, is the property of our company or its licensors and is protected by international copyright, trademark, and other intellectual property laws.</p>

<h3>Limitation of Liability</h3>
<p>We shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use this website or any products purchased, even if we have been advised of the possibility of such damages.</p>

<h3>Indemnification</h3>
<p>You agree to indemnify and hold harmless our company and its affiliates from any claims, damages, losses, liabilities, and expenses arising from your use of the website or violation of these terms.</p>

<h3>Governing Law</h3>
<p>These terms shall be governed by and construed in accordance with the laws of the jurisdiction in which we operate, without regard to its conflict of law provisions.</p>

<h3>Dispute Resolution</h3>
<p>Any disputes arising from these terms or your use of the website shall be resolved through binding arbitration in accordance with the rules of the applicable arbitration association.</p>

<h3>Changes to Terms</h3>
<p>We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting. Your continued use of the website constitutes acceptance of modified terms.</p>

<h3>Severability</h3>
<p>If any provision of these terms is found to be unenforceable, the remaining provisions will continue in full force and effect.</p>

<h3>Contact Information</h3>
<p>For questions about these terms, please contact us at legal@example.com</p>`,

  faq: `<h2>Frequently Asked Questions</h2>

<h3>Ordering & Payment</h3>

<h4>What payment methods do you accept?</h4>
<p>We accept all major credit cards (Visa, MasterCard, American Express, Discover), PayPal, and other secure payment methods. All transactions are encrypted and secure.</p>

<h4>Is it safe to use my credit card on your website?</h4>
<p>Yes, absolutely. We use industry-standard SSL encryption to protect your payment information. We never store your full credit card details on our servers.</p>

<h4>Can I modify or cancel my order?</h4>
<p>Orders can be modified or cancelled within 1 hour of placement. Please contact our customer service team immediately. Once your order has been processed, we cannot make changes.</p>

<h3>Shipping & Delivery</h3>

<h4>How long will it take to receive my order?</h4>
<p>Standard shipping takes 5-7 business days. Express shipping takes 2-3 business days. Overnight shipping delivers within 1 business day. Processing time is 1-2 business days before shipping.</p>

<h4>Do you ship internationally?</h4>
<p>Yes, we ship to select countries worldwide. International shipping times vary by destination. Additional customs fees may apply.</p>

<h4>How can I track my order?</h4>
<p>You'll receive a tracking number via email once your order ships. You can also track your order by logging into your account and visiting the Orders section.</p>

<h3>Returns & Exchanges</h3>

<h4>What is your return policy?</h4>
<p>We offer a 30-day return window from the date of delivery. Items must be unused, unworn, with tags attached, and in original packaging.</p>

<h4>How do I return an item?</h4>
<p>Contact our customer service to initiate a return. We'll provide you with a return authorization number and shipping label. Pack the item securely and ship it back to us.</p>

<h4>How long does it take to receive my refund?</h4>
<p>Once we receive and inspect your return, refunds are processed within 5-7 business days to your original payment method.</p>

<h3>Products & Sizing</h3>

<h4>How do I find the right size?</h4>
<p>Please refer to our Size Guide page for detailed measurements. If you're between sizes, we recommend sizing up. Contact our customer service if you need personalized sizing advice.</p>

<h4>Are your product images accurate?</h4>
<p>We strive to display products as accurately as possible. However, colors may vary slightly due to different monitor settings and lighting conditions.</p>

<h3>Account & Security</h3>

<h4>Do I need an account to place an order?</h4>
<p>No, you can checkout as a guest. However, creating an account allows you to track orders, save addresses, and enjoy faster checkout in the future.</p>

<h4>How do I reset my password?</h4>
<p>Click on "Forgot Password" on the login page. Enter your email address and we'll send you instructions to reset your password.</p>

<h3>Customer Service</h3>

<h4>How can I contact customer service?</h4>
<p>You can reach us via email, phone, or the contact form on our Contact page. Our customer service team is available Monday-Friday, 9am-6pm EST.</p>

<h4>Do you have a physical store?</h4>
<p>We are primarily an online retailer, but you can find our address and contact information on the Contact page.</p>`,

  contact: {
    email: 'support@example.com',
    phone: '+1 (555) 123-4567',
    address: '123 Main Street\nCity, State 12345\nUnited States',
  },
};

async function seedStoreContent() {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    const stores = await Store.find({ isActive: true });

    if (stores.length === 0) {
      console.log('No active stores found. Creating default store...');
      const defaultStore = await Store.getDefaultStore();
      stores.push(defaultStore);
    }

    let createdCount = 0;
    let skippedCount = 0;

    for (const store of stores) {
      console.log(`\nProcessing store: ${store.name} (${store.slug})`);

      // About Us
      const existingAbout = await AboutUs.findOne({ storeId: store._id });
      if (!existingAbout) {
        await AboutUs.create({ storeId: store._id, content: DEFAULT_CONTENT.about });
        console.log('  ✓ Created About Us');
        createdCount++;
      } else {
        console.log('  - Skipped About Us (already exists)');
        skippedCount++;
      }

      // Shipping Info
      const existingShipping = await ShippingInfo.findOne({ storeId: store._id });
      if (!existingShipping) {
        await ShippingInfo.create({ storeId: store._id, content: DEFAULT_CONTENT.shipping });
        console.log('  ✓ Created Shipping Info');
        createdCount++;
      } else {
        console.log('  - Skipped Shipping Info (already exists)');
        skippedCount++;
      }

      // Returns Policy
      const existingReturns = await ReturnsPolicy.findOne({ storeId: store._id });
      if (!existingReturns) {
        await ReturnsPolicy.create({ storeId: store._id, content: DEFAULT_CONTENT.returns });
        console.log('  ✓ Created Returns Policy');
        createdCount++;
      } else {
        console.log('  - Skipped Returns Policy (already exists)');
        skippedCount++;
      }

      // Privacy Policy
      const existingPrivacy = await PrivacyPolicy.findOne({ storeId: store._id });
      if (!existingPrivacy) {
        await PrivacyPolicy.create({ storeId: store._id, content: DEFAULT_CONTENT.privacy });
        console.log('  ✓ Created Privacy Policy');
        createdCount++;
      } else {
        console.log('  - Skipped Privacy Policy (already exists)');
        skippedCount++;
      }

      // Terms & Conditions
      const existingTerms = await TermsAndConditions.findOne({ storeId: store._id });
      if (!existingTerms) {
        await TermsAndConditions.create({ storeId: store._id, content: DEFAULT_CONTENT.terms });
        console.log('  ✓ Created Terms & Conditions');
        createdCount++;
      } else {
        console.log('  - Skipped Terms & Conditions (already exists)');
        skippedCount++;
      }

      // FAQ
      const existingFaq = await StoreFAQ.findOne({ storeId: store._id });
      if (!existingFaq) {
        await StoreFAQ.create({ storeId: store._id, content: DEFAULT_CONTENT.faq });
        console.log('  ✓ Created FAQ');
        createdCount++;
      } else {
        console.log('  - Skipped FAQ (already exists)');
        skippedCount++;
      }

      // Contact Info
      const existingContact = await ContactInfo.findOne({ storeId: store._id });
      if (!existingContact) {
        await ContactInfo.create({
          storeId: store._id,
          email: DEFAULT_CONTENT.contact.email,
          phone: DEFAULT_CONTENT.contact.phone,
          address: DEFAULT_CONTENT.contact.address,
        });
        console.log('  ✓ Created Contact Info');
        createdCount++;
      } else {
        console.log('  - Skipped Contact Info (already exists)');
        skippedCount++;
      }
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   Created: ${createdCount} content items`);
    console.log(`   Skipped: ${skippedCount} content items (already exist)`);
    console.log(`   Stores processed: ${stores.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding store content:', error);
    process.exit(1);
  }
}

// Run the seeding function
seedStoreContent();
