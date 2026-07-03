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
    default: 'active' // Q1: status is active by default
  },
  // GeoJSON point mirrors latitude/longitude so MongoDB can do native
  // geospatial math (used by Q3 "Get Distance") in a single DB query
  // instead of pulling data into Node and looping/calculating manually.
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
  // Precomputed day-of-week (0 = Sunday ... 6 = Saturday), matching
  // JS Date#getDay() and the spec's numbering. Storing this (instead of
  // computing $dayOfWeek on the fly for every query) lets Q4's listing
  // endpoint use a plain indexed equality/$in match, which is what keeps
  // it fast at "1 crore" (10 million+) user scale.
  register_day: {
    type: Number,
    min: 0,
    max: 6
  }
});

// Indexes
userSchema.index({ location: '2dsphere' }); // Q3: geospatial distance queries
userSchema.index({ register_day: 1 }); // Q4: day-wise listing at scale
userSchema.index({ status: 1 }); // Q2: bulk status toggle

module.exports = mongoose.model('User', userSchema);
