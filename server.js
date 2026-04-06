const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

app.use(express.static(path.join(__dirname)));

app.get('/api/members/:cid/atc', async (req, res) => {
  try {
    const cid = encodeURIComponent(req.params.cid);
    const query = new URLSearchParams(req.query).toString();
    const url = `https://api.vatsim.net/v2/members/${cid}/atc${query ? `?${query}` : ''}`;

    const response = await fetch(url);
    const body = await response.text();

    res.status(response.status);
    res.set('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
});
