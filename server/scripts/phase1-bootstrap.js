require('dotenv').config();
const mongoose = require('mongoose');

const Organization = require('../models/Organization');
const Lead = require('../models/Lead');
const Team = require('../models/Team');
const Rep = require('../models/Rep');
const Visit = require('../models/Visit');

function missingOrganizationFilter() {
  return {
    $or: [
      { organizationId: { $exists: false } },
      { organizationId: null },
    ],
  };
}

async function ensureDefaultOrganization() {
  const slug = (process.env.DEFAULT_ORGANIZATION_SLUG || 'default-org').trim().toLowerCase();
  const name = (process.env.DEFAULT_ORGANIZATION_NAME || 'Default Organization').trim();

  let organization = await Organization.findOne({ slug });
  if (!organization) {
    organization = await Organization.create({ name, slug, status: 'active' });
    console.log(`Created organization: ${organization.name} (${organization.slug})`);
  } else {
    console.log(`Using existing organization: ${organization.name} (${organization.slug})`);
  }

  return organization;
}

async function backfillSimpleCollection(model, modelName, organizationId) {
  const result = await model.updateMany(missingOrganizationFilter(), {
    $set: { organizationId },
  });

  const modifiedCount = result.modifiedCount || 0;
  console.log(`${modelName}: backfilled ${modifiedCount} records`);
  return modifiedCount;
}

async function backfillVisits(organizationId) {
  const visitsMissingOrg = await Visit.find(missingOrganizationFilter()).select('_id lead');
  if (!visitsMissingOrg.length) {
    console.log('Visit: backfilled 0 records');
    return 0;
  }

  const leadIds = [...new Set(visitsMissingOrg.map((visit) => String(visit.lead)).filter(Boolean))];
  const leads = await Lead.find({ _id: { $in: leadIds } }).select('_id organizationId');
  const leadOrgMap = new Map(leads.map((lead) => [String(lead._id), lead.organizationId || organizationId]));

  const operations = visitsMissingOrg.map((visit) => ({
    updateOne: {
      filter: { _id: visit._id },
      update: {
        $set: {
          organizationId: leadOrgMap.get(String(visit.lead)) || organizationId,
        },
      },
    },
  }));

  if (!operations.length) {
    console.log('Visit: backfilled 0 records');
    return 0;
  }

  const result = await Visit.bulkWrite(operations, { ordered: false });
  const modifiedCount = result.modifiedCount || 0;
  console.log(`Visit: backfilled ${modifiedCount} records`);
  return modifiedCount;
}

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  try {
    const organization = await ensureDefaultOrganization();

    const leadCount = await backfillSimpleCollection(Lead, 'Lead', organization._id);
    const teamCount = await backfillSimpleCollection(Team, 'Team', organization._id);
    const repCount = await backfillSimpleCollection(Rep, 'Rep', organization._id);
    const visitCount = await backfillVisits(organization._id);

    console.log('Phase 1 bootstrap complete');
    console.log(`Summary: leads=${leadCount}, teams=${teamCount}, reps=${repCount}, visits=${visitCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(`Phase 1 bootstrap failed: ${error.message}`);
  process.exit(1);
});
