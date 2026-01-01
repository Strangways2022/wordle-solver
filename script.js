// script.js — Wordle Solver (GitHub Pages) with validated, lenient dictionary loader and testing alerts

/**
 * ===== CONFIG =====
 * Toggle these while testing/production.
 */
const DEBUG_ALERTS = true;               // show alerts for key steps (set false for production)
const SILENT_VALIDATION_ALERTS = true;   // true = no popups from validation reporting
const SHOW_INVALID_SAMPLE_COUNT = 10;    // how many invalid lines to show in alerts (when SILENT_VALIDATION_ALERTS=false)
const DICT_ORIGIN = 'https://strangways2022.github.io/wordle-solver/'; // your Pages origin

function tell(msg) {
  console.log(msg);
  if (DEBUG_ALERTS) alert(msg);
}
// In your JavaScript file (e.g., app.js)
//alert("✅ JS file is running from GitHub Pages!");
console.log("✅ JS file executed successfully. Current script URL:", document.currentScript?.src);
// Prove the external JS is loading
//tell('script.js: external file loaded.');

document.addEventListener('DOMContentLoaded', () => {
  //tell('script.js: DOMContentLoaded fired.');

  // ========= DOM Elements =========
  const guessInput     = document.getElementById('guess');
  const feedbackInput  = document.getElementById('feedback');
  const submitBtn      = document.getElementById('submit-btn');
  const resetBtn       = document.getElementById('reset-btn');
  const listEl         = document.getElementById('possible-words');
  const countEl        = document.getElementById('count');
  const statusEl       = document.getElementById('status');
  const formEl         = document.getElementById('guess-form');

  // Sanity check: all required elements present?
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

  // Prevent form submission/reload
  formEl.addEventListener('submit', (e) => e.preventDefault());

  // Disable actions until dictionary loads
  submitBtn.disabled = true;
  resetBtn.disabled = true;

  // ========= App State =========
  let dictionary = [];   // All valid 5-letter words (normalized and deduped)
  let candidates = [];   // Current filtered list

  /**
   * Build absolute dictionary URL with cache buster (avoids GH Pages caching quirks).
   */
  function buildDictUrl() {
    const url = new URL('words.txt', DICT_ORIGIN);
    url.searchParams.set('ts', Date.now()); // cache bust while testing
    return url.href;
  }

  /**
   * Validate and normalize the words.txt content:
   *  - Accept only EXACTLY 5 ASCII letters (A–Z)
   *  - Lowercase all words
   *  - Skip empty lines
   *  - Deduplicate valid entries
   * Returns { valid: string[], invalid: string[], stats: {…} }
   */
  function validateAndNormalizeWords(text) {
    const clean = text.replace(/^\uFEFF/, '');  // strip BOM if present
    const lines = clean.split(/\r?\n/);

    const valid = [];
    const invalid = [];
    const seen = new Set();
    let emptyCount = 0;

    for (const rawLine of lines) {
      const trimmed = (rawLine || '').trim();

      if (!trimmed) {
        emptyCount++;
        continue;              // skip empty
      }
      if (!/^[A-Za-z]{5}$/.test(trimmed)) {
        invalid.push(rawLine); // keep raw for diagnostics
        continue;              // skip invalid
      }

      const w = trimmed.toLowerCase();
      if (!seen.has(w)) {
        seen.add(w);
        valid.push(w);         // dedupe
      }
    }

    // Approximate duplicates/empties count
    const duplicateCount = lines.length - emptyCount - invalid.length - valid.length;

    return {
      valid,
      invalid,
      stats: {
        totalLines: lines.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        emptyCount,
        duplicateCount,
      },
    };
  }

  /**
   * ===== DICTIONARY LOADER (VALIDATED & LENIENT) =====
   * Fetches words.txt, validates, skips invalid lines, dedupes, and reports counts.
   */
  async function loadDictionary() {
    function report(msg) {
      console.log(msg);
      statusEl.textContent = msg;
      if (!SILENT_VALIDATION_ALERTS) alert(msg);
    }

    try {
      const dictUrl = buildDictUrl();
      report('Loading word list…');
      tell('Fetching dictionary from: ' + dictUrl);

      const t0 = performance.now();
      const res = await fetch(dictUrl, { cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);

      if (!res.ok) {
        report(`Failed to load ${dictUrl} (HTTP ${res.status}) in ${ms} ms`);
        // Optional: keep app usable with a tiny fallback list
        // loadFallbackDictionary();
        return false;
      }

      const text = await res.text();
      tell(`Dictionary response OK (chars=${text.length}).`);

      const { valid, invalid, stats } = validateAndNormalizeWords(text);

      if (valid.length === 0) {
        report(
          `Loaded in ${ms} ms but found no valid 5-letter words. ` +
          `Invalid: ${stats.invalidCount}, Empty: ${stats.emptyCount}`
        );
        // Optional: loadFallbackDictionary();
        return false;
      }

      dictionary = valid;
      candidates = [...dictionary];

      report(
        `Loaded ${stats.validCount} words in ${ms} ms. ` +
        `Skipped invalid: ${stats.invalidCount}, empty: ${stats.emptyCount}, duplicates: ${stats.duplicateCount}.`
      );

      if (!SILENT_VALIDATION_ALERTS && invalid.length) {
        const sample = invalid.slice(0, SHOW_INVALID_SAMPLE_COUNT)
          .map(s => `• ${String(s).replace(/\t/g, '\\t')}`);
        alert(`Sample invalid lines (${sample.length}/${invalid.length}):\n` + sample.join('\n'));
      }

      renderCandidates();
      submitBtn.disabled = false;
      resetBtn.disabled = false;
      //tell('Buttons enabled.');

      return true;
    } catch (err) {
      console.error('Dictionary load failed:', err);
      statusEl.textContent = `Load error: ${err.message}`;
      if (!DEBUG_ALERTS) alert(`Load error: ${err.message}`);
      // Optional: loadFallbackDictionary();
      return false;
    }
  }

  /**
   * Optional fallback dictionary (keeps app usable if fetch/validation fails).
   */
  function loadFallbackDictionary() {
    dictionary = ['crate','slate','trace','raise','thing','adieu','roate','stare','arise','later'];
    candidates = [...dictionary];
    statusEl.textContent = `Loaded fallback (${dictionary.length}) words.`;
    renderCandidates();
    submitBtn.disabled = false;
    resetBtn.disabled = false;
  }

  // ========= Rendering =========
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

  // ========= Validation =========
  function validateInputs(guess, feedback) {
    if (!/^[a-z]{5}$/.test(guess)) return 'Guess must be 5 letters (A–Z).';
    if (!/^[GYXgyx]{5}$/.test(feedback)) return 'Feedback must be 5 characters using G/Y/X.';
    return null;
  }

  // ========= Filtering Logic (Wordle rules incl. duplicates) =========
  /**
   * Apply a single guess+feedback across the candidate list.
   * Feedback:
   *  - G: correct letter at position
   *  - Y: letter present but wrong position
   *  - X: letter not present; when guess includes duplicates, X caps total count
   *      to the number of Y+G for that letter in THIS guess.
   */
  function applyGuessToCandidates(guess, feedback, words) {
    const gArr = guess.split('');
    const fArr = feedback.split('');

    const requiredPositions = {};   // greens: pos -> letter
    const forbiddenPositions = {};  // yellows: pos -> Set(letter)
    const minLetterCounts = {};     // letter -> min occurrences (from Y+G totals)
    const maxLetterCounts = {};     // letter -> max occurrences (caps from X when Y/G exist)

    const ygCounts = {};            // Y+G tally per letter in THIS guess
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

    // For X positions: cap letter count to Y+G for that letter (or 0 if none)
    for (let i = 0; i < 5; i++) {
      const ch = gArr[i];
      if (fArr[i] === 'X') {
        const allowed = ygCounts[ch] || 0;
        // Use the largest cap seen across multiple Xs in the same guess
        maxLetterCounts[ch] = Math.max(maxLetterCounts[ch] ?? allowed, allowed);
      }
    }

    // Minimum counts come from total Y+G per letter
    for (const [ch, cnt] of Object.entries(ygCounts)) {
      minLetterCounts[ch] = Math.max(minLetterCounts[ch] ?? cnt, cnt);
    }

    //tell(
      'Constraints from guess:\n' +
      `Greens: ${JSON.stringify(requiredPositions)}\n` +
      `Min: ${JSON.stringify(minLetterCounts)}\n` +
      `Max: ${JSON.stringify(maxLetterCounts)}`
    );

    return words.filter(candidate => {
      // 1) Greens at exact positions
      for (const [posStr, letter] of Object.entries(requiredPositions)) {
        const pos = Number(posStr);
        if (candidate[pos] !== letter) return false;
      }

      // 2) Yellows: present but not at that position
      for (let i = 0; i < 5; i++) {
        if (fArr[i] === 'Y') {
          const ch = gArr[i];
          if (candidate[i] === ch) return false;   // not allowed at same position
          if (!candidate.includes(ch)) return false; // must exist elsewhere
        }
      }

      // 3) Per-letter min/max counts
      const candCounts = countLetters(candidate);
      for (const [ch, minCnt] of Object.entries(minLetterCounts)) {
        if ((candCounts[ch] || 0) < minCnt) return false;
      }
      for (const [ch, maxCnt] of Object.entries(maxLetterCounts)) {
        if ((candCounts[ch] || 0) > maxCnt) return false;
      }

      // 4) Additional yellow positional forbiddance
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

  // ========= Handlers =========
  submitBtn.addEventListener('click', () => {
    //tell('Submit clicked.');
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
    //tell('Reset clicked.');
    candidates = [...dictionary];
    guessInput.value = '';
    feedbackInput.value = '';
    const msg = `Reset. Loaded ${dictionary.length} words.`;
    statusEl.textContent = msg;
    tell(msg);
    renderCandidates();
  });

  // ========= Kick off =========
  loadDictionary();
});
