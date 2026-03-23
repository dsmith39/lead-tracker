const express = require('express');

const router = express.Router();

function mapNominatimAddress(address = {}) {
  return {
    street: [address.house_number, address.road].filter(Boolean).join(' ').trim(),
    city: address.city || address.town || address.village || address.hamlet || '',
    state: address.state || '',
    postalCode: address.postcode || '',
    country: address.country || '',
  };
}

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

router.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Valid lat and lng values are required' });
  }

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '18',
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: {
        'User-Agent': 'lead-tracker/1.0',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to reverse geocode map location' });
    }

    const result = await response.json();
    const mappedAddress = mapNominatimAddress(result.address);

    return res.json({
      displayName: result.display_name || '',
      address: mappedAddress,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to complete reverse geocoding' });
  }
});

module.exports = router;