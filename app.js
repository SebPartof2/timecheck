const API_BASE = 'https://api.vatsim.net/v2/members';

let facilitiesCache = null;

async function loadFacilities() {
  if (facilitiesCache) return facilitiesCache;
  const res = await fetch('./facilities.json');
  if (!res.ok) throw new Error('Failed to load facilities config');
  const data = await res.json();
  facilitiesCache = data.facilities.map(f => ({
    name: f.name,
    regex: new RegExp(f.pattern),
    requiredRating: f.requiredRating
  }));
  return facilitiesCache;
}

async function fetchATCSessions(cid) {
  const url = `${API_BASE}/${cid}/atc`;

  // First call: get total count
  const countRes = await fetch(`${url}?limit=1`);
  if (!countRes.ok) {
    if (countRes.status === 404) throw new Error('CID not found');
    throw new Error(`API error: ${countRes.status}`);
  }
  const countData = await countRes.json();
  const total = countData.count;

  if (total === 0) return { count: 0, sessions: [] };

  // Second call: fetch all sessions
  const allRes = await fetch(`${url}?limit=${total}`);
  if (!allRes.ok) throw new Error(`API error fetching sessions: ${allRes.status}`);
  const allData = await allRes.json();

  return { count: total, sessions: allData.items || allData.results || [] };
}

function calculateHours(sessions, facilities) {
  const results = facilities.map(f => ({ name: f.name, sessions: 0, hours: 0 }));
  const unmatched = { name: 'Unmatched', sessions: 0, hours: 0 };

  for (const session of sessions) {
    const hours = session.minutes_on_callsign != null
      ? session.minutes_on_callsign / 60
      : (session.end && session.start)
        ? (new Date(session.end) - new Date(session.start)) / 3600000
        : 0;

    let matched = false;
    for (let i = 0; i < facilities.length; i++) {
      const f = facilities[i];
      if (f.regex.test(session.callsign)) {
        if (f.requiredRating == null || session.rating === f.requiredRating) {
          results[i].sessions++;
          results[i].hours += hours;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      unmatched.sessions++;
      unmatched.hours += hours;
    }
  }

  return { facilityResults: results, unmatched };
}

function renderResults(cid, totalCount, { facilityResults, unmatched }) {
  document.getElementById('summary').textContent =
    `Results for CID ${cid} — ${totalCount} total session${totalCount !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('results-body');
  tbody.innerHTML = '';

  let totalSessions = 0;
  let totalHours = 0;

  for (const r of facilityResults) {
    if (r.sessions === 0) continue;
    totalSessions += r.sessions;
    totalHours += r.hours;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.name}</td><td>${r.sessions}</td><td>${r.hours.toFixed(1)}</td>`;
    tbody.appendChild(tr);
  }

  if (unmatched.sessions > 0) {
    totalSessions += unmatched.sessions;
    totalHours += unmatched.hours;
    const tr = document.createElement('tr');
    tr.className = 'row-unmatched';
    tr.innerHTML = `<td>${unmatched.name}</td><td>${unmatched.sessions}</td><td>${unmatched.hours.toFixed(1)}</td>`;
    tbody.appendChild(tr);
  }

  // Total row
  const totalRow = document.createElement('tr');
  totalRow.className = 'row-total';
  totalRow.innerHTML = `<td>Total</td><td>${totalSessions}</td><td>${totalHours.toFixed(1)}</td>`;
  tbody.appendChild(totalRow);

  show('results');
}

function show(id) {
  ['loading', 'error', 'results'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

function showError(message) {
  document.getElementById('error').textContent = message;
  show('error');
}

async function handleCheck() {
  const input = document.getElementById('cid-input');
  const btn = document.getElementById('check-btn');
  const cid = input.value.trim();

  if (!cid || !/^\d+$/.test(cid)) {
    showError('Please enter a valid numeric CID.');
    return;
  }

  btn.disabled = true;
  show('loading');

  try {
    const [facilities, { count, sessions }] = await Promise.all([
      loadFacilities(),
      fetchATCSessions(cid)
    ]);

    if (count === 0) {
      showError('No ATC sessions found for this CID.');
      return;
    }

    const hours = calculateHours(sessions, facilities);
    renderResults(cid, count, hours);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('check-btn').addEventListener('click', handleCheck);
  document.getElementById('cid-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCheck();
  });
});
