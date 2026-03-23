const Organization = require('../models/Organization');
const AppUser = require('../models/AppUser');
const Membership = require('../models/Membership');
const jwt = require('jsonwebtoken');

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

function parseBearerToken(req) {
  const authHeader = trimString(req.header('authorization'));
  if (!authHeader) {
    return '';
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? trimString(match[1]) : '';
}

function getJwtConfig() {
  const algorithm = trimString(process.env.AUTH_JWT_ALGORITHM || 'HS256').toUpperCase();
  const issuer = trimString(process.env.AUTH_JWT_ISSUER);
  const audience = trimString(process.env.AUTH_JWT_AUDIENCE);
  const secret = process.env.AUTH_JWT_SECRET;
  const publicKey = process.env.AUTH_JWT_PUBLIC_KEY;

  return {
    algorithm,
    issuer,
    audience,
    secret,
    publicKey,
  };
}

function buildVerifyKey(config) {
  const isHmac = config.algorithm.startsWith('HS');
  if (isHmac) {
    return config.secret || '';
  }

  if (!config.publicKey) {
    return '';
  }

  // Allow multiline PEM values in environment variables.
  return config.publicKey.replace(/\\n/g, '\n');
}

async function verifyJwtIdentity(req) {
  const token = parseBearerToken(req);
  if (!token) {
    return null;
  }

  const config = getJwtConfig();
  const verifyKey = buildVerifyKey(config);
  if (!verifyKey) {
    throw new Error('JWT verification is not configured');
  }

  const verifyOptions = {
    algorithms: [config.algorithm],
  };
  if (config.issuer) {
    verifyOptions.issuer = config.issuer;
  }
  if (config.audience) {
    verifyOptions.audience = config.audience;
  }

  const claims = jwt.verify(token, verifyKey, verifyOptions);

  return {
    provider: 'jwt',
    subject: trimString(claims.sub),
    email: trimString(claims.email || claims.preferred_username || claims.upn).toLowerCase(),
    displayName: trimString(claims.name),
    organizationId: trimString(claims.organizationId || claims.org_id || claims.orgId),
    organizationSlug: trimString(claims.organizationSlug || claims.org_slug || claims.orgSlug).toLowerCase(),
    claims,
  };
}

async function resolveOrganization(req, allowFallback, identity = null) {
  const tokenOrganizationId = trimString(identity?.organizationId);
  const tokenOrganizationSlug = trimString(identity?.organizationSlug).toLowerCase();
  const organizationId = trimString(req.header('x-organization-id'));
  const organizationSlug = trimString(req.header('x-organization-slug') || req.header('x-org-slug')).toLowerCase();

  if (tokenOrganizationId) {
    return Organization.findOne({ _id: tokenOrganizationId, status: 'active' });
  }

  if (tokenOrganizationSlug) {
    return Organization.findOne({ slug: tokenOrganizationSlug, status: 'active' });
  }

  if (allowFallback && organizationId) {
    return Organization.findOne({ _id: organizationId, status: 'active' });
  }

  if (allowFallback && organizationSlug) {
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

async function resolveUser(req, allowFallback, identity = null) {
  const tokenEmail = trimString(identity?.email).toLowerCase();
  const tokenProvider = trimString(identity?.provider);
  const tokenSubject = trimString(identity?.subject);

  if (tokenProvider && tokenSubject) {
    let user = await AppUser.findOne({
      externalAuthProvider: tokenProvider,
      externalAuthSubject: tokenSubject,
    });

    if (!user && tokenEmail) {
      user = await AppUser.findOne({ email: tokenEmail });
      if (user) {
        user.externalAuthProvider = tokenProvider;
        user.externalAuthSubject = tokenSubject;
        if (!user.displayName && identity.displayName) {
          user.displayName = identity.displayName;
        }
        await user.save();
      }
    }

    if (user) {
      return user;
    }

    return AppUser.create({
      externalAuthProvider: tokenProvider,
      externalAuthSubject: tokenSubject,
      email: tokenEmail || `${tokenProvider}-${tokenSubject}@local.invalid`,
      displayName: trimString(identity.displayName),
      active: true,
    });
  }

  const email = trimString(req.header('x-user-email')).toLowerCase();
  const provider = trimString(req.header('x-auth-provider'));
  const subject = trimString(req.header('x-auth-subject'));

  if (allowFallback && provider && subject) {
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

  if (allowFallback && email) {
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
      let identity = null;

      try {
        identity = await verifyJwtIdentity(req);
      } catch (error) {
        return res.status(401).json({ error: 'Invalid bearer token' });
      }

      if (!allowFallback && !identity) {
        return res.status(401).json({ error: 'Bearer token is required' });
      }

      const organization = await resolveOrganization(req, allowFallback, identity);
      if (!organization) {
        return res.status(401).json({ error: 'Organization context is required' });
      }

      const user = await resolveUser(req, allowFallback, identity);
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
        authProvider: identity?.provider || 'legacy',
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