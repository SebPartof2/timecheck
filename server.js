require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3001;

const fetchPromise = import('node-fetch').then(({ default: f }) => f);
const fetch = async (...args) => (await fetchPromise)(...args);

const VATSIM_OAUTH_BASE = process.env.VATSIM_OAUTH_BASE || 'https://auth.vatsim.net';
const VATSIM_CLIENT_ID = process.env.VATSIM_CLIENT_ID;
const VATSIM_CLIENT_SECRET = process.env.VATSIM_CLIENT_SECRET;
const VATSIM_REDIRECT_URI = process.env.VATSIM_REDIRECT_URI || '';
const VATUSA_API_BASE = (process.env.VATUSA_API_BASE || 'https://api.vatusa.net/v2').replace(/\/+$/, '');
const VATUSA_API_KEY = process.env.VATUSA_API_KEY || '';
const VATUSA_FACILITY = process.env.VATUSA_FACILITY || 'HCF';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEBUG_CID = process.env.DEBUG_CID || '';

const ALLOWED_FACILITY = 'HCF';
const ALLOWED_ROLES = ['ATM', 'DATM', 'INS', 'FE'];

function createRateLimiter(perSecond) {
  const minGap = 1000 / perSecond;
  let next = 0;
  return async function wait() {
    const now = Date.now();
    const target = Math.max(now, next);
    next = target + minGap;
    const delay = target - now;
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
  };
}

const VATSIM_RPS = Number(process.env.VATSIM_RPS) || 2;
const vatsimWait = createRateLimiter(VATSIM_RPS);

async function vatsimFetch(url, opts = {}) {
  const fetchFn = await fetchPromise;
  for (let attempt = 0; attempt < 4; attempt++) {
    await vatsimWait();
    const r = await fetchFn(url, opts);
    if (r.status !== 429 && r.status !== 503) return r;
    const retryAfterHeader = r.headers.get('retry-after');
    const retryAfter = Number(retryAfterHeader) || Math.min(2 ** attempt, 8);
    await new Promise(res => setTimeout(res, retryAfter * 1000));
  }
  await vatsimWait();
  return fetchFn(url, opts);
}

function buildRedirectUri(req) {
  if (VATSIM_REDIRECT_URI) return VATSIM_REDIRECT_URI;
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('host');
  return `${proto}://${host}/auth/callback`;
}

app.set('trust proxy', 1);

app.use(session({
  name: 'timecheck.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method === 'GET' && !req.path.startsWith('/auth/')) {
    req.session.returnTo = req.originalUrl;
  }
  return res.redirect('/auth/login');
}

app.get('/auth/login', (req, res) => {
  if (!VATSIM_CLIENT_ID || !VATSIM_CLIENT_SECRET) {
    return res.status(500).send('VATSIM Connect is not configured. Set VATSIM_CLIENT_ID and VATSIM_CLIENT_SECRET.');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauth_state = state;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: VATSIM_CLIENT_ID,
    redirect_uri: buildRedirectUri(req),
    scope: '',
    state
  });
  res.redirect(`${VATSIM_OAUTH_BASE}/oauth/authorize?${params.toString()}`);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session.oauth_state) {
      return res.status(400).send('Invalid OAuth state. <a href="/auth/login">Try again</a>.');
    }
    delete req.session.oauth_state;

    const tokenRes = await fetch(`${VATSIM_OAUTH_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: VATSIM_CLIENT_ID,
        client_secret: VATSIM_CLIENT_SECRET,
        redirect_uri: buildRedirectUri(req),
        code: String(code)
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return res.status(502).send(`Token exchange failed: ${escapeHtml(text)}`);
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.status(502).send('VATSIM Connect did not return an access token');
    }

    const userRes = await fetch(`${VATSIM_OAUTH_BASE}/api/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    });
    if (!userRes.ok) {
      const text = await userRes.text();
      return res.status(502).send(`Failed to fetch VATSIM user: ${escapeHtml(text)}`);
    }
    const userData = await userRes.json();
    const vatsimCid = userData?.data?.cid || userData?.cid || userData?.data?.id || userData?.id;
    if (!vatsimCid) {
      return res.status(502).send('VATSIM did not return a CID');
    }

    const cid = DEBUG_CID || vatsimCid;
    if (DEBUG_CID) {
      console.warn(`[DEBUG_CID] VATSIM returned ${vatsimCid}; overriding to ${DEBUG_CID} for VATUSA lookup and session.`);
    }

    const vatusaRes = await fetch(`${VATUSA_API_BASE}/user/${encodeURIComponent(cid)}`, {
      headers: { Accept: 'application/json' }
    });
    if (!vatusaRes.ok) {
      return renderDenied(res, { cid, reason: 'You do not appear to be a VATUSA member.' });
    }
    const vatusaData = await vatusaRes.json();
    const profile = vatusaData?.data || vatusaData;
    const fname = profile?.fname || '';
    const lname = profile?.lname || '';
    const rating = profile?.rating_short || profile?.rating || '';
    const roles = Array.isArray(profile?.roles) ? profile.roles : [];

    const matchingRoles = roles
      .filter(r => r && r.facility === ALLOWED_FACILITY && ALLOWED_ROLES.includes(r.role))
      .map(r => `${r.facility}:${r.role}`);

    if (matchingRoles.length === 0) {
      const denyName = (lname && fname) ? `${lname}, ${fname}` : (lname || fname || '');
      return renderDenied(res, {
        cid,
        name: denyName,
        reason: `Access is restricted to HCF staff (${ALLOWED_ROLES.join(', ')}).`
      });
    }

    req.session.user = {
      cid: String(cid),
      fname: String(fname || ''),
      lname: String(lname || ''),
      rating: String(rating || ''),
      roles: matchingRoles
    };
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    res.status(500).send(`OAuth error: ${escapeHtml(err.message)}`);
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('timecheck.sid');
    res.redirect('/auth/login');
  });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('timecheck.sid');
    res.redirect('/auth/login');
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.session.user);
});

