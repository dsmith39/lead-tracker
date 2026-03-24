const crypto = require('crypto');
const express = require('express');

const AppUser = require('../models/AppUser');
const Membership = require('../models/Membership');
const MembershipInvite = require('../models/MembershipInvite');

const router = express.Router();

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

router.post('/accept', async (req, res) => {
  try {
    const token = trimString(req.body.token);
    const displayName = trimString(req.body.displayName);

    if (!token) {
      return res.status(400).json({ error: 'Invite token is required' });
    }

    const tokenHash = hashToken(token);
    const invite = await MembershipInvite.findOne({ tokenHash });
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Invite is no longer valid' });
    }

    if (invite.expiresAt <= new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ error: 'Invite has expired' });
    }

    let user = await AppUser.findOne({ email: invite.email });
    if (!user) {
      user = await AppUser.create({
        email: invite.email,
        displayName,
        active: true,
      });
    } else if (displayName && !user.displayName) {
      user.displayName = displayName;
      await user.save();
    }

    await Membership.findOneAndUpdate(
      {
        userId: user._id,
        organizationId: invite.organizationId,
      },
      {
        $set: {
          role: invite.role,
          status: 'active',
        },
      },
      {
        upsert: true,
        new: true,
      }
    );

    invite.status = 'accepted';
    invite.acceptedAt = new Date();
    invite.acceptedByUserId = user._id;
    await invite.save();

    return res.json({
      message: 'Invite accepted',
      membership: {
        organizationId: invite.organizationId,
        role: invite.role,
      },
      user: {
        email: user.email,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((item) => item.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
