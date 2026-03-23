const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Visit = require('../models/Visit');

const TURF_TYPES = new Set(['neighborhood', 'zip', 'grid']);
const ROUTE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRouteDate(value) {
  const routeDate = trimString(value);

  if (!routeDate) {
    return null;
  }

  if (!ROUTE_DATE_PATTERN.test(routeDate)) {
    throw new Error('Route date must be in YYYY-MM-DD format');
  }

  return routeDate;
}

function normalizeRouteOrder(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const routeOrder = Number(value);
  if (!Number.isInteger(routeOrder) || routeOrder < 1) {
    throw new Error('Route order must be a positive integer');
  }

  return routeOrder;
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function buildGridLabel(location = {}) {
  const lat = normalizeCoordinate(location.lat);
  const lng = normalizeCoordinate(location.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '';
  }

  const latBucket = Math.floor((lat + 90) / 0.02);
  const lngBucket = Math.floor((lng + 180) / 0.02);
  return `Grid ${latBucket}-${lngBucket}`;
}

function buildDerivedTurfLabel(type, address = {}, location = {}) {
  if (type === 'zip') {
    return trimString(address.postalCode);
  }

  if (type === 'neighborhood') {
    return trimString(address.city);
  }

  return buildGridLabel(location);
}

function normalizeLeadPayload(body = {}) {
  const address = {
    street: trimString(body.address?.street),
    city: trimString(body.address?.city),
    state: trimString(body.address?.state),
    postalCode: trimString(body.address?.postalCode),
    country: trimString(body.address?.country) || 'USA',
  };

  const location = {
    lat: normalizeCoordinate(body.location?.lat),
    lng: normalizeCoordinate(body.location?.lng),
  };

  const turfType = TURF_TYPES.has(body.turf?.type) ? body.turf.type : 'zip';
  const turfLabel = trimString(body.turf?.label) || buildDerivedTurfLabel(turfType, address, location);
  const assignedRep = trimString(body.assignedRep);
  const routeDate = normalizeRouteDate(body.routePlan?.date);
  const routeOrder = normalizeRouteOrder(body.routePlan?.order);

  return {
    name: trimString(body.name),
    email: trimString(body.email),
    phone: trimString(body.phone),
    company: trimString(body.company),
    address,
    location,
    homeType: body.homeType,
    turf: {
      type: turfType,
      label: turfLabel,
    },
    assignedRep,
    routePlan: {
      date: assignedRep && routeDate ? routeDate : null,
      order: assignedRep && routeDate ? routeOrder : null,
    },
    status: body.status,
    knockCount: body.knockCount,
    lastVisitAt: body.lastVisitAt || null,
    notes: trimString(body.notes),
  };
}

async function normalizeRouteOrders(assignedRep, routeDate) {
  const repName = trimString(assignedRep);
  const normalizedRouteDate = trimString(routeDate);

  if (!repName || !normalizedRouteDate) {
    return;
  }

  const routeLeads = await Lead.find({
    assignedRep: repName,
    'routePlan.date': normalizedRouteDate,
  });

  routeLeads.sort((left, right) => {
    const leftOrder = Number.isInteger(left.routePlan?.order) ? left.routePlan.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isInteger(right.routePlan?.order) ? right.routePlan.order : Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return String(left.name || '').localeCompare(String(right.name || ''));
  });

  await Promise.all(
    routeLeads.map((lead, index) =>
      Lead.updateOne(
        { _id: lead._id },
        {
          $set: {
            assignedRep: repName,
            'routePlan.date': normalizedRouteDate,
            'routePlan.order': index + 1,
          },
        }
      )
    )
  );
}

// GET all leads (with optional search/filter)
router.get('/', async (req, res) => {
  try {
    const { search, status, assignedRep, routeDate, turfType, turfLabel } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    const repName = trimString(assignedRep);
    if (repName) {
      filter.assignedRep = repName;
    }

    const normalizedRouteDate = trimString(routeDate);
    if (normalizedRouteDate) {
      filter['routePlan.date'] = normalizedRouteDate;
    }

    if (turfType && TURF_TYPES.has(turfType)) {
      filter['turf.type'] = turfType;
    }

    if (turfLabel) {
      filter['turf.label'] = new RegExp(turfLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { company: regex },
        { phone: regex },
        { 'address.street': regex },
        { 'address.city': regex },
        { 'address.state': regex },
        { 'address.postalCode': regex },
        { 'turf.label': regex },
        { assignedRep: regex },
      ];
    }

    const leads = await Lead.find(filter).sort({ 'routePlan.date': 1, 'routePlan.order': 1, createdAt: -1 });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH assign/update a lead's route plan
router.patch('/:id/route-plan', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const previousRep = lead.assignedRep;
    const previousRouteDate = lead.routePlan?.date || null;
    const assignedRep = trimString(req.body.assignedRep);
    const routeDate = normalizeRouteDate(req.body.routeDate);
    const routeOrder = normalizeRouteOrder(req.body.routeOrder);

    if ((assignedRep && !routeDate) || (!assignedRep && routeDate)) {
      return res.status(400).json({ error: 'Rep and route date must be provided together' });
    }

    if (!assignedRep && !routeDate) {
      lead.assignedRep = '';
      lead.routePlan = { date: null, order: null };
    } else {
      let nextOrder = routeOrder;

      if (nextOrder === null) {
        const existingCount = await Lead.countDocuments({
          _id: { $ne: lead._id },
          assignedRep,
          'routePlan.date': routeDate,
        });
        nextOrder = existingCount + 1;
      }

      lead.assignedRep = assignedRep;
      lead.routePlan = {
        date: routeDate,
        order: nextOrder,
      };
    }

    await lead.save();
    await normalizeRouteOrders(previousRep, previousRouteDate);
    await normalizeRouteOrders(lead.assignedRep, lead.routePlan?.date);

    const refreshedLead = await Lead.findById(lead._id);
    res.json(refreshedLead);
  } catch (err) {
    if (err.message === 'Route date must be in YYYY-MM-DD format' || err.message === 'Route order must be a positive integer') {
      return res.status(400).json({ error: err.message });
    }
    res.status(400).json({ error: 'Invalid route assignment' });
  }
});

// PATCH reorder all route stops for a rep/day
router.patch('/route-plan/reorder', async (req, res) => {
  try {
    const assignedRep = trimString(req.body.assignedRep);
    const routeDate = normalizeRouteDate(req.body.routeDate);
    const orderedLeadIds = Array.isArray(req.body.orderedLeadIds) ? req.body.orderedLeadIds.map(String) : [];

    if (!assignedRep || !routeDate) {
      return res.status(400).json({ error: 'Rep and route date are required to reorder a route' });
    }

    const routeLeads = await Lead.find({
      assignedRep,
      'routePlan.date': routeDate,
    });

    const routeLeadMap = new Map(routeLeads.map((lead) => [String(lead._id), lead]));
    const orderedLeads = [];

    orderedLeadIds.forEach((leadId) => {
      const lead = routeLeadMap.get(leadId);
      if (lead) {
        orderedLeads.push(lead);
        routeLeadMap.delete(leadId);
      }
    });

    orderedLeads.push(
      ...Array.from(routeLeadMap.values()).sort((left, right) => {
        const leftOrder = Number.isInteger(left.routePlan?.order) ? left.routePlan.order : Number.MAX_SAFE_INTEGER;
        const rightOrder = Number.isInteger(right.routePlan?.order) ? right.routePlan.order : Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      })
    );

    await Promise.all(
      orderedLeads.map((lead, index) =>
        Lead.updateOne(
          { _id: lead._id },
          {
            $set: {
              assignedRep,
              'routePlan.date': routeDate,
              'routePlan.order': index + 1,
            },
          }
        )
      )
    );

    const refreshedRoute = await Lead.find({
      assignedRep,
      'routePlan.date': routeDate,
    }).sort({ 'routePlan.order': 1, createdAt: 1 });

    res.json(refreshedRoute);
  } catch (err) {
    if (err.message === 'Route date must be in YYYY-MM-DD format') {
      return res.status(400).json({ error: err.message });
    }
    res.status(400).json({ error: 'Could not reorder route' });
  }
});

// GET single lead
router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

// GET lead visit history
router.get('/:id/visits', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const visits = await Visit.find({ lead: lead._id }).sort({ visitAt: -1, createdAt: -1 });
    res.json(visits);
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

// POST create visit log entry for a lead
router.post('/:id/visits', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const visit = await Visit.create({
      lead: lead._id,
      outcome: req.body.outcome,
      notes: req.body.notes,
      dispositionReason: req.body.dispositionReason,
      nextFollowUpAt: req.body.nextFollowUpAt,
      visitAt: req.body.visitAt,
    });

    lead.knockCount = (lead.knockCount || 0) + 1;
    lead.lastVisitAt = visit.visitAt;
    lead.status = visit.outcome;
    await lead.save();

    res.status(201).json({ visit, lead });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create lead
router.post('/', async (req, res) => {
  try {
    const lead = await Lead.create(normalizeLeadPayload(req.body));
    await normalizeRouteOrders(lead.assignedRep, lead.routePlan?.date);
    res.status(201).json(lead);
  } catch (err) {
    if (err.message === 'Route date must be in YYYY-MM-DD format' || err.message === 'Route order must be a positive integer') {
      return res.status(400).json({ error: err.message });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update lead
router.put('/:id', async (req, res) => {
  try {
    const existingLead = await Lead.findById(req.params.id);
    if (!existingLead) return res.status(404).json({ error: 'Lead not found' });

    const previousRep = existingLead.assignedRep;
    const previousRouteDate = existingLead.routePlan?.date || null;
    const lead = await Lead.findByIdAndUpdate(req.params.id, normalizeLeadPayload(req.body), {
      new: true,
      runValidators: true,
    });

    await normalizeRouteOrders(previousRep, previousRouteDate);
    await normalizeRouteOrders(lead.assignedRep, lead.routePlan?.date);
    res.json(lead);
  } catch (err) {
    if (err.message === 'Route date must be in YYYY-MM-DD format' || err.message === 'Route order must be a positive integer') {
      return res.status(400).json({ error: err.message });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(400).json({ error: 'Invalid ID or data' });
  }
});

// DELETE lead
router.delete('/:id', async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await Visit.deleteMany({ lead: lead._id });
    await normalizeRouteOrders(lead.assignedRep, lead.routePlan?.date);
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

module.exports = router;
