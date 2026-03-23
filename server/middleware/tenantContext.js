const Organization = require('../models/Organization');
const AppUser = require('../models/AppUser');
const Membership = require('../models/Membership');

const ROLE_ORDER = {
  canvasser: 10,
  manager: 20,
  admin: 30,
  owner: 40,
};

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getBooleanFromEnv(name, defaultValue) {
  const raw = trimString(process.env[name]).toLowerCase();
  if (!raw) {
    return defaultValue;
  }
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function roleAtLeast(role, minRole) {
  const roleWeight = ROLE_ORDER[role] || 0;
  const minRoleWeight = ROLE_ORDER[minRole] || Number.MAX_SAFE_INTEGER;
  return roleWeight >= minRoleWeight;
}

async function resolveOrganization(req, allowFallback) {
  const organizationId = trimString(req.header('x-organization-id'));
  const organizationSlug = trimString(req.header('x-organization-slug') || req.header('x-org-slug')).toLowerCase();

  if (organizationId) {
    return Organization.findOne({ _id: organizationId, status: 'active' });
  }

  if (organizationSlug) {
    return Organization.findOne({ slug: organizationSlug, status: 'active' });
  }

  if (!allowFallback) {
    return null;
  }

  const fallbackSlug = trimString(process.env.DEFAULT_ORGANIZATION_SLUG || 'default-org').toLowerCase();
  let fallbackOrganization = await Organization.findOne({ slug: fallbackSlug, status: 'active' });
  if (!fallbackOrganization) {
    fallbackOrganization = await Organization.create({
      slug: fallbackSlug,
      name: trimString(process.env.DEFAULT_ORGANIZATION_NAME || 'Default Organization'),
      status: 'active',
    });
  }

  return fallbackOrganization;
}

async function resolveUser(req, allowFallback) {
  const email = trimString(req.header('x-user-email')).toLowerCase();
  const provider = trimString(req.header('x-auth-provider'));
  const subject = trimString(req.header('x-auth-subject'));

  if (provider && subject) {
    let user = await AppUser.findOne({
      externalAuthProvider: provider,
      externalAuthSubject: subject,
    });

    if (!user && email) {
      user = await AppUser.findOne({ email });
      if (user) {
        user.externalAuthProvider = provider;
        user.externalAuthSubject = subject;
        await user.save();
      }
    }

    if (user) {
      return user;
    }

    return AppUser.create({
      externalAuthProvider: provider,
      externalAuthSubject: subject,
      email: email || `${provider}-${subject}@local.invalid`,
      displayName: trimString(req.header('x-user-name')),
      active: true,
    });
  }

  if (email) {
    const existing = await AppUser.findOne({ email });
    if (existing) {
      return existing;
    }

    return AppUser.create({
      email,
      displayName: trimString(req.header('x-user-name')),
      active: true,
    });
  }

  if (!allowFallback) {
    return null;
  }

  const fallbackEmail = trimString(process.env.DEFAULT_APP_USER_EMAIL || 'local-dev@leadtracker.local').toLowerCase();
  let fallbackUser = await AppUser.findOne({ email: fallbackEmail });
  if (!fallbackUser) {
    fallbackUser = await AppUser.create({
      email: fallbackEmail,
      displayName: 'Local Dev User',
      active: true,
    });
  }

  return fallbackUser;
}

function requireTenantContext({ minRole = 'canvasser' } = {}) {
  return async function tenantContextMiddleware(req, res, next) {
    try {
      const allowFallback = getBooleanFromEnv('ALLOW_LEGACY_TENANT_FALLBACK', true);

      const organization = await resolveOrganization(req, allowFallback);
      if (!organization) {
        return res.status(401).json({ error: 'Organization context is required' });
      }

      const user = await resolveUser(req, allowFallback);
      if (!user || !user.active) {
        return res.status(401).json({ error: 'User context is required' });
      }

      let membership = await Membership.findOne({
        userId: user._id,
        organizationId: organization._id,
      });

      if (!membership && allowFallback) {
        const bootstrapRole = trimString(process.env.DEFAULT_BOOTSTRAP_ROLE || 'owner').toLowerCase();
        membership = await Membership.create({
          userId: user._id,
          organizationId: organization._id,
          role: ROLE_ORDER[bootstrapRole] ? bootstrapRole : 'owner',
          status: 'active',
        });
      }

      if (!membership || membership.status !== 'active') {
        return res.status(403).json({ error: 'No active membership for this organization' });
      }

      if (!roleAtLeast(membership.role, minRole)) {
        return res.status(403).json({ error: 'Insufficient role permissions' });
      }

      req.tenant = {
        organizationId: organization._id,
        organizationSlug: organization.slug,
        userId: user._id,
        userEmail: user.email,
        membershipId: membership._id,
        role: membership.role,
      };

      return next();
    } catch (error) {
      return res.status(500).json({ error: 'Failed to resolve tenant context' });
    }
  };
}

module.exports = {
  requireTenantContext,
  roleAtLeast,
};