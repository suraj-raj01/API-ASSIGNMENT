# API Assessment — Node.js (CommonJS) + Express + Mongoose

## Setup

```bash
npm install
cp .env.example .env   # then fill in MONGO_URI / JWT_SECRET
npm start               # or: npm run dev (nodemon)
```

Requires a running MongoDB instance (local or Atlas) reachable at `MONGO_URI`.

## Endpoints

Base path: `/api/users`

| # | Method | Path | Auth | Purpose |
|---|--------|------|------|---------|
| 1 | POST | `/create` | none | Register a user |
| 2 | PUT | `/change-status` | token | Flip every user's status |
| 3 | GET | `/distance` | token | Distance from caller to a destination point |
| 4 | GET | `/listing` | token | Users grouped by registration day |

Auth header (any of these works): `Authorization: Bearer <token>` or `token: <token>`.
Get a token from the `/create` response.

---

### 1. Create User — `POST /api/users/create`

**Body**
```json
{
  "name": "Suraj Kumar",
  "email": "suraj@example.com",
  "password": "secret123",
  "address": "New Delhi, India",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "status": "active"
}
```
`status` is optional — defaults to `"active"` if omitted.

**Response**
```json
{
  "status_code": "200",
  "message": "User created successfully",
  "data": {
    "name": "Suraj Kumar",
    "email": "suraj@example.com",
    "address": "New Delhi, India",
    "latitude": 28.6139,
    "longitude": 77.209,
    "status": "active",
    "register_at": "2026-07-03T11:18:47.816Z",
    "token": "eyJhbGciOi..."
  }
}
```

Password is hashed with bcrypt before saving. `latitude`/`longitude` are also stored as a GeoJSON
`Point` (used by endpoint 3), and the registration weekday is precomputed and stored
(used by endpoint 4) — see "Design notes" below.

---

### 2. Change Users Status — `PUT /api/users/change-status`

Requires any valid token in the header. Flips **every** user's status in one shot:
active → inactive and inactive → active — with no JavaScript loop over users.

**Response**
```json
{ "status_code": "200", "message": "Status toggled for 12 user(s)" }
```

**How it avoids loops:** it uses `updateMany` with an aggregation-pipeline update:
```js
User.updateMany({}, [
  { $set: { status: { $cond: [{ $eq: ['$status', 'active'] }, 'inactive', 'active'] } } }
]);
```
MongoDB computes the new value per document server-side in a single query.

---

### 3. Get Distance — `GET /api/users/distance?Destination_Latitude=..&Destination_Longitude=..`

Requires token. The caller's own current lat/long is resolved from the token
(the token encodes the user id, which is looked up server-side) and compared
against the destination point — all in a single MongoDB query, no loops.

**Response**
```json
{ "status_code": "200", "message": "Distance calculated successfully", "distance": "25.34km" }
```

**How it's a single query:** it uses the aggregation `$geoNear` stage against the
user's stored `location` (a `2dsphere`-indexed GeoJSON point), which does spherical
distance math natively in MongoDB and returns the result directly — no manual
Haversine loop in Node.

---

### 4. Get User Listing — `GET /api/users/listing?week_number=0,1`

Requires token. `week_number` is a comma-separated list of day numbers:
`0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday`.

Only the requested days appear as keys in the response.

**Example — `week_number=0,1`**
```json
{
  "status_code": "200",
  "message": "User listing fetched successfully",
  "data": {
    "sunday": [{ "name": "Bob", "email": "bob@test.com" }],
    "monday": [{ "name": "Alice", "email": "alice@test.com" }]
  }
}
```

**Example — `week_number=1,2,3`** returns `monday`, `tuesday`, `wednesday` keys only.

**Design notes for scale (spec explicitly calls out "1 Crore users"):**
- At creation time, each user's registration weekday is precomputed into an indexed
  `register_day` field (`0`–`6`), matching JS `Date#getDay()`.
- The listing query is then a single indexed pass:
  `$match (register_day $in [...]) → $project (name/email only) → $group by day`.
  It never computes the weekday per-document at read time, and never loops over users
  in application code — MongoDB does one indexed scan of just the matching documents.
- Each day's array is capped (`LISTING_PER_DAY_LIMIT`, default 1000) so a single response
  stays bounded even if millions of users share a registration day. For exporting a full
  day's users at that scale, pair this with a cursor/keyset-paginated endpoint
  (e.g. `?day=1&after_id=...`) rather than returning one unbounded array.

---

## Project structure

```
api-assessment/
├── server.js               # Express app entry point
├── config/db.js            # Mongoose connection
├── models/User.js          # Schema + indexes (2dsphere, register_day, status)
├── middleware/auth.js      # JWT verification middleware
├── controllers/userController.js  # All 4 endpoint handlers
├── routes/userRoutes.js    # Route wiring
├── package.json
└── .env.example
```
