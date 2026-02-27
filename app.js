const els = {
  openPdf: document.getElementById('openPdf'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  loginBtn: document.getElementById('loginBtn'),
  guestBtn: document.getElementById('guestBtn'),
  clearLocal: document.getElementById('clearLocal'),

  challengeList: document.getElementById('challengeList'),
  challengeLoadErr: document.getElementById('challengeLoadErr'),

  challengeTitle: document.getElementById('challengeTitle'),
  pdfCanvas: document.getElementById('pdfCanvas'),
  startBtn: document.getElementById('startBtn'),
  canvas: document.getElementById('canvas'),

  timer: document.getElementById('timer'),
  attempts: document.getElementById('attempts'),
  tol: document.getElementById('tol'),

  massInput: document.getElementById('massInput'),
  submitMass: document.getElementById('submitMass'),
  resetRun: document.getElementById('resetRun'),

  result: document.getElementById('result'),
  status: document.getElementById('status'),
};

// hard-coded Apps Script endpoint (replace with your deployed URL)
const ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbxHXLRk77ksCNDsC66zK1wvL0XEhL0am1qexOQpuVbBaNhXFlxresfSGk9n3ew9DlooOQ/exec'

const STORAGE_KEYS = {
  username: 'cadgame_username',
  guest: 'cadgame_guest'
};

const LOCAL_STATS_KEY = 'cadgame_local_stats';

let challenges = [];
let current = null;

let run = {
  sessionId: null,
  startedAt: null,
  timerHandle: null,
  attempts: 0,
  firstSuccessLogged: false,
};

// reference to PDF window opened by button
let pdfWindow = null;

// reference to currently loaded PDF document (for rendering)
let currentPdfDoc = null;

function renderPdfPage(pdfUrl) {
  if (!pdfUrl) return;
  
  // Set up PDF.js worker (required for PDF rendering)
  if (typeof pdfjsLib !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  
  pdfjsLib.getDocument(pdfUrl).promise.then(pdf => {
    currentPdfDoc = pdf;
    // Render first page
    pdf.getPage(1).then(page => {
      const containerWidth = els.canvas.clientWidth - 20; // subtract padding
      const viewport = page.getViewport({ scale: 1 }); // get original viewport
      
      // calculate scale to fit container width
      const scale = Math.min(containerWidth / viewport.width, 3); // max scale 3 to avoid huge rendering
      const scaledViewport = page.getViewport({ scale });
      
      const canvas = els.pdfCanvas;
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      
      const context = canvas.getContext('2d');
      page.render({
        canvasContext: context,
        viewport: scaledViewport
      }).promise.then(() => {
        // PDF rendered successfully
      }).catch(err => {
        console.error('PDF render error:', err);
      });
    });
  }).catch(err => {
    console.error('PDF load error:', err);
    els.result.textContent = `Napaka pri nalaganju PDF: ${err}`;
  });
}

function uuidv4() {
  // Simple UUID (good enough for sessions)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function fmtTime(ms) {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const d = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
}

function setStatus(obj) {
  els.status.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
}

function getUsername() {
  return (els.username && els.username.value || '').trim();
}

function getPassword() {
  return (els.password && els.password.value) || '';
}

function isGuest() {
  return localStorage.getItem(STORAGE_KEYS.guest) === '1';
}

// endpoint is constant
function getEndpoint() {
  return ENDPOINT_URL;
}

function validateUsername(name) {
  const norm = (name || '').trim();
  if (!isGuest() && norm.length === 0) return { ok: false, msg: 'Vpiši uporabniško ime ali izberi "Nadaljuj kot gost".' };
  return { ok: true, norm };
}

// simple JSONP helper to work around CORS for read-only GET endpoints
// backend (Koda.gs) supports a `callback` query parameter via `output_`
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cbName = `cb_${Math.random().toString(36).slice(2)}`;
    let script;
    // define callback on window
    window[cbName] = data => {
      delete window[cbName];
      if (script) script.remove();
      resolve(data);
    };
    const sep = url.includes('?') ? '&' : '?';
    script = document.createElement('script');
    script.src = `${url}${sep}callback=${cbName}`;
    script.onerror = () => {
      delete window[cbName];
      if (script) script.remove();
      reject(new Error('JSONP request failed'));
    };
    document.head.appendChild(script);
  });
}



