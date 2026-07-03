const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const {
  createUser,
  changeUsersStatus,
  getDistance,
  getUserListing
} = require('../controllers/userController');

// 1. Create User (no token needed to register)
router.post('/create', createUser);

// 2. Change Users Status (requires any valid user token)
router.patch('/change-status', auth, changeUsersStatus);

// 3. Get Distance (requires token; uses caller's own stored lat/long)
router.get('/distance', auth, getDistance);

// 4. Get User Listing (requires token)
router.get('/listing', auth, getUserListing);

module.exports = router;
