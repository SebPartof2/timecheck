const ALLOWED_PREFIXES = ['HNL', 'OGG', 'ITO', 'KOA', 'NGF', 'BKH', 'BSF', 'HHI', 'JRF', 'MKK', 'GUM', 'GSN', 'UAM', 'ZUA'];

function callsignAllowed(callsign) {
  if (!callsign) return false;
  const upper = String(callsign).toUpperCase();
  return ALLOWED_PREFIXES.some(p => upper.startsWith(p));
}

export default async function handler(req, res) {
  const { cid, limit } = req.query;

  try {
    const url = `https://api.vatsim.net/v2/members/${encodeURIComponent(cid)}/atc?limit=1000000`;
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
      res.send(body);
      return;
    }

    const data = await response.json();
    const rawItems = data.items || data.results || [];
    const filtered = rawItems.filter(item => {
      const cs = (item.connection_id && item.connection_id.callsign) || item.callsign || '';
      return callsignAllowed(cs);
    });

    const requestedLimit = limit ? Math.max(0, Number(limit)) : filtered.length;
    const items = Number.isFinite(requestedLimit) ? filtered.slice(0, requestedLimit) : filtered;

    res.status(200).json({
      ...data,
      count: filtered.length,
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