function clearLocal() {
  localStorage.removeItem(STORAGE_KEYS.username);
  localStorage.removeItem(STORAGE_KEYS.guest);
  if (els.username) els.username.value = '';
  if (els.password) els.password.value = '';
  els.result.textContent = 'Lokalni podatki so počiščeni.';
}

function loadLocalStats() {
  try {
    const raw = localStorage.getItem(LOCAL_STATS_KEY) || '{}';
    const v = JSON.parse(raw);
    // upgrade old-array format to new object format
    if (Array.isArray(v)) {
      const out = {};
      v.forEach((t, idx) => {
        // no challenge id info, skip
      });
      return out;
    }
    return v || {};
  } catch (e) { return {}; }
}

function saveLocalStats(stats) {
  localStorage.setItem(LOCAL_STATS_KEY, JSON.stringify(stats));
}

function addLocalAttempt(challengeId) {
  const stats = loadLocalStats();
  stats[challengeId] = stats[challengeId] || { times: [], attempts: 0 };
  stats[challengeId].attempts = (stats[challengeId].attempts || 0) + 1;
  saveLocalStats(stats);
}

function addLocalTime(challengeId, ms) {
  const stats = loadLocalStats();
  stats[challengeId] = stats[challengeId] || { times: [], attempts: 0 };
  stats[challengeId].times = stats[challengeId].times || [];
  stats[challengeId].times.push(ms);
  saveLocalStats(stats);
}

