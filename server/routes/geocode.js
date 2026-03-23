const express = require('express');

const router = express.Router();

router.get('/search', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query) {
    return res.status(400).json({ error: 'A search query is required' });
  }

  if (query.length > 200) {
    return res.status(400).json({ error: 'Search query is too long' });
  }

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      addressdetails: '1',
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': 'lead-tracker/1.0',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to search map location' });
    }

    const results = await response.json();
    const topResult = results[0];

    if (!topResult) {
      return res.status(404).json({ error: 'No matching map location found' });
    }

    return res.json({
      displayName: topResult.display_name,
      lat: Number(topResult.lat),
      lng: Number(topResult.lon),
      boundingBox: Array.isArray(topResult.boundingbox)
        ? topResult.boundingbox.map((value) => Number(value))
        : null,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to complete map search' });
  }
});

module.exports = router;