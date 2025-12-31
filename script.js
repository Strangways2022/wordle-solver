// script.js — Wordle Solver (GitHub Pages) with lenient dictionary loader and alerts

// Toggle alerts for testing
const DEBUG_ALERTS = true;
function tell(msg) {
  console.log(msg);
  if (DEBUG_ALERTS) alert(msg);
}

// Prove the external JS is loading
tell('script.js: external file loaded.');

document.addEventListener('DOMContentLoaded', () => {
  tell('script.js: DOMContentLoaded fired.');

  // DOM elements
  const guessInput     = document.getElementById('guess');
  const feedbackInput  = document.getElementById('feedback');
  const submitBtn      = document.getElementById('submit-btn');
  const resetBtn       = document.getElementById('reset-btn');
  const listEl         = document.getElementById('possible-words');
  const countEl        = document.getElementById('count');
  const statusEl       = document.getElementById('status');
  const formEl         = document.getElementById('guess-form');

  // Sanity check
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
    tell(msg);
    return;
  }

  formEl.addEventListener('submit', (e) => e.preventDefault());

  // Disable actions until dictionary loads
  submitBtn.disabled = true;
  resetBtn.disabled = true;

  // App state
  let dictionary = [];   // All valid 5-letter words
  let candidates = [];   // Current filtered candidates

  // ------------------------------------------------------------
  // Lenient dictionary loader: skips invalid lines & dedupes
  // ------------------------------------------------------------
  async function loadDictionary() {
    // Set to true to suppress alert popups after testing
    const SILENT = false;

    function status(msg) {
      console.log(msg);
      statusEl.textContent = msg;
      if (!SILENT) alert(msg);
    }

    try {
      status('Loading word list…');

      // Absolute URL to your Pages dictionary (same-origin, no ambiguity)
      const dictUrl = 'https://strangways2022.github.io/wordle-solver/words.txt?ts=' + Date.now();
      tell('Fetching dictionary from: ' + dictUrl);

      const t0 = performance.now();
      const res = await fetch(dictUrl, { cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);

      if (!res.ok) {
        status(`Failed to load ${dictUrl} (HTTP ${res.status}) in ${ms} ms`);
        // Optional: fallback to tiny built-in list
        // loadFallbackDictionary();
        return false;
      }

      let text = await res.text();
      tell(`Dictionary response OK (chars=${text.length}).`);

      // Normalize: remove BOM, split lines
      text = text.replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/);

      const valid = [];
      const invalid = [];
      const seen = new Set();

      for (let raw of lines) {
        const w = (raw || '').trim().toLowerCase();
        if (!w) continue;                          // skip empty lines
        if (!/^[a-z]{5}$/.test(w)) {               // only 5-letter a–z
          invalid.push(raw);
          continue;
        }
        if (!seen.has(w)) {
          seen.add(w);
          valid.push(w);                           // dedupe
        }
      }

      if (valid.length === 0) {
        status(`Loaded in ${ms} ms but found no valid 5-letter words. Skipped ${invalid.length} invalid entr${invalid.length === 1 ? 'y' : 'ies'}.`);
        return false;
      }

      dictionary = valid;
      candidates = [...dictionary];

      const duplicatesCount = lines.length - invalid.length - valid.length;
      const msg = `Loaded ${dictionary.length} valid words in ${ms} ms. Skipped ${invalid.length} invalid and ${duplicatesCount} duplicates/empties.`;
      status(msg);

      if (!SILENT && invalid.length) {
        const sampleInvalid = invalid.slice(0, 5);
        alert('Sample invalid lines:\n' + sampleInvalid.map(s => `• ${s}`).join('\n'));
      }

      renderCandidates();
      submitBtn.disabled = false;
      resetBtn.disabled = false;
      tell('Buttons enabled.');
      return true;
    } catch (err) {
      console.error('Dictionary load failed:', err);
      statusEl.textContent = `Load error: ${err.message}`;
      if (!DEBUG_ALERTS) alert(`Load error: ${err.message}`);
      // Optional: loadFallbackDictionary();
      return false;
    }
  }

  // Optional fallback words if you want the app usable even when fetch fails
  function loadFallbackDictionary() {
    dictionary = ['crate','slate','trace','raise','thing','adieu','roate','stare','arise','later'];
    candidates = [...dictionary];
    statusEl.textContent = `Loaded fallback (${dictionary.length}) words.`;
    renderCandidates();
    submitBtn.disabled = false;
    resetBtn.disabled = false;
  }

  // ------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------
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
      tell('No candidates remain after filtering.');
    }
    tell(`Rendered ${Math.min(candidates.length, 200)} items (total ${candidates.length}).`);
  }

  // ------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------
  function validateInputs(guess, feedback) {
    if (!/^[a-z]{5}$/.test(guess)) return 'Guess must be 5 letters (A–Z).';
    if (!/^[GYXgyx]{5}$/.test(feedback)) return 'Feedback must be 5 characters using G/Y/X.';
    return null;
  }

  // ------------------------------------------------------------
  // Filtering logic (Wordle rules incl. duplicates)
  // ------------------------------------------------------------
  function applyGuessToCandidates(guess, feedback, words) {
    const gArr = guess.split('');
    const fArr = feedback.split('');

    const requiredPositions = {};   // greens: pos -> letter
    const forbiddenPositions = {};  // yellows: pos -> Set(letter)
    const minLetterCounts = {};     // letter -> min occurrences (from Y+G totals)
    const maxLetterCounts = {};     // letter -> max occurrences (caps from X when Y/G exist)

    const ygCounts = {};            // tally of Y+G per letter in THIS guess
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
        maxLetterCounts[ch] = Math.max(maxLetterCounts[ch] ?? allowed, allowed);
      }
    }

    // Minimum counts come from total Y+G for each letter in this guess
    for (const [ch, cnt] of Object.entries(ygCounts)) {
      minLetterCounts[ch] = Math.max(minLetterCounts[ch] ?? cnt, cnt);
    }

    tell(
      'Constraints from guess:\n' +
      `Greens: ${JSON.stringify(requiredPositions)}\n` +
      `Min: ${JSON.stringify(minLetterCounts)}\n` +
      `Max: ${JSON.stringify(maxLetterCounts)}`
    );

    return words.filter(candidate => {
      // Greens at exact positions
      for (const [posStr, letter] of Object.entries(requiredPositions)) {
        const pos = Number(posStr);
        if (candidate[pos] !== letter) return false;
      }

      // Yellows must be present but not at that position
      for (let i = 0; i < 5; i++) {
        if (fArr[i] === 'Y') {
          const ch = gArr[i];
          if (candidate[i] === ch) return false;
          if (!candidate.includes(ch)) return false;
        }
      }

      // Per-letter min/max counts
      const candCounts = countLetters(candidate);
      for (const [ch, minCnt] of Object.entries(minLetterCounts)) {
        if ((candCounts[ch] || 0) < minCnt) return false;
      }
      for (const [ch, maxCnt] of Object.entries(maxLetterCounts)) {
        if ((candCounts[ch] || 0) > maxCnt) return false;
      }

      // Additional yellow positional forbiddance
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

  // ------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------
  submitBtn.addEventListener('click', () => {
    tell('Submit clicked.');
    const guess    = (guessInput.value || '').trim().toLowerCase();
    const feedback = (feedbackInput.value || '').trim().toUpperCase();

    const err = validateInputs(guess, feedback);
    if (err) { tell('Validation error: ' + err); alert(err); return; }

    if (candidates.length === 0 && dictionary.length === 0) {
      const msg = 'No candidates loaded. Did words.txt fail to load?';
      tell(msg); alert(msg); return;
    }

    const before = candidates.length;
    candidates = applyGuessToCandidates(guess, feedback, candidates);
    const after = candidates.length;

    const msg = `Applied ${guess.toUpperCase()} / ${feedback}. Remaining: ${after} (was ${before}).`;
    statusEl.textContent = msg;
    tell(msg);
    renderCandidates();
  });

  resetBtn.addEventListener('click', () => {
    tell('Reset clicked.');
    candidates = [...dictionary];
    guessInput.value = '';
    feedbackInput.value = '';
    const msg = `Reset. Loaded ${dictionary.length} words.`;
    statusEl.textContent = msg;
    tell(msg);
    renderCandidates();
  });

  // Kick off
  loadDictionary();
});