async function loadChallenges() {
  try {
    const res = await fetch('challenges/challenges.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    challenges = data.challenges || [];
    renderChallengeList();
    setStatus({ loaded: challenges.length, version: data.version });
  } catch (e) {
    els.challengeLoadErr.textContent = `Napaka pri nalaganju challenges.json: ${String(e)}`;
  }
}

function renderChallengeList() {
  els.challengeList.innerHTML = '';
  for (const ch of challenges) {
    const row = document.createElement('div');
    row.className = 'challenge-row';

    const b = document.createElement('button');
    //b.textContent = `${ch.title} (±${ch.tolerance_g ?? 1} g)`;
    b.textContent = `${ch.title}`;
    b.onclick = () => selectChallenge(ch.id);

    const stats = document.createElement('div');
    stats.className = 'challenge-stats muted small';
    stats.textContent = '—';

    row.appendChild(b);
    row.appendChild(stats);
    els.challengeList.appendChild(row);

    // Fetch global avg and per-user stats (if logged in) or local stats for guests
    (async () => {
      const ep = getEndpoint();
      const name = getUsername();
      try {
        const parts = [];
        if (ep) {
          // global stats
          try {
            // use JSONP for stats requests so browser doesn't block CORS
            const g = await jsonp(`${ep}?action=stats&challenge_id=${encodeURIComponent(ch.id)}`);
            if (g && g.ok) {
              if (g.avg_ms) parts.push(`Avg.: ${fmtTime(g.avg_ms)}`);
            }
          } catch (e) { /* ignore */ }

          // per-user stats when logged in
          if (name && !isGuest()) {
            try {
              const u = await jsonp(`${ep}?action=stats&username=${encodeURIComponent(name)}&challenge_id=${encodeURIComponent(ch.id)}`);
              if (u && u.ok) {
                if (u.avg_ms) parts.push(`you ${fmtTime(u.avg_ms)}`);
                if (u.last_ms) parts.push(`last ${fmtTime(u.last_ms)}`);
              }
            } catch (e) { /* ignore */ }
          }
        } else {
          // no endpoint: nothing remote
        }

        // guest/local stats
        if (!ep || isGuest() || !name) {
          const local = loadLocalStats();
          const info = local[ch.id] || {times:[], attempts:0};
          const arr = (info.times || []).slice().filter(Number.isFinite);
          if (arr.length) {
            const avg = Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
            parts.push(`you(local) ${fmtTime(avg)}`);
            parts.push(`last ${fmtTime(arr[arr.length-1])}`);
          }
          if (info.attempts) {
            parts.push(`tries ${info.attempts}`);
          }
        }

        stats.textContent = parts.length ? parts.join(' | ') : '—';
      } catch (e) {
        // ignore network errors
      }
    })();
  }
}

function selectChallenge(id) {
  const ch = challenges.find(x => x.id === id);
  if (!ch) return;

  current = ch;
  resetRunState(true);

  els.challengeTitle.textContent = `Izziv: ${ch.title}`;
  els.tol.textContent = String(ch.tolerance_g ?? 1);

  // PDF (blurred until START)
  els.canvas.classList.remove('revealed');
  renderPdfPage(ch.pdf);

  // ensure challenge list scroll is at top
  //const list = document.getElementById('challengeList');
  //if (list) list.scrollTop = 0;

  // PDF button initialization
  if (els.openPdf) {
    els.openPdf.dataset.pdfUrl = ch.pdf;
    els.openPdf.disabled = true;
    els.openPdf.style.opacity = '0.5';
  }

  els.result.textContent = 'Klikni START. PDF lahko odpreš v novem zavihku za zoom.';
  els.startBtn.disabled = false;

  run.sessionId = uuidv4();
  run.firstSuccessLogged = false;
}

function startRun() {
  try {
    console.log("startRun fired");

    if (!current) {
      els.result.textContent = 'Najprej izberi model.';
      return;
    }

    const name = getUsername();
    const ep = getEndpoint();
    const v = validateUsername(name);

    // UI ping, da vidiš, da se je klik registriral
    els.result.textContent = 'START klik zaznan…';

    if (!v.ok) {
      els.result.textContent = v.msg;
      return;
    }

    // Endpoint naj bo "best effort" – igra naj teče tudi brez beleženja
    if (!ep) {
      els.result.textContent = 'START brez beleženja (endpoint ni prednastavljen).';
    }

    if (els.username) els.username.value = v.norm;

    run.startedAt = performance.now();
    run.attempts = 0;
    run.firstSuccessLogged = false;

    // Odmegli thumbnail
    els.canvas.classList.add('revealed');

    // Omogoči vnos
    els.massInput.disabled = false;
    els.submitMass.disabled = false;
    els.resetRun.disabled = false;
    els.startBtn.disabled = true;

    tickTimer();
    run.timerHandle = setInterval(tickTimer, 100);

    // Log (best effort) — only for logged-in users
    if (!isGuest() && ep) logEvent('start', { is_correct: '' });

    // enable PDF button once run starts
    if (els.openPdf) {
      els.openPdf.disabled = false;
      els.openPdf.style.opacity = '';
    }

    // Končno sporočilo za študenta
    els.result.textContent = 'Timer teče. PDF odpri v novem zavihku za zoom.';
  } catch (err) {
    console.error("startRun error:", err);
    els.result.textContent = `Napaka v startRun(): ${String(err)}`;
  }
}

function tickTimer() {
  if (!run.startedAt) {
    els.timer.textContent = '00:00.0';
    return;
  }
  const ms = Math.max(0, performance.now() - run.startedAt);
  els.timer.textContent = fmtTime(ms);
}

function elapsedMs() {
  if (!run.startedAt) return 0;
  return Math.max(0, Math.floor(performance.now() - run.startedAt));
}

function checkMass() {
  if (!current) {
    console.warn('checkMass called but no challenge selected');
    els.result.textContent = 'Izberi najprej izziv.';
    return;
  }
  if (!run.startedAt) {
    console.warn('checkMass called but run not started');
    els.result.textContent = 'Najprej klikni START (nato lahko preveriš maso).';
    return;
  }

  const raw = (els.massInput.value || '').trim().replace(',', '.');
  const mass = Number(raw);
  if (!Number.isFinite(mass)) {
    els.result.textContent = 'Vnesi maso kot številko (npr. 123.4).';
    return;
  }

  run.attempts += 1;
  els.attempts.textContent = String(run.attempts);
    if (isGuest() || !getEndpoint()) {
      addLocalAttempt(current.id);
    }
  const target = Number(current.targetMass_g);
  const tol = Number(current.tolerance_g ?? 1);
  const ok = Math.abs(mass - target) <= tol;

  // Log attempt only for non-guests
  if (!isGuest()) {
    logEvent('attempt', { mass_input_g: mass, is_correct: ok });
  }

  if (ok) {
    // Ustavi timer
    if (run.timerHandle) {
      clearInterval(run.timerHandle);
      run.timerHandle = null;
    }

    const t = elapsedMs();
    els.result.textContent = `✅ Pravilno! Čas: ${fmtTime(t)} | Poskusi: ${run.attempts}`;

    const justSucceeded = !run.firstSuccessLogged;

    if (justSucceeded) {
      run.firstSuccessLogged = true;
      if (!isGuest()) {
        logEvent('success_first', { mass_input_g: mass, is_correct: true });
      }
      // store local for guests/ offline
      if (isGuest() || !getEndpoint()) {
        const s = elapsedMs();
        addLocalTime(current.id, s);
      }
    } else {
      if (!isGuest()) {
        logEvent('success_repeat', { mass_input_g: mass, is_correct: true });
      }
    }

    // also add time for guests/ offline for repeats if you want
    if (isGuest() || !getEndpoint()) {
      addLocalTime(current.id, t);
    }

    // After correct answer show stats overlay.  If this was the first
    // successful run and we're talking to a remote endpoint, the sheet
    // write may not be visible instantly; delay a bit so the stats API
    // can see the new row.
    const delayMs = (!isGuest() && getEndpoint() && justSucceeded) ? 10000 : 0;
    if (delayMs) {
      // show simple progress bar during wait
      const barLen = 10;
      let progress = 0;
      const base = `✅ Pravilno! Čas: ${fmtTime(t)} | Poskusi: ${run.attempts}`;
      const updateBar = () => {
        const filled = '*'.repeat(progress);
        const empty = '_'.repeat(barLen - progress);
        els.result.textContent = `${base} (počakam posodobitev podatkov [${filled}${empty}])`;
        progress = (progress + 1) % (barLen + 1);
      };
      updateBar();
      const iv = setInterval(updateBar, delayMs / (barLen + 1));
      setTimeout(() => {
        clearInterval(iv);
        displayEndStats(current.id, t, mass);
      }, delayMs);
    } else {
      displayEndStats(current.id, t, mass);
    }
    return; // overlay will reset when user closes it
  } else {
    els.result.textContent = `❌ Ni pravilno. (vnos ${mass} g, toleranca ±${tol} g) Poskusi: ${run.attempts}`;
  }
}

function resetRunState(keepChallenge = true) {
  if (run.timerHandle) clearInterval(run.timerHandle);
  run.timerHandle = null;
  run.startedAt = null;
  run.attempts = 0;
  run.firstSuccessLogged = false;

  els.timer.textContent = '00:00.0';
  els.attempts.textContent = '0';
  els.massInput.value = '';
  els.massInput.disabled = true;
  els.submitMass.disabled = true;
  els.resetRun.disabled = true;

  if (!keepChallenge) {
    current = null;
    els.challengeTitle.textContent = 'Izziv';
    if (els.pdfCanvas) {
      const ctx = els.pdfCanvas.getContext('2d');
      ctx.clearRect(0, 0, els.pdfCanvas.width, els.pdfCanvas.height);
      els.pdfCanvas.width = 0;
      els.pdfCanvas.height = 0;
      els.pdfCanvas.style.visibility = '';
    }
    els.canvas.classList.remove('revealed');
  }

  if (els.openPdf) {
    els.openPdf.disabled = true;
    els.openPdf.style.opacity = '0.5';
  }
}

function buildPayload(eventType, fields) {
  const studentId = isGuest() ? 'guest' : getUsername();
  const target = Number(current.targetMass_g);
  const tol = Number(current.tolerance_g ?? 1);

  return {
    event: {
      client_timestamp: new Date().toISOString(),
      session_id: run.sessionId || uuidv4(),
      student_id: studentId,
      challenge_id: String(current.id),
      event_type: eventType,
      elapsed_ms: elapsedMs(),
      attempt_index: run.attempts,
      mass_input_g: fields.mass_input_g ?? '',
      target_mass_g: target,
      tolerance_g: tol,
      is_correct: fields.is_correct ?? '',
      client_app_version: '1.0.0'
    },
    user_agent: navigator.userAgent,
    referrer: document.referrer || ''
  };
}

function logEvent(eventType, fields = {}) {
  const ep = getEndpoint();
  if (!ep || !current) return;

  const payload = buildPayload(eventType, fields);
  // IMPORTANT: avoid CORS preflight by using no-cors + text/plain
  fetch(ep, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload)
  }).catch(() => {
    // silent — still allow offline practice
  });

  setStatus(payload);
}

