const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

// Load environment variables
dotenv.config();

const resetAdminPassword = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Plain password - will be hashed by User model pre-save hook
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const adminUser = await User.findOne({ email: adminEmail }).select('+password');

    if (!adminUser) {
      console.error('Admin user not found with email:', adminEmail);
      await mongoose.disconnect();
      process.exit(1);
    }

    if (adminUser.role !== 'admin') {
      adminUser.role = 'admin';
    }

    adminUser.password = adminPassword;
    await adminUser.save();

    console.log('Admin password reset successfully!');
    console.log('Email:', adminEmail);
    console.log('Password:', adminPassword);
    console.log('\nYou can now login with these credentials.');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error resetting admin password:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

resetAdminPassword();
