const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Visit = require('../models/Visit');
const Team = require('../models/Team');
const Rep = require('../models/Rep');

const TURF_TYPES = new Set(['neighborhood', 'zip', 'grid']);
const ROUTE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

async function resolveAssignment(body = {}, organizationId = null) {
  const requestedTeamId = trimString(body.assignedTeamId || body.assignedTeam?._id || body.assignedTeam?.teamId);
  const requestedRepId = trimString(body.assignedRepId || body.assignedRep?._id || body.assignedRep?.repId);
  const legacyAssignedRepName = trimString(typeof body.assignedRep === 'string' ? body.assignedRep : body.assignedRep?.name);

  let resolvedTeam = null;
  let resolvedRep = null;

  if (requestedTeamId) {
    const teamFilter = { _id: requestedTeamId };
    if (organizationId) {
      teamFilter.organizationId = organizationId;
    }
    resolvedTeam = await Team.findOne(teamFilter);
    if (!resolvedTeam) {
      throw new Error('Selected team was not found');
    }
  }

  if (requestedRepId) {
    const repFilter = { _id: requestedRepId };
    if (organizationId) {
      repFilter.organizationId = organizationId;
    }
    resolvedRep = await Rep.findOne(repFilter).populate('teamId', 'name organizationId');
    if (!resolvedRep) {
      throw new Error('Selected rep was not found');
    }
    if (!resolvedRep.active) {
      throw new Error('Selected rep is inactive');
    }
  }

  if (resolvedRep?.teamId) {
    if (resolvedTeam && String(resolvedTeam._id) !== String(resolvedRep.teamId._id)) {
      throw new Error('Selected rep does not belong to the selected team');
    }
    resolvedTeam = resolvedRep.teamId;
  }

  return {
    assignedTeamId: resolvedTeam?._id || null,
    assignedTeamName: resolvedTeam?.name || '',
    assignedRepId: resolvedRep?._id || null,
    assignedRepName: resolvedRep?.name || legacyAssignedRepName,
  };
}

async function normalizeLeadPayload(body = {}, organizationId) {
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
  const assignment = await resolveAssignment(body, organizationId);
  const routeDate = normalizeRouteDate(body.routePlan?.date);
  const routeOrder = normalizeRouteOrder(body.routePlan?.order);

  return {
    organizationId,
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
    assignedTeamId: assignment.assignedTeamId,
    assignedTeamName: assignment.assignedTeamName,
    assignedRepId: assignment.assignedRepId,
    assignedRep: assignment.assignedRepName,
    routePlan: {
      date: assignment.assignedRepName && routeDate ? routeDate : null,
      order: assignment.assignedRepName && routeDate ? routeOrder : null,
    },
    status: body.status,
    knockCount: body.knockCount,
    lastVisitAt: body.lastVisitAt || null,
    notes: trimString(body.notes),
  };
}

function buildRepRouteFilter(assignedRepId, assignedRepName, routeDate, organizationId = null) {
  const normalizedRouteDate = trimString(routeDate);
  if (!normalizedRouteDate) {
    return null;
  }

  if (assignedRepId) {
    const filter = {
      assignedRepId,
      'routePlan.date': normalizedRouteDate,
    };
    if (organizationId) {
      filter.organizationId = organizationId;
    }
    return filter;
  }

  const repName = trimString(assignedRepName);
  if (!repName) {
    return null;
  }

  const filter = {
    assignedRep: repName,
    'routePlan.date': normalizedRouteDate,
  };
  if (organizationId) {
    filter.organizationId = organizationId;
  }
  return filter;
}

async function normalizeRouteOrders({ assignedRepId = null, assignedRepName = '', routeDate = null, organizationId = null }) {
  const routeFilter = buildRepRouteFilter(assignedRepId, assignedRepName, routeDate, organizationId);
  if (!routeFilter) {
    return;
  }

  const routeLeads = await Lead.find(routeFilter);
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
            'routePlan.order': index + 1,
          },
        }
      )
    )
  );
}

function routeContextFromLead(lead) {
  return {
    organizationId: lead.organizationId || null,
    assignedRepId: lead.assignedRepId || null,
    assignedRepName: lead.assignedRep || '',
    routeDate: lead.routePlan?.date || null,
  };
}