// fetch detailed stats including leaderboard and attempts
async function fetchStats(challengeId) {
  const ep = getEndpoint();
  if (!ep) return null;
  const name = getUsername();
  const url = new URL(ep);
  url.searchParams.set('action','stats');
  url.searchParams.set('challenge_id',challengeId);
  if (name && !isGuest()) url.searchParams.set('username', name);
  url.searchParams.set('leaderboard','1');
  try {
    // use JSONP to avoid CORS preflight/headers
    const data = await jsonp(url.toString());
    return data;
  } catch (e) {
    console.error('fetchStats error', e);
    return null;
  }
}

function makeTimeStr(ms) { return ms ? fmtTime(ms) : '—'; }

// show overlay with rich stats and wait for user to close
async function displayEndStats(challengeId, userTime, userMass) {
  let data = null;
  try {
    data = await fetchStats(challengeId);
  } catch {} // ignore
  const overlay = document.createElement('div');
  overlay.className = 'scoreboard';
  // hide underlying PDF for clarity
  if (els.pdfCanvas) els.pdfCanvas.style.visibility = 'hidden';
  
  let html = '';
  const chTitle = current.title || 'Izziv';
  const userMs = userTime || 0;
  const userStr = fmtTime(userMs);
  const targetMass = Number(current.targetMass_g);
  const deviation = userMass ? Math.abs(userMass - targetMass) : 0;
  const deviation_str = userMass ? `${deviation.toFixed(2)} g` : '—';
  
  if (data && data.ok) {
    // compute rank based solely on the userTime relative to the
    // leaderboard list.  This guarantees a correct position even before
    // the server assigns a rank or if the username isn't listed yet.
    if ((data.user_rank === undefined || data.user_rank === null) && Array.isArray(data.leaderboard)) {
      let idx = data.leaderboard.findIndex(e => userMs <= e.time_ms);
      if (idx === -1) idx = data.leaderboard.length; // slower than any entry
      data.user_rank = idx + 1;
    }

    // --- Header ---
    html += `<div class="sb-header"><h2>🎉 IZZIV REŠEN! 🧩 ${chTitle}</h2></div>`;
    
    // --- Summary line (time / attempts / deviation / rank) ---
    const pbIcon = data.is_pb ? '🔥 PB: DA (nov osebni rekord)' : '';
    html += `<div class="sb-summary">⏱ ${userStr}   🔁 sejskih poskusov: ${run.attempts}   🔁 cumulative: ${data.total_attempts || 0}   🔁 uspešnih: ${data.success_count || 0}   🎯 odstopanje: ${deviation_str}  <br>🏅 Rang: #${data.user_rank || '?'} / ${data.leaderboard ? data.leaderboard.length : '?'}   ${pbIcon}</div>`;
    
    // --- Two-column layout: left side contains three vertical sections ---
    html += `<div class="sb-cols">`;
    
    // Left column: Stats + user result + quality
    html += `<div class="sb-left">`;
    // 1. group: group statistics
    html += `<h4>📊 Skupinska statistika</h4>`;
    html += `<ul>`;
    html += `<li>Povprečen čas: ${makeTimeStr(data.avg_ms)}</li>`;
    html += `<li>Poskusi (celočasni): ${data.total_attempts || 0}</li>`;
    html += `<li>Reštev (uspeh): ${Math.floor(data.success_rate || 0)}%</li>`;
    html += `<li>Št. uspešnih rešitev: ${data.success_count || 0}</li>`;
    html += `</ul>`;
    // 2. group: your result
    html += `<h4>🧑\u200d🎓 Tvoj rezultat</h4>`;
    html += `<ul>`;
    html += `<li>Uvrstitev: #${data.user_rank || '?'} / ${data.leaderboard ? data.leaderboard.length : '?'} </li>`;
    html += `<li>Hitrejši od: ${data.user_rank ? Math.round((1 - data.user_rank / 50) * 100) : '?'}%</li>`;
    html += `<li>Razlika do povprečja: ${userMs < data.avg_ms ? '−' : '+'}${fmtTime(Math.abs(userMs - data.avg_ms))}</li>`;
    if (data.best_ms) html += `<li>Razlika do #1: +${fmtTime(userMs - data.best_ms)}</li>`;
    html += `</ul>`;
    // 3. group: quality
    html += `<h4>🎯 Kakovost rešitve</h4>`;
    html += `<ul>`;
    html += `<li>Ocena natančnosti: ✅ Odlično</li>`;
    html += `<li>Poskusi: 🧠 ${run.attempts} ${run.attempts <= 3 ? '(neverjeten!)' : run.attempts <= 6 ? '(dobro)' : '(ok)'}</li>`;
    html += `<li>Napredek: 📈 Reševanje se izboljšava</li>`;
    html += `</ul>`;
    html += `</div>`;
    
    // Right column: Leaderboard (full height)
    html += `<div class="sb-right">`;
    html += `<h4>🏆 Leaderboard (najhitrejši časi)</h4>`;
    if (Array.isArray(data.leaderboard) && data.leaderboard.length) {
      html += `<ol class="sb-leaderboard">`;
      const medals = ['🏆', '🥇', '🥈', '🥉','⭐', '⚡','🌻','🎖', '🍰'];
      data.leaderboard.forEach((entry, idx) => {
        const medal = medals[idx] || '•';
        html += `<li>${medal} ${entry.student_id} — ${makeTimeStr(entry.time_ms)}</li>`;
      });
      html += `</ol>`;
    } else {
      html += `<p>Ni podatkov.</p>`;
    }
    html += `</div>`;
    html += `</div>`;
    
  } else {
    // Fallback to local stats for guests/offline
    const local = loadLocalStats()[challengeId] || {times:[], attempts:0};
    html += `<div class="sb-header"><h2>🎉 IZZIV REŠEN! 🧩 ${chTitle}</h2></div>`;
    html += `<div class="sb-summary">⏱ ${userStr}   🔁 ${run.attempts} poskusov   🎯 odstopanje: ${deviation_str}</div>`;
    
    html += `<div class="sb-cols">`;
    html += `<div class="sb-left">`;
    html += `<h4>📊 Vaša statistika (local)</h4>`;
    if (local.times && local.times.length) {
      const avg = Math.round(local.times.reduce((a,b)=>a+b,0)/local.times.length);
      html += `<ul>`;
      html += `<li>Povprečen čas: ${fmtTime(avg)}</li>`;
      html += `<li>Skupni časi: ${local.times.length} rešitve</li>`;
      html += `<li>Skupaj vse poskuse: ${local.attempts}</li>`;
      html += `</ul>`;
    } else {
      html += `<p>Ni podatkov.</p>`;
    }
    html += `</div>`;
    html += `<div class="sb-right"><p>Vključite se v skupino, da vidite leaderboard!</p></div>`;
    html += `</div>`;
  }
  
  html += `<div class="sb-footer"><button id="closeStatsBtn">Zapri in nadaljuj</button></div>`;
  overlay.innerHTML = html;
  els.canvas.appendChild(overlay);
  document.getElementById('closeStatsBtn').onclick = () => {
    overlay.remove();
    resetRunState(false);
    renderChallengeList();
  };
}