app.get('/api/facilities', requireAuth, (req, res) => {
  const fs = require('fs');
  fs.readFile(path.join(__dirname, 'facilities.json'), 'utf-8', (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    let parsed;
    try { parsed = JSON.parse(data); } catch (e) { return res.status(500).json({ error: 'Invalid facilities.json' }); }
    res.json({ ...parsed, homeFacility: VATUSA_FACILITY });
  });
});

app.get('/api/user/:cid', requireAuth, async (req, res) => {
  try {
    const cid = encodeURIComponent(req.params.cid);
    const url = `${VATUSA_API_BASE}/user/${cid}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) {
      return res.status(r.status === 404 ? 404 : 502).json({ error: 'VATUSA lookup failed' });
    }
    const parsed = await r.json();
    const profile = parsed?.data || parsed;
    res.json({
      cid: String(profile?.cid || req.params.cid),
      fname: profile?.fname || '',
      lname: profile?.lname || '',
      facility: profile?.facility || '',
      rating: profile?.rating_short || profile?.rating || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/promotions/:cid', requireAuth, async (req, res) => {
  if (!VATUSA_API_KEY) {
    return res.status(500).json({ error: 'VATUSA_API_KEY is not configured' });
  }
  try {
    const cid = encodeURIComponent(req.params.cid);
    const unversionedBase = VATUSA_API_BASE.replace(/\/v\d+$/, '');
    const url = `${unversionedBase}/user/${cid}/rating/history?apikey=${encodeURIComponent(VATUSA_API_KEY)}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await r.text();
    if (!r.ok) {
      if (r.status === 404 || r.status === 403) {
        return res.json({ count: 0, items: [] });
      }
      return res.status(r.status).json({
        error: 'VATUSA promotions fetch failed',
        status: r.status,
        body: text.slice(0, 500),
      });
    }
    let parsed;
    try { parsed = JSON.parse(text); } catch { return res.json({ count: 0, items: [] }); }
    const items = Array.isArray(parsed?.data) ? parsed.data : (Array.isArray(parsed) ? parsed : []);
    res.json({ count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/training/:cid', requireAuth, async (req, res) => {
  if (!VATUSA_API_KEY) {
    return res.status(500).json({ error: 'VATUSA_API_KEY is not configured' });
  }
  try {
    const cid = encodeURIComponent(req.params.cid);
    const unversionedBase = VATUSA_API_BASE.replace(/\/v\d+$/, '');
    const url = `${unversionedBase}/user/${cid}/training/records?apikey=${encodeURIComponent(VATUSA_API_KEY)}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await r.text();
    if (!r.ok) {
      if (r.status === 404 || r.status === 403) {
        return res.json({ count: 0, items: [] });
      }
      return res.status(r.status).json({
        error: 'VATUSA training fetch failed',
        status: r.status,
        body: text.slice(0, 500),
      });
    }
    let parsed;
    try { parsed = JSON.parse(text); } catch { return res.json({ count: 0, items: [] }); }
    const items = Array.isArray(parsed?.data) ? parsed.data : (Array.isArray(parsed) ? parsed : []);
    res.json({ count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/roster/:membership', requireAuth, async (req, res) => {
  const membership = req.params.membership;
  if (!['home', 'visit', 'both'].includes(membership)) {
    return res.status(400).json({ error: 'membership must be home, visit, or both' });
  }
  if (!VATUSA_API_KEY) {
    return res.status(500).json({ error: 'VATUSA_API_KEY is not configured' });
  }
  try {
    const url = `${VATUSA_API_BASE}/facility/${encodeURIComponent(VATUSA_FACILITY)}/roster/${membership}?apikey=${encodeURIComponent(VATUSA_API_KEY)}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({ error: 'VATUSA roster fetch failed', status: r.status, body: text.slice(0, 500) });
    }
    let parsed;
    try { parsed = JSON.parse(text); } catch { return res.status(502).json({ error: 'Invalid JSON from VATUSA' }); }
    const items = Array.isArray(parsed?.data) ? parsed.data : (Array.isArray(parsed) ? parsed : []);
    const users = items.map(u => ({
      cid: u.cid,
      fname: u.fname || u.first_name || '',
      lname: u.lname || u.last_name || '',
      rating: u.rating_short || u.rating || '',
      facility: u.facility || u.facility_join || ''
    })).filter(u => u.cid != null);
    res.json({ membership, facility: VATUSA_FACILITY, count: users.length, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members/:cid/atc', requireAuth, async (req, res) => {
  try {
    const cid = encodeURIComponent(req.params.cid);
    const baseUrl = `https://api.vatsim.net/v2/members/${cid}/atc`;

    const countRes = await vatsimFetch(`${baseUrl}?limit=1`);
    if (!countRes.ok) {
      const body = await countRes.text();
      res.status(countRes.status);
      res.set('Content-Type', countRes.headers.get('content-type') || 'application/json');
      res.send(body);
      return;
    }
    const countData = await countRes.json();
    const total = Number(countData.count) || 0;

    if (total === 0) {
      return res.status(200).json({ count: 0, items: [] });
    }

    const allRes = await vatsimFetch(`${baseUrl}?limit=${total}`);
    if (!allRes.ok) {
      const body = await allRes.text();
      res.status(allRes.status);
      res.set('Content-Type', allRes.headers.get('content-type') || 'application/json');
      res.send(body);
      return;
    }
    const allData = await allRes.json();
    const items = allData.items || allData.results || [];

    res.status(200).json({ count: total, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use(requireAuth);

const webDist = path.join(__dirname, 'web', 'dist');
app.use(express.static(webDist));
app.get('*', (req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return next();
  res.sendFile(path.join(webDist, 'index.html'));
});

function renderDenied(res, { cid, name, reason }) {
  const safeName = escapeHtml(name || '');
  const safeCid = escapeHtml(String(cid || ''));
  const safeReason = escapeHtml(reason || 'Access denied.');
  res.status(403).send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Access denied</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e; color: #e0e0e0; min-height: 100vh; display: flex;
    align-items: center; justify-content: center; padding: 24px; margin: 0; }
  .card { max-width: 480px; background: #16213e; border: 1px solid #333;
    border-radius: 8px; padding: 28px; }
  h1 { margin: 0 0 12px; font-size: 1.3rem; color: #ff6b6b; }
  p { margin: 0 0 12px; line-height: 1.5; }
  .meta { color: #888; font-size: 0.9rem; }
  a.btn { display: inline-block; margin-top: 12px; padding: 8px 16px;
    background: #0f3460; color: #fff; text-decoration: none; border-radius: 6px; }
  a.btn:hover { background: #1a4a7a; }
</style></head>
<body><div class="card">
  <h1>Access denied</h1>
  <p>${safeReason}</p>
  ${safeName || safeCid ? `<p class="meta">Signed in as ${safeName} (CID ${safeCid})</p>` : ''}
  <a class="btn" href="/auth/logout">Sign out and try again</a>
</div></body></html>`);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
});
