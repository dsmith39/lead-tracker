require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { requireTenantContext } = require('./middleware/tenantContext');

const app = express();
const PORT = process.env.PORT || 3000;

function isTrue(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function validateProductionAuthConfiguration() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (isTrue(process.env.ALLOW_LEGACY_TENANT_FALLBACK)) {
    throw new Error('ALLOW_LEGACY_TENANT_FALLBACK must be false in production');
  }

  const algorithm = String(process.env.AUTH_JWT_ALGORITHM || 'HS256').trim().toUpperCase();
  if (algorithm.startsWith('HS')) {
    if (!String(process.env.AUTH_JWT_SECRET || '').trim()) {
      throw new Error('AUTH_JWT_SECRET is required in production for HS* algorithms');
    }
    return;
  }

  if (!String(process.env.AUTH_JWT_PUBLIC_KEY || '').trim()) {
    throw new Error('AUTH_JWT_PUBLIC_KEY is required in production for non-HS algorithms');
  }
}

validateProductionAuthConfiguration();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')));

// Routes
app.use('/api/session', requireTenantContext(), require('./routes/session'));
app.use('/api/leads', requireTenantContext(), require('./routes/leads'));
app.use('/api/geocode', require('./routes/geocode'));
app.use('/api/teams', requireTenantContext({ minRole: 'manager' }), require('./routes/teams'));
app.use('/api/reps', requireTenantContext({ minRole: 'manager' }), require('./routes/reps'));
app.use('/api/members', requireTenantContext({ minRole: 'manager' }), require('./routes/members'));
app.use('/api/invitations', require('./routes/invitations'));

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