els.clearLocal.onclick = clearLocal;

// Login / Guest handlers
if (els.loginBtn) els.loginBtn.onclick = async () => {
  const name = getUsername();
  const ep = getEndpoint();
  const v = validateUsername(name);
  if (!v.ok) { els.result.textContent = v.msg; return; }
  // If endpoint provided, attempt server login (best-effort)
  if (ep) {
    try {
      // password is no longer required; endpoint accepts callback via JSONP
      const j = await jsonp(`${ep}?action=login&username=${encodeURIComponent(v.norm)}`);
      if (j && j.ok) {
        els.result.textContent = `Prijava uspešna (${j.email || v.norm})`;
      } else {
        els.result.textContent = `Prijava neuspešna: ${j && j.error || 'napaka'}`;
      }
    } catch (e) {
      // ignore network error, allow local login
      els.result.textContent = 'Prijava lokalno (brez preverjanja endpointa).';
    }
  } else {
    els.result.textContent = 'Prijava lokalno (endpoint ni nastavljen).';
  }
  // persist and load challenges
  localStorage.setItem(STORAGE_KEYS.username, v.norm);
  localStorage.setItem(STORAGE_KEYS.guest, '0');
  await loadChallenges();
};

if (els.guestBtn) els.guestBtn.onclick = async () => {
  localStorage.setItem(STORAGE_KEYS.guest, '1');
  els.result.textContent = 'Usmerjen kot gost. Lokalni časi bodo shranjeni.';
  await loadChallenges();
};

els.startBtn.onclick = startRun;
els.submitMass.onclick = checkMass;
els.resetRun.onclick = () => selectChallenge(current.id);


// PDF button click
if (els.openPdf) {
  els.openPdf.addEventListener('click', () => {
    const url = els.openPdf.dataset.pdfUrl;
    if (url) {
      pdfWindow = window.open(url, '_blank');
    }
  });
}

els.massInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') checkMass();
});

(function init() {
  // restore local settings
  const uname = localStorage.getItem(STORAGE_KEYS.username) || '';
  const guestFlag = localStorage.getItem(STORAGE_KEYS.guest) === '1';
  if (els.username) els.username.value = uname;

  // Do not auto-load challenges — wait for Login or Guest selection.
  els.result.textContent = 'Izberi [Login] ali klikni "Gost".';
})();
