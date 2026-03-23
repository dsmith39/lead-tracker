const express = require('express');

const router = express.Router();

router.get('/me', async (req, res) => {
  res.json({
    user: {
      id: req.tenant.userId,
      email: req.tenant.userEmail,
    },
    organization: {
      id: req.tenant.organizationId,
      slug: req.tenant.organizationSlug,
    },
    role: req.tenant.role,
  });
});

module.exports = router;
