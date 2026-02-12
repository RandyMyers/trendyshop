const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

// Load environment variables
dotenv.config();

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Admin user credentials (you can change these)
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminFirstName = process.env.ADMIN_FIRST_NAME || 'Admin';
    const adminLastName = process.env.ADMIN_LAST_NAME || 'User';

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log('Email:', existingAdmin.email);
      console.log('Role:', existingAdmin.role);
      
      // Update to ensure role is admin
      existingAdmin.role = 'admin';
      await existingAdmin.save();
      console.log('Updated existing user to admin role');
      
      await mongoose.disconnect();
      return;
    }

    // Create admin user
    const adminUser = await User.create({
      email: adminEmail,
      password: adminPassword,
      firstName: adminFirstName,
      lastName: adminLastName,
      role: 'admin',
      isEmailVerified: true,
    });

    console.log('✅ Admin user created successfully!');
    console.log('Email:', adminUser.email);
    console.log('Role:', adminUser.role);
    console.log('Password:', adminPassword);
    console.log('\nYou can now login with these credentials.');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin user:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the seed function
seedAdmin();




