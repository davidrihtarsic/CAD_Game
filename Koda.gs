/** Code.gs — CAD practice logger (Apps Script Web App)
 *
 * Extended: doPost for logging, doGet for stats and login.
 * Deployment notes: deploy as Web App (Execute as: Me, Who has access: Anyone, even anonymous)
 * Set SPREADSHEET_ID to your sheet id and ensure sheets named 'RESULTS_EVENTS' and 'USERS' exist.
 */

const SPREADSHEET_ID = '1PrQ1YTZS-qfDEPTIfb5n7Av5nqhuRPzfsVXKHbf0st0';
const SHEET_EVENTS = 'RESULTS_EVENTS';
const SHEET_USERS = 'USERS';

const MIN_EVENT_INTERVAL_MS = 150;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: 'empty_body' });
    }

    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut({ ok: false, error: 'invalid_json' });
    }

    const ev = body.event;
    if (!ev || typeof ev !== 'object') {
      return jsonOut({ ok: false, error: 'missing_event' });
    }

    const required = [
      'client_timestamp',
      'session_id',
      'student_id',
      'challenge_id',
      'event_type',
      'elapsed_ms',
      'attempt_index',
      'target_mass_g',
      'tolerance_g',
      'client_app_version',
    ];

    for (const k of required) {
      if (ev[k] === undefined || ev[k] === null || ev[k] === '') {
        return jsonOut({ ok: false, error: 'missing_field', field: k });
      }
    }

    const allowedTypes = new Set(['start', 'attempt', 'success_first', 'success_repeat']);
    if (!allowedTypes.has(String(ev.event_type))) {
      return jsonOut({ ok: false, error: 'bad_event_type' });
    }

    const sessionId = String(ev.session_id);
    const studentId = String(ev.student_id);
    const challengeId = String(ev.challenge_id);

    const elapsedMs = Number(ev.elapsed_ms);
    const attemptIndex = Number(ev.attempt_index);
    const targetMass = Number(ev.target_mass_g);
    const tolG = Number(ev.tolerance_g);

    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return jsonOut({ ok: false, error: 'bad_elapsed_ms' });
    if (!Number.isFinite(attemptIndex) || attemptIndex < 0) return jsonOut({ ok: false, error: 'bad_attempt_index' });
    if (!Number.isFinite(targetMass)) return jsonOut({ ok: false, error: 'bad_target_mass' });
    if (!Number.isFinite(tolG) || tolG < 0) return jsonOut({ ok: false, error: 'bad_tolerance' });

    const massInput = (ev.mass_input_g === undefined || ev.mass_input_g === null || ev.mass_input_g === '')
      ? ''
      : Number(ev.mass_input_g);

    if (massInput !== '' && !Number.isFinite(massInput)) return jsonOut({ ok: false, error: 'bad_mass_input' });

    const isCorrect = (ev.is_correct === undefined || ev.is_correct === null || ev.is_correct === '')
      ? ''
      : Boolean(ev.is_correct);

    // Rate limiting per session
    const cache = CacheService.getScriptCache();
    const now = Date.now();
    const lastKey = `last:${sessionId}`;
    const last = Number(cache.get(lastKey) || '0');
    if (last && now - last < MIN_EVENT_INTERVAL_MS) {
      return jsonOut({ ok: true, skipped: true, reason: 'rate_limited' });
    }
    cache.put(lastKey, String(now), 60 * 10);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(SHEET_EVENTS);
    if (!sh) return jsonOut({ ok: false, error: 'sheet_not_found' });

    const ua = (body.user_agent !== undefined && body.user_agent !== null) ? String(body.user_agent) : '';
    const ref = (body.referrer !== undefined && body.referrer !== null) ? String(body.referrer) : '';

    const row = [
      new Date(),
      String(ev.client_timestamp),
      sessionId,
      studentId,
      challengeId,
      String(ev.event_type),
      elapsedMs,
      attemptIndex,
      massInput,
      targetMass,
      tolG,
      isCorrect,
      String(ev.client_app_version),
      ua,
      ref,
    ];

    sh.appendRow(row);
    return jsonOut({ ok: true, server_timestamp: new Date().toISOString() });
  } catch (err) {
    return jsonOut({ ok: false, error: 'server_error', message: String(err) });
  }
}

