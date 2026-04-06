export default async function handler(req, res) {
  const { cid } = req.query;
  const { limit } = req.query;

  try {
    const url = `https://api.vatsim.net/v2/members/${encodeURIComponent(cid)}/atc${limit ? `?limit=${limit}` : ''}`;
    const response = await fetch(url);
    const body = await response.text();

    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
