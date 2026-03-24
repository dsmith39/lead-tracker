const crypto = require('crypto');
const express = require('express');

const AppUser = require('../models/AppUser');
const Membership = require('../models/Membership');
const MembershipInvite = require('../models/MembershipInvite');

const router = express.Router();

const ROLE_ORDER = {
  canvasser: 10,
  manager: 20,
  admin: 30,
  owner: 40,
};

const MANAGER_ALLOWED_ROLES = new Set(['canvasser', 'manager']);
const INVITE_TTL_DAYS = Number.parseInt(process.env.INVITE_TTL_DAYS || '7', 10);

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sanitizeInvite(invite) {
  return {
    id: invite._id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  };
}

function canAssignRole(inviterRole, inviteRole) {
  if (!ROLE_ORDER[inviteRole]) {
    return false;
  }

  if (inviterRole === 'manager') {
    return MANAGER_ALLOWED_ROLES.has(inviteRole);
  }

  return ROLE_ORDER[inviterRole] >= ROLE_ORDER[inviteRole];
}

function buildInviteUrl(req, token) {
  const appBaseUrl = trimString(process.env.APP_BASE_URL) || `${req.protocol}://${req.get('host')}`;
  const safeBase = appBaseUrl.replace(/\/$/, '');
  return `${safeBase}/accept-invite.html?token=${encodeURIComponent(token)}`;
}

async function markExpiredInvites(organizationId) {
  await MembershipInvite.updateMany(
    {
      organizationId,
      status: 'pending',
      expiresAt: { $lte: new Date() },
    },
    { $set: { status: 'expired' } }
  );
}

router.get('/invites', async (req, res) => {
  try {
    await markExpiredInvites(req.tenant.organizationId);

    const invites = await MembershipInvite.find({
      organizationId: req.tenant.organizationId,
      status: 'pending',
    }).sort({ createdAt: -1 });

    return res.json(invites.map(sanitizeInvite));
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/invites', async (req, res) => {
  try {
    const organizationId = req.tenant.organizationId;
    const inviterRole = req.tenant.role;
    const email = trimString(req.body.email).toLowerCase();
    const role = trimString(req.body.role || 'canvasser').toLowerCase();

    if (!email) {
      return res.status(400).json({ error: 'Invite email is required' });
    }

    if (!canAssignRole(inviterRole, role)) {
      return res.status(403).json({ error: 'You cannot invite that role' });
    }

    const existingUser = await AppUser.findOne({ email });
    if (existingUser) {
      const existingMembership = await Membership.findOne({
        userId: existingUser._id,
        organizationId,
        status: 'active',
      });

      if (existingMembership) {
        return res.status(400).json({ error: 'This user already has an active membership' });
      }
    }

    await markExpiredInvites(organizationId);
    await MembershipInvite.deleteMany({
      organizationId,
      email,
      status: 'pending',
    });

    const token = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await MembershipInvite.create({
      organizationId,
      email,
      role,
      tokenHash,
      invitedByUserId: req.tenant.userId,
      expiresAt,
    });

    return res.status(201).json({
      invite: sanitizeInvite(invite),
      inviteUrl: buildInviteUrl(req, token),
      token,
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
