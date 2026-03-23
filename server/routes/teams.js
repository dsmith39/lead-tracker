const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const Rep = require('../models/Rep');
const Lead = require('../models/Lead');

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

router.get('/', async (req, res) => {
  try {
    const teams = await Team.find({ organizationId: req.tenant.organizationId }).sort({ name: 1 });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const team = await Team.create({
      organizationId: req.tenant.organizationId,
      name: trimString(req.body.name),
      notes: trimString(req.body.notes),
    });
    res.status(201).json(team);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'A team with that name already exists' });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((error) => error.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const team = await Team.findOneAndDelete({ _id: req.params.id, organizationId: req.tenant.organizationId });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    await Rep.updateMany(
      { teamId: team._id, organizationId: req.tenant.organizationId },
      { $set: { teamId: null } }
    );
    await Lead.updateMany(
      { assignedTeamId: team._id, organizationId: req.tenant.organizationId },
      {
        $set: {
          assignedTeamId: null,
          assignedTeamName: '',
        },
      }
    );

    res.json({ message: 'Team deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

module.exports = router;