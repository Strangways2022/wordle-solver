// script.js — Wordle Solver for GitHub Pages (dictionary load fix)
// Toggle this to true while debugging on mobile (Android Chrome will show alerts)
const DEBUG_ALERTS = false;
function dbg(msg) { if (DEBUG_ALERTS) alert(msg); }

// Run after DOM is parsed (use script.js</script> in HTML)
document.addEventListener('DOMContentLoaded', () => {
  dbg('Initializing Wordle Solver…');

  // ----------------------------
  // App state
  // ----------------------------
  let dictionary = [];   // All valid 5-letter words
  let candidates = [];   // Current filtered candidates

  // ----------------------------
  // DOM elements (IDs must match index.html)
  // ----------------------------
  const guessInput     = document.getElementById('guess');
  const feedbackInput  = document.getElementById('feedback');
  const submitBtn      = document.getElementById('submit-btn');
  const resetBtn       = document.getElementById('reset-btn');
  const listEl         = document.getElementById('possible-words');
  const countEl        = document.getElementById('count');
  const statusEl       = document.getElementById('status');
  const formEl         = document.getElementById('guess-form');
  // Optional: file input fallback (add <input type="file" id="dict-file" accept=".txt"> in HTML if you want)
  const dictFileInput  = document.getElementById('dict-file');

  // Guard: ensure the page contains the required elements
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
    if (statusEl) statusEl.textContent = msg;
    console.error(msg);
    dbg(msg);
    return; // Stop: HTML must match IDs above
  }

  // Safety: prevent form auto-submit / reload
  formEl.addEventListener('submit', (e) => e.preventDefault());

  // Disable actions until dictionary loads
  submitBtn.disabled = true;
  resetBtn.disabled = true;

  // ----------------------------
  // Dictionary loader (robust for GitHub Pages)
  // ----------------------------
  async function loadDictionary() {
    try {
      statusEl.textContent = 'Loading word list…';

      // Resolve relative to the document's directory (force trailing slash)
      const docDir = location.href.endsWith('/')
        ? location.href
        : location.href.replace(/[^/]+$/, ''); // strip last segment to get directory

      const dictUrl = new URL('words.txt?ts=' + Date.now(), docDir).href;

      dbg('Fetching: ' + dictUrl);

      const t0 = performance.now();
      const res = await fetch(dictUrl, { cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);

      if (!res.ok) {
        const msg = `Failed to load ${dictUrl} (HTTP ${res.status}) in ${ms} ms`;
        statusEl.textContent = msg;
        console.error(msg);
        if (!DEBUG_ALERTS) alert(msg);
        // Optionally, load a tiny fallback list to keep the app usable:
        // loadFallbackDictionary();
        return;
      }

      const text = await res.text();

      // Normalize: keep only clean 5-letter [a-z]
      dictionary = text
        .split(/\r?\n/)
        .map(w => w.trim().toLowerCase())
        .filter(w => /^[a-z]{5}$/.test(w));

      if (dictionary.length === 0) {
        const msg = 'words.txt loaded but contained no valid 5-letter words.';
        statusEl.textContent = msg;
        console.warn(msg);
        if (!DEBUG_ALERTS) alert(msg);
        return;
      }

      candidates = [...dictionary];

      statusEl.textContent = `Loaded ${dictionary.length} words in ${ms} ms.`;
      dbg(statusEl.textContent);

      renderCandidates();

      submitBtn.disabled = false;
      resetBtn.disabled = false;
    } catch (err) {
      const msg = `Load error: ${err.message}`;
      statusEl.textContent = msg;
      console.error('Dictionary load failed:', err);
      if (!DEBUG_ALERTS) alert(msg);
      // Optionally, load a tiny fallback list:
      // loadFallbackDictionary();
    }
  }

  // Optional fallback dictionary if fetch fails (uncomment the call above to use)
  function loadFallbackDictionary() {
    dictionary = ['crate','slate','trace','raise','thing','adieu','roate','later','stare','arise'];
    candidates = [...dictionary];
    statusEl.textContent = `Loaded fallback (${dictionary.length}) words.`;
    renderCandidates();
    submitBtn.disabled = false;
    resetBtn.disabled = false;
  }

  // Optional: allow user-uploaded dictionary
  if (dictFileInput) {
    dictFileInput.addEventListener('change', async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        dictionary = text
          .split(/\r?\n/)
          .map(w => w.trim().toLowerCase())
          .filter(w => /^[a-z]{5}$/.test(w));
        candidates = [...dictionary];
        statusEl.textContent = `Loaded ${dictionary.length} words from file.`;
        renderCandidates();
        submitBtn.disabled = false;
        resetBtn.disabled = false;
      } catch (err) {
        alert('Failed to read dictionary file: ' + err.message);
      }
    });
  }

  // ----------------------------
  // Rendering
  // ----------------------------
  function renderCandidates() {
    listEl.innerHTML = '';
    countEl.textContent = String(candidates.length);

    // Limit to 200 for responsiveness
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

    const guess    = guessInput.value.trim().toLowerCase();
    const feedback = feedbackInput.value.trim().toUpperCase();

    dbg(`Inputs: guess=${guess}, feedback=${feedback}`);

    const err = validateInputs(guess, feedback);
    if (err) {
      alert(err);
      dbg('Validation error: ' + err);
      return;
    }
    if (candidates.length === 0 && dictionary.length === 0) {
      const msg = 'No candidates loaded. Did words.txt fail to load?';
      alert(msg);
      dbg(msg);
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
      console.error('Error applying guess:', e);
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
  // Filtering logic (Wordle rules with duplicates)
  // ----------------------------

  /**
   * Apply a single guess+feedback across the candidate list.
   * Feedback symbols:
   *  - G: correct letter in correct position (green)
   *  - Y: letter in word but wrong position (yellow)
   *  - X: letter not in word (gray), with duplicate nuance:
   *      If the letter had no G/Y in this guess => total allowed count is 0.
   *      If the letter had some G/Y elsewhere => cap total count to the G+Y count.
   */
  function applyGuessToCandidates(guess, feedback, words) {
    const gArr = guess.split('');
    const fArr = feedback.split('');

    const requiredPositions = {};   // pos -> letter (greens)
    const forbiddenPositions = {};  // pos -> Set(letter) forbidden here (yellows)
    const minLetterCounts = {};     // per-letter minimum occurrences (from total G+Y)
    const maxLetterCounts = {};     // per-letter maximum occurrences (caps from X)

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

    // For X positions, cap letter count to the known Y+G count (if any), else 0
    for (let i = 0; i < 5; i++) {
      const ch = gArr[i];
      if (fArr[i] === 'X') {
        const allowed = ygCounts[ch] || 0;
        // Use "largest cap seen" to avoid overwriting a stricter cap from another X
        maxLetterCounts[ch] = Math.max(maxLetterCounts[ch] ?? allowed, allowed);
      }
    }

    // Minimum counts come from total Y+G for each letter
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
      // 1) Greens: must match at those positions
      for (const [posStr, letter] of Object.entries(requiredPositions)) {
        const pos = Number(posStr);
        if (candidate[pos] !== letter) return false;
      }

      // 2) Yellows: must be present somewhere but NOT at that position
      for (let i = 0; i < 5; i++) {
        if (fArr[i] === 'Y') {
          const ch = gArr[i];
          if (candidate[i] === ch) return false;       // not allowed at same position
          if (!candidate.includes(ch)) return false;    // must exist elsewhere
        }
      }

      // 3) Count constraints: enforce min (Y/G) and max (X caps)
      const candCounts = countLetters(candidate);
      for (const [ch, minCnt] of Object.entries(minLetterCounts)) {
        if ((candCounts[ch] || 0) < minCnt) return false;
      }
      for (const [ch, maxCnt] of Object.entries(maxLetterCounts)) {
        if ((candCounts[ch] || 0) > maxCnt) return false;
      }

      // 4) Additional yellow position forbiddance
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
