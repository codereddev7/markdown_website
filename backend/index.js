const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS setup to support HTTP-only cookies
const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? ["https://codereddev.netlify.app"]
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/chats', require('./routes/chats'));

// Seed default administrator if DB is empty
async function seedAdmin() {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const email = process.env.ADMIN_EMAIL;
      const password = process.env.ADMIN_PASSWORD;
      if (!email || !password) {
        console.warn('Seeding skipped: ADMIN_EMAIL or ADMIN_PASSWORD not set in environment.');
        return;
      }
      console.log('No administrator found. Seeding default admin account from environment...');
      const hashedPassword = await bcrypt.hash(password, 10);
      const defaultAdmin = new Admin({
        email: email,
        password: hashedPassword
      });
      await defaultAdmin.save();
      console.log('Default admin account seeded successfully.');
    }
  } catch (err) {
    console.error('Failed to seed default administrator:', err.message);
  }
}

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/markdown-manager')
  .then(async () => {
    console.log('Connected to MongoDB');
    await seedAdmin();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }).catch(err => {
    console.error('MongoDB connection error:', err);
  });

// Trigger reload for nodemon to apply latest env changes
