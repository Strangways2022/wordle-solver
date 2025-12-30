// script.js — Wordle Solver (GitHub Pages friendly)
// Turn on/off alert logs:
const DEBUG_ALERTS = false; // set to true while debugging on Android

function dbg(msg) {
  if (DEBUG_ALERTS) alert(msg);
}

// Wrap everything to ensure DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  dbg('Page loaded: initializing Wordle Solver');

  // ----------------------------
  // App state
  // ----------------------------
  let dictionary = []; // all 5-letter words
  let candidates = []; // filtered candidates

  // ----------------------------
  // DOM elements (must match index.html IDs)
  // ----------------------------
  const guessInput     = document.getElementById('guess');
  const feedbackInput  = document.getElementById('feedback');
  const submitBtn      = document.getElementById('submit-btn');
  const resetBtn       = document.getElementById('reset-btn');
  const listEl         = document.getElementById('possible-words');
  const countEl        = document.getElementById('count');
  const statusEl       = document.getElementById('status');
  const formEl         = document.getElementById('guess-form');

  // Guard: ensure required elements exist
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
    dbg(msg);
    if (statusEl) statusEl.textContent = msg;
    console.error(msg);
    return;
  }

  // Safety: prevent form auto-submit
  formEl.addEventListener('submit', (e) => e.preventDefault());

  // Disable buttons until dictionary loads
  submitBtn.disabled = true;
  resetBtn.disabled = true;

  // ----------------------------
  // Dictionary loader (words.txt next to index.html)
  // ----------------------------
  async function loadDictionary() {
    try {
      statusEl.textContent = 'Loading word list…';
      dbg('Fetching ./words.txt …');

      // Add a cache-buster in case Pages/browser caches aggressively
      const res = await fetch(`./words.txt?ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load words.txt (HTTP ${res.status})`);

      const text = await res.text();
      dbg('words.txt fetched; parsing…');

      dictionary = text
        .split(/\r?\n/)
        .map(w => w.trim().toLowerCase())
        .filter(w => /^[a-z]{5}$/.test(w));

      candidates = [...dictionary];

      statusEl.textContent = `Loaded ${dictionary.length} words.`;
      dbg(`Dictionary loaded: ${dictionary.length} words`);

      renderCandidates();

      submitBtn.disabled = false;
      resetBtn.disabled = false;
    } catch (err) {
      const msg = `Error loading dictionary: ${err.message}. Ensure words.txt is next to index.html at ${location.pathname}`;
      statusEl.textContent = msg;
      dbg(msg);
      console.error(err);
    }
  }

  // ----------------------------
  // Rendering
  // ----------------------------
  function renderCandidates() {
    listEl.innerHTML = '';
    countEl.textContent = String(candidates.length);

    // Render up to 200 items for responsiveness
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
  }

  // ----------------------------
  // Validation
  // ----------------------------
  function validateInputs(guess, feedback) {
    if (!/^[a-z]{5}$/.test(guess)) return 'Guess must be 5 letters (A–Z).';
    if (!/^[GYXgyx]{5}$/.test(feedback)) return 'Feedback must be 5 characters using G/Y/X.';
    return null;
  }

  // ----------------------------
  // Button handlers
  // ----------------------------
  submitBtn.addEventListener('click', () => {
    dbg('Submit clicked');

    const guess = guessInput.value.trim().toLowerCase();
    const feedback = feedbackInput.value.trim().toUpperCase();

    dbg(`Inputs: guess=${guess}, feedback=${feedback}`);

    const err = validateInputs(guess, feedback);
    if (err) {
      dbg(`Validation error: ${err}`);
      alert(err);
      return;
    }
    if (candidates.length === 0) {
      const msg = 'No candidates loaded. Did words.txt fail to load?';
      dbg(msg);
      alert(msg);
      return;
    }

    try {
      const before = candidates.length;
      candidates = applyGuessToCandidates(guess, feedback, candidates);
      const after = candidates.length;

      statusEl.textContent = `Applied ${guess.toUpperCase()} / ${feedback}. Remaining: ${after}`;
      dbg(`Filter applied: ${before} → ${after}`);
      renderCandidates();
    } catch (e) {
      dbg('Error applying guess; see console.');
      console.error(e);
      alert('Internal error applying guess.');
    }
  });

  resetBtn.addEventListener('click', () => {
    dbg('Reset clicked');
    candidates = [...dictionary];
    guessInput.value = '';
    feedbackInput.value = '';
    statusEl.textContent = `Reset. Loaded ${dictionary.length} words.`;
    renderCandidates();
  });

  // ----------------------------
  // Filtering logic
  // ----------------------------

  function applyGuessToCandidates(guess, feedback, words) {
    // Feedback symbols: G (green), Y (yellow), X (gray)
    const gArr = guess.split('');
    const fArr = feedback.split('');

    // Derived constraints
    const requiredPositions = {};   // pos -> letter (greens)
    const forbiddenPositions = {};  // pos -> Set(letter) forbidden here (yellows)
    const minLetterCounts = {};     // minimum occurrences per letter (from total G+Y)
    const maxLetterCounts = {};     // maximum occurrences per letter (from X caps)

    // Count total Y+G per letter in this guess
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

    // For X: cap letter count to Y+G count (if any), else 0
    for (let i = 0; i < 5; i++) {
      const ch = gArr[i];
      if (fArr[i] === 'X') {
        const allowed = ygCounts[ch] || 0; // if none G/Y, cap is 0
        maxLetterCounts[ch] = Math.max(maxLetterCounts[ch] ?? allowed, allowed);
      }
    }

    // Min counts from Y/G totals
    for (const [ch, cnt] of Object.entries(ygCounts)) {
      minLetterCounts[ch] = Math.max(minLetterCounts[ch] ?? cnt, cnt);
    }

    if (DEBUG_ALERTS) {
      alert(
        'Constraints:\n' +
        `Greens: ${JSON.stringify(requiredPositions)}\n` +
        `Min: ${JSON.stringify(minLetterCounts)}\n` +
        `Max: ${JSON.stringify(maxLetterCounts)}`
      );
    }

    return words.filter(candidate => {
      // Greens: exact match at positions
      for (const [posStr, letter] of Object.entries(requiredPositions)) {
        const pos = Number(posStr);
        if (candidate[pos] !== letter) return false;
      }

      // Yellows: letter present but NOT at same position
      for (let i = 0; i < 5; i++) {
        if (fArr[i] === 'Y') {
          const ch = gArr[i];
          if (candidate[i] === ch) return false;
          if (!candidate.includes(ch)) return false;
        }
      }

      // Count constraints (min/max per letter)
      const candCounts = countLetters(candidate);
      for (const [ch, minCnt] of Object.entries(minLetterCounts)) {
        if ((candCounts[ch] || 0) < minCnt) return false;
      }
      for (const [ch, maxCnt] of Object.entries(maxLetterCounts)) {
        if ((candCounts[ch] || 0) > maxCnt) return false;
      }

      // Additionally forbid yellow letters at their specific positions
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

  // ----------------------------
  // Kick off
  // ----------------------------
  loadDictionary();
});
