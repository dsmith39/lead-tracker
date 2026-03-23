const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Rep = require('../models/Rep');
const Team = require('../models/Team');
const Lead = require('../models/Lead');

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function normalizeRoutesForRep(repId) {
  const affectedRoutes = await Lead.aggregate([
    {
      $match: {
        assignedRepId: new mongoose.Types.ObjectId(repId),
        'routePlan.date': { $ne: null },
      },
    },
    {
      $group: {
        _id: '$routePlan.date',
      },
    },
  ]);

  const repLeads = await Lead.find({ assignedRepId: repId });
  const repName = repLeads[0]?.assignedRep || '';

  await Promise.all(
    affectedRoutes.map(async ({ _id: routeDate }) => {
      const routeLeads = await Lead.find({
        assignedRepId: repId,
        'routePlan.date': routeDate,
      }).sort({ 'routePlan.order': 1, createdAt: 1 });

      await Promise.all(
        routeLeads.map((lead, index) =>
          Lead.updateOne(
            { _id: lead._id },
            {
              $set: {
                assignedRep: repName,
                'routePlan.order': index + 1,
              },
            }
          )
        )
      );
    })
  );
}

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.teamId) {
      filter.teamId = req.query.teamId;
    }
    if (req.query.active === 'true') {
      filter.active = true;
    }

    const reps = await Rep.find(filter).sort({ name: 1 }).populate('teamId', 'name');
    res.json(
      reps.map((rep) => ({
        _id: rep._id,
        name: rep.name,
        email: rep.email,
        phone: rep.phone,
        active: rep.active,
        teamId: rep.teamId?._id || null,
        teamName: rep.teamId?.name || '',
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    let teamId = req.body.teamId || null;
    if (teamId) {
      const team = await Team.findById(teamId);
      if (!team) {
        return res.status(400).json({ error: 'Selected team was not found' });
      }
      teamId = team._id;
    }

    const rep = await Rep.create({
      name: trimString(req.body.name),
      email: trimString(req.body.email),
      phone: trimString(req.body.phone),
      teamId,
      active: req.body.active !== false,
    });

    const createdRep = await Rep.findById(rep._id).populate('teamId', 'name');
    res.status(201).json({
      _id: createdRep._id,
      name: createdRep.name,
      email: createdRep.email,
      phone: createdRep.phone,
      active: createdRep.active,
      teamId: createdRep.teamId?._id || null,
      teamName: createdRep.teamId?.name || '',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'That rep already exists for the selected team' });
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
    const rep = await Rep.findByIdAndDelete(req.params.id);
    if (!rep) return res.status(404).json({ error: 'Rep not found' });

    await Lead.updateMany(
      { assignedRepId: rep._id },
      {
        $set: {
          assignedRepId: null,
          assignedRep: '',
          'routePlan.date': null,
          'routePlan.order': null,
        },
      }
    );

    await normalizeRoutesForRep(rep._id);
    res.json({ message: 'Rep deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

module.exports = router;