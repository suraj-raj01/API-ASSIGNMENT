require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');

const userRoutes = require('./routes/userRoutes');
const PORT = process.env.PORT || 5000;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

connectDB();

app.get('/', (req, res) => {
  res.status(200).json({ status_code: 200, message: 'API Assessment server is running 🚀' });
});

// Routes
app.use('/api/users', userRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ status_code: '404', message: 'Route not found' });
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status_code: '500', message: 'Something went wrong' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT} ✅`));
