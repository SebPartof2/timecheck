const API_BASE = '/api/members';

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

function calculateHours(sessions, facilities, startDate = null, endDate = null) {
  const results = facilities.map(f => ({ name: f.name, sessions: 0, hours: 0, tracked: 0 }));
  const unmatched = { name: 'Unmatched', sessions: 0, hours: 0, tracked: 0 };
  const sessionDetails = [];

  const startTime = startDate ? new Date(startDate).getTime() : null;
  const endTime = endDate ? new Date(endDate).getTime() : null;

  for (const session of sessions) {
    const data = session.connection_id || session;
    const callsign = data.callsign || session.callsign || '';
    const rating = data.rating ?? session.rating;
    const tracked = session.aircrafttracked != null ? session.aircrafttracked : 0;

    const sessionStart = data.start ? new Date(data.start).getTime() : null;
    const sessionEnd = data.end ? new Date(data.end).getTime() : null;

    // Filter by date range
    if (startTime && sessionEnd && sessionEnd < startTime) continue;
    if (endTime && sessionStart && sessionStart > endTime) continue;

    const hours = session.minutes_on_callsign != null
      ? session.minutes_on_callsign / 60
      : (data.end && data.start)
        ? (new Date(data.end) - new Date(data.start)) / 3600000
        : 0;

    let facilityName = 'Unmatched';
    let matched = false;
    for (let i = 0; i < facilities.length; i++) {
      const f = facilities[i];
      if (f.regex.test(callsign)) {
        const ratingValue = rating != null ? Number(rating) : null;
        const requiredRatingValue = f.requiredRating != null ? Number(f.requiredRating) : null;
        if (requiredRatingValue == null || (ratingValue != null && ratingValue >= requiredRatingValue)) {
          results[i].sessions++;
          results[i].hours += hours;
          results[i].tracked += tracked;
          facilityName = f.name;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      unmatched.sessions++;
      unmatched.hours += hours;
      unmatched.tracked += tracked;
    }

    sessionDetails.push({
      facility: facilityName,
      callsign,
      rating,
      start: data.start || '',
      end: data.end || '',
      hours,
      tracked
    });
  }

  sessionDetails.sort((a, b) => {
    const aDate = new Date(a.end || a.start || 0).getTime();
    const bDate = new Date(b.end || b.start || 0).getTime();
    return bDate - aDate;
  });

  return { facilityResults: results, unmatched, sessionDetails };
}

function renderResults(cid, totalCount, { facilityResults, unmatched, sessionDetails }) {
  document.getElementById('summary').textContent =
    `Results for CID ${cid} — ${totalCount} total session${totalCount !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('results-body');
  tbody.innerHTML = '';

  let totalSessions = 0;
  let totalHours = 0;
  let totalTracked = 0;

  for (const r of facilityResults) {
    if (r.sessions === 0) continue;
    totalSessions += r.sessions;
    totalHours += r.hours;
    totalTracked += r.tracked;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.name}</td><td>${r.sessions}</td><td>${r.hours.toFixed(1)}</td><td>${r.tracked}</td>`;
    tbody.appendChild(tr);
  }

  if (unmatched.sessions > 0) {
    totalSessions += unmatched.sessions;
    totalHours += unmatched.hours;
    totalTracked += unmatched.tracked;
    const tr = document.createElement('tr');
    tr.className = 'row-unmatched';
    tr.innerHTML = `<td>${unmatched.name}</td><td>${unmatched.sessions}</td><td>${unmatched.hours.toFixed(1)}</td><td>${unmatched.tracked}</td>`;
    tbody.appendChild(tr);
  }

  const totalRow = document.createElement('tr');
  totalRow.className = 'row-total';
  totalRow.innerHTML = `<td>Total</td><td>${totalSessions}</td><td>${totalHours.toFixed(1)}</td><td>${totalTracked}</td>`;
  tbody.appendChild(totalRow);

  renderSessionDetails(sessionDetails);
  show('results');
}

function renderSessionDetails(details) {
  const section = document.getElementById('sessions');
  const wrapper = document.getElementById('sessions-table-wrapper');
  const body = document.getElementById('sessions-body');
  body.innerHTML = '';

  for (const session of details) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${session.facility}</td>
      <td>${session.callsign}</td>
      <td>${session.rating ?? ''}</td>
      <td>${session.start ? new Date(session.start).toLocaleString() : ''}</td>
      <td>${session.end ? new Date(session.end).toLocaleString() : ''}</td>
      <td>${session.hours.toFixed(1)}</td>
      <td>${session.tracked}</td>
    `;
    body.appendChild(tr);
  }

  section.classList.remove('hidden');
  wrapper.classList.remove('hidden');
  document.getElementById('toggle-sessions').textContent = 'Hide sessions';
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

    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const hours = calculateHours(sessions, facilities, startDate, endDate);
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

  const toggle = document.getElementById('toggle-sessions');
  const wrapper = document.getElementById('sessions-table-wrapper');

  toggle.addEventListener('click', () => {
    const visible = !wrapper.classList.contains('hidden');
    wrapper.classList.toggle('hidden', visible);
    toggle.textContent = visible ? 'Show sessions' : 'Hide sessions';
  });
});
