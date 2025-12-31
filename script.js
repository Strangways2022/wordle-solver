// script.js — Wordle Solver for GitHub Pages (absolute URLs + alerts)
const DEBUG_ALERTS = true;
function dbg(msg) { console.log(msg); if (DEBUG_ALERTS) alert(msg); }

// Prove external JS is loading
dbg('script.js: external file loaded.');

document.addEventListener('DOMContentLoaded', () => {
  dbg('script.js: DOMContentLoaded fired.');

  // Elements
  const guessInput     = document.getElementById('guess');
  const feedbackInput  = document.getElementById('feedback');
  const submitBtn      = document.getElementById('submit-btn');
  const resetBtn       = document.getElementById('reset-btn');
  const listEl         = document.getElementById('possible-words');
  const countEl        = document.getElementById('count');
  const statusEl       = document.getElementById('status');
  const formEl         = document.getElementById('guess-form');

  const missing = [
    ['#guess', guessInput],
    ['#feedback', feedbackInput],
    ['#submit-btn', submitBtn],
    ['#reset-btn', resetBtn],
    ['#possible-words', listEl],
    ['#count', countEl],
    ['#status', statusEl],
    ['#guess-form', formEl],
  ].filter(([id, el]) => !el);

  if (missing.length) {
    const msg = 'Missing required elements: ' + missing.map(([id]) => id).join(', ');
    statusEl && (statusEl.textContent = msg);
    dbg(msg);
    return;
  }

  formEl.addEventListener('submit', (e) => e.preventDefault());
  submitBtn.disabled = true;
  resetBtn.disabled = true;

  // App state
  let dictionary = [];
  let candidates = [];

  // ---------- Dictionary loader (ABSOLUTE URL for GH Pages) ----------
  async function loadDictionary() {
    try {
      statusEl.textContent = 'Loading word list…';
      dbg('Status: Loading word list…');

      // Absolute URL avoids any relative path issues
      const dictUrl = 'https://strangways2022.github.io/wordle-solver/words.txt?ts=' + Date.now();
      dbg('Fetching dictionary from: ' + dictUrl);

      const t0 = performance.now();
      const res = await fetch(dictUrl, { cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);

      if (!res.ok) {
        const msg = `Failed to load ${dictUrl} (HTTP ${res.status}) in ${ms} ms`;
        statusEl.textContent = msg;
        dbg(msg);
        return false;
      }

      const text = await res.text();
      dbg(`Dictionary OK. Length (chars): ${text.length}`);

      dictionary = text
        .split(/\r?\n/)
        .map(w => w.trim().toLowerCase())
        .filter(w => /^[a-z]{5}$/.test(w));

      if (dictionary.length === 0) {
        const msg = 'words.txt loaded but contained no valid 5-letter words.';
        statusEl.textContent = msg;
        dbg(msg);
        return false;
      }

      candidates = [...dictionary];
      const msg = `Loaded ${dictionary.length} words in ${ms} ms.`;
      statusEl.textContent = msg;
      dbg(msg);

      renderCandidates();

      submitBtn.disabled = false;
      resetBtn.disabled = false;
      dbg('Buttons enabled.');

      return true;
    } catch (err) {
      const msg = `Load error: ${err.message}`;
      statusEl.textContent = msg;
      console.error('Dictionary load failed:', err);
      dbg(msg);
      return false;
    }
  }

  // ---------- Rendering ----------
  function renderCandidates() {
    listEl.innerHTML = '';
    countEl.textContent = String(candidates.length);

    const show = candidates.slice(0, 200);
    for (const w of show) {
      const li = document.createElement('li');
      li.textContent = w;
      listEl.appendChild(li);
    }
    if (candidates.length > show.length) {
      const li = document.createElement('li');
      li.textContent = `… and ${candidates.length - show.length} more`;
      listEl.appendChild(li);
    }
    if (candidates.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No candidates remain. Check your guesses/feedback.';
      listEl.appendChild(li);
      dbg('No candidates remain after filtering.');
    }
    dbg(`Rendered ${Math.min(candidates.length, 200)} items (total ${candidates.length}).`);
  }

  // ---------- Validation ----------
  function validateInputs(guess, feedback) {
    if (!/^[a-z]{5}$/.test(guess)) return 'Guess must be 5 letters (A–Z).';
    if (!/^[GYXgyx]{5}$/.test(feedback)) return 'Feedback must be 5 characters using G/Y/X.';
    return null;
  }

  // ---------- Filtering logic (with duplicates) ----------
  function applyGuessToCandidates(guess, feedback, words) {
    const gArr = guess.split('');
    const fArr = feedback.split('');

    const requiredPositions = {};
    const forbiddenPositions = {};
    const minLetterCounts = {};
    const maxLetterCounts = {};

    const ygCounts = {};
    for (let i = 0; i < 5; i++) {
      const ch = gArr[i];
      const fb = fArr[i];
      if (fb === 'G') {
        requiredPositions[i] = ch;
        ygCounts[ch] = (ygCounts[ch] || 0) + 1;
      } else if (fb === 'Y') {
        (forbiddenPositions[i] ||= new Set()).add(ch);
        ygCounts[ch] = (ygCounts[ch] || 0) + 1;
      }
    }

    for (let i = 0; i < 5; i++) {
      const ch = gArr[i];
      if (fArr[i] === 'X') {
        const allowed = ygCounts[ch] || 0;
        maxLetterCounts[ch] = Math.max(maxLetterCounts[ch] ?? allowed, allowed);
      }
    }

    for (const [ch, cnt] of Object.entries(ygCounts)) {
      minLetterCounts[ch] = Math.max(minLetterCounts[ch] ?? cnt, cnt);
    }

    dbg(
      'Constraints from guess:\n' +
      `Greens: ${JSON.stringify(requiredPositions)}\n` +
      `Min: ${JSON.stringify(minLetterCounts)}\n` +
      `Max: ${JSON.stringify(maxLetterCounts)}`
    );

    return words.filter(candidate => {
      for (const [posStr, letter] of Object.entries(requiredPositions)) {
        const pos = Number(posStr);
        if (candidate[pos] !== letter) return false;
      }
      for (let i = 0; i < 5; i++) {
        if (fArr[i] === 'Y') {
          const ch = gArr[i];
          if (candidate[i] === ch) return false;
          if (!candidate.includes(ch)) return false;
        }
      }
      const candCounts = countLetters(candidate);
      for (const [ch, minCnt] of Object.entries(minLetterCounts)) {
        if ((candCounts[ch] || 0) < minCnt) return false;
      }
      for (const [ch, maxCnt] of Object.entries(maxLetterCounts)) {
        if ((candCounts[ch] || 0) > maxCnt) return false;
      }
      for (let i = 0; i < 5; i++) {
        const set = forbiddenPositions[i];
        if (set && set.has(candidate[i])) return false;
      }
      return true;
    });
  }

  function countLetters(str) {
    const map = {};
    for (const ch of str) map[ch] = (map[ch] || 0) + 1;
    return map;
  }

  // ---------- Handlers ----------
  submitBtn.addEventListener('click', () => {
    dbg('Submit clicked.');
    const guess    = (guessInput.value || '').trim().toLowerCase();
    const feedback = (feedbackInput.value || '').trim().toUpperCase();

    const err = validateInputs(guess, feedback);
    if (err) { dbg('Validation error: ' + err); alert(err); return; }

    if (candidates.length === 0 && dictionary.length === 0) {
      const msg = 'No candidates loaded. Did words.txt fail to load?';
      dbg(msg); alert(msg); return;
    }

    const before = candidates.length;
    candidates = applyGuessToCandidates(guess, feedback, candidates);
    const after = candidates.length;
    const msg = `Applied ${guess.toUpperCase()} / ${feedback}. Remaining: ${after} (was ${before}).`;
    statusEl.textContent = msg;
    dbg(msg);
    renderCandidates();
  });

  resetBtn.addEventListener('click', () => {
    dbg('Reset clicked.');
    candidates = [...dictionary];
    guessInput.value = '';
    feedbackInput.value = '';
    const msg = `Reset. Loaded ${dictionary.length} words.`;
    statusEl.textContent = msg;
    dbg(msg);
    renderCandidates();
  });

  // ---------- Kick off ----------
  loadDictionary();
});
