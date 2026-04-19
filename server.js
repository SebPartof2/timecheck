const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const ALLOWED_PREFIXES = ['HNL', 'OGG', 'ITO', 'KOA', 'NGF', 'BKH', 'BSF', 'HHI', 'JRF', 'MKK', 'GUM', 'GSN', 'UAM', 'ZUA'];

function callsignAllowed(callsign) {
  if (!callsign) return false;
  const upper = String(callsign).toUpperCase();
  return ALLOWED_PREFIXES.some(p => upper.startsWith(p));
}

app.use(express.static(path.join(__dirname)));

app.get('/api/members/:cid/atc', async (req, res) => {
  try {
    const cid = encodeURIComponent(req.params.cid);
    const url = `https://api.vatsim.net/v2/members/${cid}/atc?limit=1000000`;

    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      res.status(response.status);
      res.set('Content-Type', response.headers.get('content-type') || 'application/json');
      res.send(body);
      return;
    }

    const data = await response.json();
    const rawItems = data.items || data.results || [];
    const filtered = rawItems.filter(item => {
      const cs = (item.connection_id && item.connection_id.callsign) || item.callsign || '';
      return callsignAllowed(cs);
    });

    const limitParam = req.query.limit;
    const requestedLimit = limitParam ? Math.max(0, Number(limitParam)) : filtered.length;
    const items = Number.isFinite(requestedLimit) ? filtered.slice(0, requestedLimit) : filtered;

    res.status(200).json({
      ...data,
      count: filtered.length,
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
});