/**
 * doGet supports three read-only operations (JSON or JSONP):
 *  - action=stats&username=...&challenge_id=...  -> returns {ok:true, avg_ms, last_ms, ...}
 *      includes global aggregates if username omitted
 *  - action=login&username=...                   -> returns {ok:true, email} or {ok:false}
 *      password is no longer required; this is mostly a lookup/acknowledgement.
 */
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = (params.action || '').toString().toLowerCase();

  if (action === 'stats') {
    const username = (params.username || '').toString();
    const challengeId = (params.challenge_id || '').toString();
    if (!challengeId) return output_({ ok: false, error: 'missing_params' }, e);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(SHEET_EVENTS);
    if (!sh) return output_({ ok: false, error: 'sheet_not_found' }, e);

    const rows = sh.getDataRange().getValues();
    // Assume header row exists. Find indices by header name
    const headers = rows[0].map(h => String(h).toLowerCase());
    const idxStudent = headers.indexOf('student_id');
    const idxChallenge = headers.indexOf('challenge_id');
    const idxEvent = headers.indexOf('event_type');
    const idxElapsed = headers.indexOf('elapsed_ms');
    const idxTimestamp = headers.indexOf('timestamp_server');

    const times = [];
    let lastTs = 0;
    let lastMs = null;
    const bestByStudent = {};
    let attemptCount = 0;          // for current user only
    let userTimes = [];
    let successCount = 0;
    let userSuccessCount = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const matchesChallenge = String(r[idxChallenge]) === challengeId;
      if (!matchesChallenge) continue;

      const evType = String(r[idxEvent]);
      // count attempts made by this user at this challenge
      if (evType === 'attempt' && username && String(r[idxStudent]) === username) {
        attemptCount++;
      }

      if (evType !== 'success_first') continue;
      // success event
      successCount++;
      const em = Number(r[idxElapsed]);
      if (!Number.isFinite(em)) continue;

      const sid = String(r[idxStudent]);
      // collect every successful time for leaderboard
      if (bestByStudent[sid] === undefined || em < bestByStudent[sid]) {
        bestByStudent[sid] = em;
      }

      if (username && sid === username) {
        userTimes.push(em);
        userSuccessCount++;
        const ts = new Date(r[idxTimestamp]).getTime();
        if (ts > lastTs) { lastTs = ts; lastMs = em; }
      }

      if (!username) {
        times.push(em);
        const ts = new Date(r[idxTimestamp]).getTime();
        if (ts > lastTs) { lastTs = ts; lastMs = em; }
      }
    }

    // for logged-in user we also want their own times to compute avg
    const dataTimes = username ? userTimes : times;
    if (!dataTimes.length) {
      return output_({ ok: true, avg_ms: 0, last_ms: 0, total_attempts: attemptCount, success_count: userSuccessCount }, e);
    }
    const avg = Math.round(dataTimes.reduce((a, b) => a + b, 0) / dataTimes.length);

    // compute success rate overall
    const success_rate = successCount > 0 ? Math.round((successCount / (successCount + (rows.length-1 - successCount))) * 100) : 0;

    // determine leaderboard entries for all successful users
    const entries = Object.keys(bestByStudent).map(sid => ({ student_id: sid, time_ms: bestByStudent[sid] }));
    entries.sort((a,b) => a.time_ms - b.time_ms);

    // compute rank of current time among all entries (including itself)
    let user_rank = undefined;
    let user_time = lastMs;
    if (username && user_time !== null) {
      // insert user's time into sorted list and find index
      const allTimes = entries.map(e=>e.time_ms);
      let idx = allTimes.findIndex(t => user_time <= t);
      if (idx === -1) idx = allTimes.length; // largest
      user_rank = idx + 1;
    }

    const best_ms = entries.length ? entries[0].time_ms : 0;
    const best_student = entries.length ? entries[0].student_id : '';

    return output_({ ok: true,
                    avg_ms: avg,
                    last_ms: lastMs,
                    total_attempts: attemptCount,
                    success_count: userSuccessCount,
                    success_rate,
                    best_ms, best_student,
                    leaderboard: entries,
                    user_rank, user_time }, e);
  }

  if (action === 'login') {
    const username = (params.username || '').toString();
    if (!username) return output_({ ok: false, error: 'missing_username' }, e);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(SHEET_USERS);
    if (!sh) return output_({ ok: false, error: 'users_sheet_missing' }, e);

    const rows = sh.getDataRange().getValues();
    const headers = rows[0].map(h => String(h).toLowerCase());
    const idxUser = headers.indexOf('username');
    const idxEmail = headers.indexOf('email');

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (String(r[idxUser]) === username) {
        const email = String(r[idxEmail] || '');
        return output_({ ok: true, email: email }, e);
      }
    }
    return output_({ ok: false, error: 'user_not_found' }, e);
  }

  return jsonOut({ ok: true, message: 'cad-logger alive' });
}

// JSON response helper with CORS header
function jsonOut(obj) {
  // ContentService TextOutput allows setting a header
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*');
}

// JSON/JSONP output helper: if callback parameter provided, wrap in function call
function output_(obj, e) {
  const callback = e && e.parameter && e.parameter.callback;
  const txt = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${txt})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  // normal JSON
  return jsonOut(obj);
}

// Handle OPTIONS preflight to satisfy CORS
function doOptions(e) {
  const out = ContentService.createTextOutput('');
  out.setHeader('Access-Control-Allow-Origin', '*');
  out.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  out.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return out;
}
