const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Visit = require('../models/Visit');

// GET all leads (with optional search/filter)
router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
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
      ];
    }

    const leads = await Lead.find(filter).sort({ createdAt: -1 });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
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
    const lead = await Lead.create(req.body);
    res.status(201).json(lead);
  } catch (err) {
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
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
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
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

module.exports = router;
