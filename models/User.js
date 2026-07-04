const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    select: false // never return password by default
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active' // status is active by default
  },
  // GeoJSON point mirrors latitude/longitude so MongoDB can do native geospatial math.
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    }
  },
  register_at: {
    type: Date,
    default: Date.now
  },
  // Precomputed day-of-week (0 = Sunday ... 6 = Saturday)
  register_day: {
    type: Number,
    min: 0,
    max: 6
  }
});

// Indexes (for performance and scalability)
userSchema.index({ location: '2dsphere' }); // Q3: geospatial distance queries
userSchema.index({ register_day: 1 }); // Q4: day-wise listing at scale
userSchema.index({ status: 1 }); // Q2: bulk status toggle

module.exports = mongoose.model('User', userSchema);
