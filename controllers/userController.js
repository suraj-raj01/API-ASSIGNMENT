const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const DAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
];

const generateToken = (user) =>
  jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

/**
 * 1. Create User
 * POST /api/users/create
 * Body: { name, email, password, address, latitude, longitude, status? }
 */
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, address, latitude, longitude, status } = req.body;

    if (
      !name || !email || !password || !address ||
      latitude === undefined || latitude === null ||
      longitude === undefined || longitude === null
    ) {
      return res.status(400).json({
        status_code: '400',
        message: 'name, email, password, address, latitude and longitude are all required'
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({
        status_code: '400',
        message: 'latitude and longitude must be valid numbers'
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({
        status_code: '409',
        message: 'A user with this email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      address,
      latitude: lat,
      longitude: lng,
      status: status || 'active', // default active per spec
      location: { type: 'Point', coordinates: [lng, lat] },
      register_at: now,
      register_day: now.getDay() // 0 = Sunday ... 6 = Saturday
    });

    const token = generateToken(user);

    return res.status(200).json({
      status_code: '200',
      message: 'User created successfully',
      data: {
        name: user.name,
        email: user.email,
        address: user.address,
        latitude: user.latitude,
        longitude: user.longitude,
        status: user.status,
        register_at: user.register_at,
        token
      }
    });
  } catch (err) {
    return res.status(500).json({ status_code: '500', message: err.message });
  }
};

/**
 * 2. Change Users Status
 * PUT /api/users/change-status
 * Header: token
 * Flips EVERY user's status (active -> inactive, inactive -> active)
 * in a single MongoDB update -- no JS loops over the collection.
 */
exports.changeUsersStatus = async (req, res) => {
  try {
    // updateMany with an aggregation-pipeline update lets MongoDB compute
    // the new value per-document server-side in one query, rather than
    // Claude/Node fetching every user and looping to flip the flag.
    const result = await User.updateMany({}, [
      {
        $set: {
          status: {
            $cond: [{ $eq: ['$status', 'active'] }, 'inactive', 'active']
          }
        }
      }
    ]);

    return res.status(200).json({
      status_code: '200',
      message: `Status toggled for ${result.modifiedCount} user(s)`
    });
  } catch (err) {
    return res.status(500).json({ status_code: '500', message: err.message });
  }
};

/**
 * 3. Get Distance
 * GET /api/users/distance?Destination_Latitude=..&Destination_Longitude=..
 * Header: token
 * Resolves the calling user's stored lat/long (from the token's user id)
 * and computes distance to the destination point in a single query
 * using MongoDB's native $geoNear (spherical / haversine math done in-DB).
 */
exports.getDistance = async (req, res) => {
  try {
    const { Destination_Latitude, Destination_Longitude } = req.query;

    if (!Destination_Latitude || !Destination_Longitude) {
      return res.status(400).json({
        status_code: '400',
        message: 'Destination_Latitude and Destination_Longitude query params are required'
      });
    }

    const destLat = Number(Destination_Latitude);
    const destLng = Number(Destination_Longitude);

    if (Number.isNaN(destLat) || Number.isNaN(destLng)) {
      return res.status(400).json({
        status_code: '400',
        message: 'Destination_Latitude and Destination_Longitude must be valid numbers'
      });
    }

    const userId = req.user.id;

    // Single aggregation query: $geoNear finds/scopes to this one user
    // (via the query filter) and returns the spherical distance from the
    // destination point to that user's stored location, in meters.
    const result = await User.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [destLng, destLat] },
          distanceField: 'distance_meters',
          spherical: true,
          query: { _id: new mongoose.Types.ObjectId(userId) }
        }
      },
      { $limit: 1 },
      { $project: { _id: 0, distance_meters: 1 } }
    ]);

    if (!result.length) {
      return res.status(404).json({ status_code: '404', message: 'User not found' });
    }

    const distanceKm = (result[0].distance_meters / 1000).toFixed(2);

    return res.status(200).json({
      status_code: '200',
      message: 'Distance calculated successfully',
      distance: `${distanceKm}km`
    });
  } catch (err) {
    return res.status(500).json({ status_code: '500', message: err.message });
  }
};

/**
 * 4. Get User Listing
 * GET /api/users/listing?week_number=0,1
 * Header: token
 * week_number is a comma-separated list of day numbers (0 = Sunday ... 6 = Saturday).
 * Returns only the requested days as keys, each holding an array of
 * { name, email } for users who registered on that day.
 *
 * Scale note (spec explicitly asks "what if we have 1 Crore users"):
 * - register_day is precomputed + indexed at write time (see User model),
 *   so this read is a single indexed $in match + $group -- one pass over
 *   only the matching documents, no per-request $dayOfWeek computation
 *   and no application-level loop over the user collection.
 * - Each day's result is capped (LISTING_PER_DAY_LIMIT) to keep the
 *   response bounded; for exporting a full day's users at 10M+ scale,
 *   pair this with a cursor/keyset-paginated endpoint instead of one
 *   giant array.
 */
const LISTING_PER_DAY_LIMIT = 1000;

exports.getUserListing = async (req, res) => {
  try {
    const { week_number } = req.query;

    if (!week_number) {
      return res.status(400).json({
        status_code: '400',
        message: 'week_number query param is required, e.g. week_number=0,1'
      });
    }

    const requestedDays = [...new Set(
      week_number
        .split(',')
        .map((n) => parseInt(n.trim(), 10))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    )];

    if (!requestedDays.length) {
      return res.status(400).json({
        status_code: '400',
        message: 'week_number must contain valid day numbers between 0 (Sunday) and 6 (Saturday)'
      });
    }

    const grouped = await User.aggregate([
      { $match: { register_day: { $in: requestedDays } } },
      { $project: { _id: 0, name: 1, email: 1, register_day: 1 } },
      {
        $group: {
          _id: '$register_day',
          users: { $push: { name: '$name', email: '$email' } }
        }
      },
      { $project: { _id: 1, users: { $slice: ['$users', LISTING_PER_DAY_LIMIT] } } }
    ]);

    // Build the response object with a key for every requested day
    // (even ones with zero registered users), in requested order.
    const data = {};
    requestedDays.forEach((dayNum) => {
      data[DAY_NAMES[dayNum]] = [];
    });
    grouped.forEach((group) => {
      data[DAY_NAMES[group._id]] = group.users;
    });

    return res.status(200).json({
      status_code: '200',
      message: 'User listing fetched successfully',
      data
    });
  } catch (err) {
    return res.status(500).json({ status_code: '500', message: err.message });
  }
};
