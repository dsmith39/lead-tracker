# Lead Tracker (Door-to-Door Canvassing)

A full-stack lead tracking app built for door-to-door canvassing teams.

Tech stack:
- Node.js + Express
- MongoDB + Mongoose
- Vanilla HTML/CSS/JavaScript frontend
- Playwright end-to-end tests
- GitHub Actions CI

## Features

- Address-first lead records
- Geocode support (latitude/longitude)
- Home type tracking
- Canvassing visit statuses:
  - not-visited
  - no-answer
  - spoke-to-owner
  - not-interested
  - callback-requested
  - sale-closed
- Knock count and last visit timestamp
- Search and status filtering
- Full CRUD operations for leads
- End-to-end test suite with Playwright
- CI pipeline that runs tests on Node 20 and Node 24

## Project Structure

```text
lead-tracker/
├── .github/workflows/ci.yml
├── public/
│   ├── css/styles.css
│   ├── js/app.js
│   └── index.html
├── server/
│   ├── models/Lead.js
│   ├── routes/leads.js
│   └── index.js
├── tests/e2e/leads.spec.js
├── playwright.config.js
├── package.json
└── .env
```

## Prerequisites

Install the following first:
- Node.js 20+ (Node 24 supported)
- npm
- MongoDB (local install) or MongoDB Atlas

## Quick Start (Local MongoDB)

1. Clone the repo

```bash
git clone https://github.com/dsmith39/lead-tracker.git
cd lead-tracker
```

2. Install dependencies

```bash
npm install
```

3. Create your environment file

Create .env in the project root with:

```env
MONGO_URI=mongodb://localhost:27017/lead-tracker
PORT=3000
```

4. Start MongoDB

Make sure your local MongoDB service is running.

5. Run the app

```bash
npm run dev
```

Or run without nodemon:

```bash
npm start
```

6. Open in browser

- http://localhost:3000

## Quick Start (MongoDB Atlas)

1. Create a MongoDB Atlas cluster and database user.
2. Copy your Atlas connection string.
3. Put it in .env:

```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-url>/lead-tracker?retryWrites=true&w=majority
PORT=3000
```

4. Start the app:

```bash
npm run dev
```

## App Usage

1. Click Add Lead.
2. Enter lead details (name, contact info, address, home type, status, knock count, last visit).
3. Save lead.
4. Use Search to find leads by:
   - name
   - email
   - company
   - phone
   - address fields
5. Use status filter to focus field activity.
6. Edit or delete leads from the table actions.

## Environment Variables

Required:
- MONGO_URI: MongoDB connection string

Optional:
- PORT: Express server port (default 3000)

## Scripts

- npm start: Run server with Node
- npm run dev: Run server with nodemon
- npm test: Run Playwright E2E tests
- npm run test:ui: Run Playwright in UI mode
- npm run test:report: Open Playwright HTML report

## Data Model (Lead)

Key fields:
- name (required)
- email
- phone
- company
- address:
  - street
  - city
  - state
  - postalCode
  - country (default USA)
- location:
  - lat
  - lng
- homeType:
  - single-family
  - multi-family
  - townhome
  - apartment
  - condo
  - mobile-home
  - other
- status:
  - not-visited
  - no-answer
  - spoke-to-owner
  - not-interested
  - callback-requested
  - sale-closed
- knockCount (default 0)
- lastVisitAt
- notes
- createdAt / updatedAt (timestamps)

## API Endpoints

Base path: /api/leads

- GET /api/leads
  - Query params:
    - search: text search
    - status: visit status
- GET /api/leads/:id
- POST /api/leads
- PUT /api/leads/:id
- DELETE /api/leads/:id

Example create payload:

```json
{
  "name": "Jane Doe",
  "phone": "+1 555 000 1111",
  "email": "jane@example.com",
  "company": "Solar Co",
  "address": {
    "street": "123 Main St",
    "city": "Springfield",
    "state": "IL",
    "postalCode": "62701",
    "country": "USA"
  },
  "location": {
    "lat": 39.7817,
    "lng": -89.6501
  },
  "homeType": "single-family",
  "status": "not-visited",
  "knockCount": 0,
  "lastVisitAt": null,
  "notes": "Morning route"
}
```

## Testing

This project uses Playwright for end-to-end tests.

Run tests:

```bash
npm test
```

Notes:
- Tests use a dedicated test database:
  - mongodb://localhost:27017/lead-tracker-test
- Playwright starts/stops the app automatically during tests via playwright.config.js.

## CI

GitHub Actions workflow: .github/workflows/ci.yml

On every push and pull request, CI:
- Runs on Node 20 and Node 24
- Starts MongoDB service
- Installs dependencies and Playwright Chromium
- Runs npm test
- Uploads Playwright artifacts on failure

## Troubleshooting

### 1) Mongo connection error on startup

- Confirm MONGO_URI is set correctly in .env.
- Ensure MongoDB is running locally, or Atlas network access/user credentials are correct.

### 2) Port already in use

- Change PORT in .env to another port, for example 3002.

### 3) PowerShell blocks npm commands (Windows)

If execution policy blocks npm scripts in PowerShell, use npm.cmd:

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd test
```

### 4) Playwright browser missing

Install browser binaries:

```bash
npx playwright install chromium
```

## Recommended Next Enhancements

- Automatic visit logging table (one record per knock)
- Territory assignment and route ordering
- Follow-up task queue based on visit outcomes
- Offline-first sync for field teams

## License

No license file is currently included. Add a LICENSE file if you want to define usage terms.