// GET all leads (with optional search/filter)
router.get('/', async (req, res) => {
  try {
    const { search, status, assignedRepId, assignedTeamId, routeDate, turfType, turfLabel } = req.query;
    const filter = {
      organizationId: req.tenant.organizationId,
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (assignedRepId) {
      filter.assignedRepId = assignedRepId;
    }

    if (assignedTeamId) {
      filter.assignedTeamId = assignedTeamId;
    }

    const normalizedRouteDate = trimString(routeDate);
    if (normalizedRouteDate) {
      filter['routePlan.date'] = normalizedRouteDate;
    }

    if (turfType && TURF_TYPES.has(turfType)) {
      filter['turf.type'] = turfType;
    }

    if (turfLabel) {
      filter['turf.label'] = new RegExp(escapeRegex(turfLabel), 'i');
    }

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
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
        { assignedTeamName: regex },
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
    const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const previousRouteContext = routeContextFromLead(lead);
    const routeDate = normalizeRouteDate(req.body.routeDate);
    const routeOrder = normalizeRouteOrder(req.body.routeOrder);
    const assignment = await resolveAssignment(req.body, req.tenant.organizationId);

    if ((assignment.assignedRepName && !routeDate) || (!assignment.assignedRepName && routeDate)) {
      return res.status(400).json({ error: 'Rep and route date must be provided together' });
    }

    lead.assignedTeamId = assignment.assignedTeamId;
    lead.assignedTeamName = assignment.assignedTeamName;
    lead.assignedRepId = assignment.assignedRepId;
    lead.assignedRep = assignment.assignedRepName;

    if (!assignment.assignedRepName && !routeDate) {
      lead.routePlan = { date: null, order: null };
    } else {
      let nextOrder = routeOrder;

      if (nextOrder === null) {
        const routeFilter = buildRepRouteFilter(
          assignment.assignedRepId,
          assignment.assignedRepName,
          routeDate,
          lead.organizationId
        );
        const existingCount = await Lead.countDocuments({
          ...routeFilter,
          _id: { $ne: lead._id },
        });
        nextOrder = existingCount + 1;
      }

      lead.routePlan = {
        date: routeDate,
        order: nextOrder,
      };
    }

    await lead.save();
    await normalizeRouteOrders(previousRouteContext);
    await normalizeRouteOrders(routeContextFromLead(lead));

    const refreshedLead = await Lead.findOne({ _id: lead._id, organizationId: req.tenant.organizationId });
    res.json(refreshedLead);
  } catch (err) {
    if (
      err.message === 'Route date must be in YYYY-MM-DD format'
      || err.message === 'Route order must be a positive integer'
      || err.message === 'Selected team was not found'
      || err.message === 'Selected rep was not found'
      || err.message === 'Selected rep is inactive'
      || err.message === 'Selected rep does not belong to the selected team'
    ) {
      return res.status(400).json({ error: err.message });
    }
    res.status(400).json({ error: 'Invalid route assignment' });
  }
});

// PATCH reorder all route stops for a rep/day
router.patch('/route-plan/reorder', async (req, res) => {
  try {
    const routeDate = normalizeRouteDate(req.body.routeDate);
    const assignment = await resolveAssignment(req.body, req.tenant.organizationId);
    const orderedLeadIds = Array.isArray(req.body.orderedLeadIds) ? req.body.orderedLeadIds.map(String) : [];

    if (!assignment.assignedRepName || !routeDate) {
      return res.status(400).json({ error: 'Rep and route date are required to reorder a route' });
    }

    const routeFilter = buildRepRouteFilter(
      assignment.assignedRepId,
      assignment.assignedRepName,
      routeDate,
      req.tenant.organizationId
    );
    const routeLeads = await Lead.find(routeFilter);
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
              assignedTeamId: assignment.assignedTeamId,
              assignedTeamName: assignment.assignedTeamName,
              assignedRepId: assignment.assignedRepId,
              assignedRep: assignment.assignedRepName,
              'routePlan.date': routeDate,
              'routePlan.order': index + 1,
            },
          }
        )
      )
    );

    const refreshedRoute = await Lead.find(routeFilter).sort({ 'routePlan.order': 1, createdAt: 1 });
    res.json(refreshedRoute);
  } catch (err) {
    if (
      err.message === 'Route date must be in YYYY-MM-DD format'
      || err.message === 'Selected team was not found'
      || err.message === 'Selected rep was not found'
      || err.message === 'Selected rep is inactive'
      || err.message === 'Selected rep does not belong to the selected team'
    ) {
      return res.status(400).json({ error: err.message });
    }
    res.status(400).json({ error: 'Could not reorder route' });
  }
});

// GET single lead
router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

// GET lead visit history
router.get('/:id/visits', async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const visits = await Visit.find({ lead: lead._id, organizationId: req.tenant.organizationId }).sort({ visitAt: -1, createdAt: -1 });
    res.json(visits);
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

// POST create visit log entry for a lead
router.post('/:id/visits', async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const visit = await Visit.create({
      organizationId: req.tenant.organizationId,
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
      const messages = Object.values(err.errors).map((error) => error.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create lead
router.post('/', async (req, res) => {
  try {
    const lead = await Lead.create(await normalizeLeadPayload(req.body, req.tenant.organizationId));
    await normalizeRouteOrders(routeContextFromLead(lead));
    res.status(201).json(lead);
  } catch (err) {
    if (
      err.message === 'Route date must be in YYYY-MM-DD format'
      || err.message === 'Route order must be a positive integer'
      || err.message === 'Selected team was not found'
      || err.message === 'Selected rep was not found'
      || err.message === 'Selected rep is inactive'
      || err.message === 'Selected rep does not belong to the selected team'
    ) {
      return res.status(400).json({ error: err.message });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((error) => error.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update lead
router.put('/:id', async (req, res) => {
  try {
    const existingLead = await Lead.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId });
    if (!existingLead) return res.status(404).json({ error: 'Lead not found' });

    const previousRouteContext = routeContextFromLead(existingLead);
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.tenant.organizationId },
      await normalizeLeadPayload(req.body, req.tenant.organizationId),
      {
      new: true,
      runValidators: true,
      }
    );

    await normalizeRouteOrders(previousRouteContext);
    await normalizeRouteOrders(routeContextFromLead(lead));
    res.json(lead);
  } catch (err) {
    if (
      err.message === 'Route date must be in YYYY-MM-DD format'
      || err.message === 'Route order must be a positive integer'
      || err.message === 'Selected team was not found'
      || err.message === 'Selected rep was not found'
      || err.message === 'Selected rep is inactive'
      || err.message === 'Selected rep does not belong to the selected team'
    ) {
      return res.status(400).json({ error: err.message });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((error) => error.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(400).json({ error: 'Invalid ID or data' });
  }
});

// DELETE lead
router.delete('/:id', async (req, res) => {
  try {
    const lead = await Lead.findOneAndDelete({ _id: req.params.id, organizationId: req.tenant.organizationId });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await Visit.deleteMany({ lead: lead._id, organizationId: req.tenant.organizationId });
    await normalizeRouteOrders(routeContextFromLead(lead));
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

module.exports = router;
