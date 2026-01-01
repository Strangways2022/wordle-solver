// script.js — Wordle Solver (GitHub Pages) with validated, lenient dictionary loader and testing alerts
// + Prevent re-guessing the same word; persist previous guesses in localStorage
// + Option B: Reset fully clears guess history (in-memory + localStorage)

/**
 * ===== CONFIG =====
 * Toggle these while testing/production.
 */
const DEBUG_ALERTS = true;               // show alerts for key steps (set false for production)
const SILENT_VALIDATION_ALERTS = true;   // true = no popups from validation reporting
const SHOW_INVALID_SAMPLE_COUNT = 10;    // how many invalid lines to show in alerts (when SILENT_VALIDATION_ALERTS=false)
const DICT_ORIGIN = 'https://strangways2022.github.io/wordle-solver/'; // your Pages origin

// Enforce that guesses must be present in the dictionary
const REQUIRE_GUESS_IN_DICTIONARY = true;

// Duplicate-guess handling/persistence
const PREVENT_DUPLICATE_GUESSES = true;                  // block guesses already entered before
const PERSIST_PREVIOUS_GUESSES = true;                   // save to localStorage for next visit
const CLEAR_PREVIOUS_GUESSES_ON_RESET = true;            // **Option B**: Reset clears history (in-memory + storage)
const STORAGE_KEY_PREV = 'wordle_solver_prev_guesses_v1'; // localStorage key

function tell(msg) {
  console.log(msg);
  if (DEBUG_ALERTS) alert(msg);
}

// Minimal startup log
console.log("✅ JS file executed successfully. Current script URL:", document.currentScript?.src);

document.addEventListener('DOMContentLoaded', () => {
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
  let dictionary = [];       // All valid 5-letter words (normalized and deduped)
  let dictionarySet = null;  // Fast membership lookup
  let candidates = [];       // Current filtered list

  // Previous guesses
  let previousGuesses = [];           // array of strings (lowercase)
  let previousGuessesSet = new Set(); // O(1) lookups

  // ===== Previous guesses persistence =====
  function loadPreviousGuesses() {
    if (!PERSIST_PREVIOUS_GUESSES) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREV);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        // Keep only valid 5-letter lowercase entries
        previousGuesses = arr
          .map(x => String(x).trim().toLowerCase())
          .filter(x => /^[a-z]{5}$/.test(x));
        previousGuessesSet = new Set(previousGuesses);
        console.log(`Loaded ${previousGuesses.length} previous guesses from storage.`);
      }
    } catch (e) {
      console.warn('Could not load previous guesses:', e);
    }
  }

  function savePreviousGuesses() {
    if (!PERSIST_PREVIOUS_GUESSES) return;
    try {
      localStorage.setItem(STORAGE_KEY_PREV, JSON.stringify(previousGuesses));
    } catch (e) {
      console.warn('Could not save previous guesses:', e);
    }
  }

  function clearPreviousGuesses() {
    // Clear in-memory
    previousGuesses = [];
    previousGuessesSet.clear();
    // Clear persistent storage
    if (PERSIST_PREVIOUS_GUESSES) {
      try {
        localStorage.removeItem(STORAGE_KEY_PREV);
        console.log('Cleared previous guesses from localStorage.');
      } catch (e) {
        console.warn('Could not clear previous guesses from storage:', e);
      }
    }
  }

  // Initialize previous guesses from storage (if any)
  loadPreviousGuesses();

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
      console.log('Fetching dictionary from:', dictUrl);

      const t0 = performance.now();
      const res = await fetch(dictUrl, { cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);

      if (!res.ok) {
        report(`Failed to load ${dictUrl} (HTTP ${res.status}) in ${ms} ms`);
        // Optional: keep app usable with a fallback list
        // loadFallbackDictionary();
        return false;
      }

      const text = await res.text();
      console.log(`Dictionary response OK (chars=${text.length}).`);

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
      dictionarySet = new Set(dictionary);
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

      return true;
    } catch (err) {
      console.error('Dictionary load failed:', err);
      statusEl.textContent = `Load error: ${err.message}`;
      if (!SILENT_VALIDATION_ALERTS) alert(`Load error: ${err.message}`);
      // Optional: loadFallbackDictionary();
      return false;
    }
  }

  /**
   * Optional fallback dictionary (keeps app usable if fetch/validation fails).
   */
  function loadFallbackDictionary() {
    dictionary = ['crate','slate','trace','raise','thing','adieu','roate','stare','arise','later'];
    dictionarySet = new Set(dictionary);
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
      console.log('No candidates remain after filtering.');
    }
    console.log(`Rendered ${Math.min(candidates.length, 200)} items (total ${candidates.length}).`);
  }

  // ========= Validation =========
  function validateInputs(guess, feedback) {
    if (!/^[a-z]{5}$/.test(guess)) return 'Guess must be 5 letters (A–Z).';
    if (!/^[GYXgyx]{5}$/.test(feedback)) return 'Feedback must be 5 characters using G/Y/X.';
    return null;
  }

  function isGuessInDictionary(guess) {
    if (!dictionarySet) return false;
    return dictionarySet.has(guess);
  }

  // ========= Filtering Logic (Wordle rules incl. duplicates) =========
  function applyGuessToCandidates(guess, feedback, words) {
    const gArr = guess.split('');
    const fArr = feedback.toUpperCase().split(''); // normalize to uppercase

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
        maxLetterCounts[ch] = Math.max(maxLetterCounts[ch] ?? allowed, allowed);
      }
    }

    // Minimum counts from total Y+G per letter
    for (const [ch, cnt] of Object.entries(ygCounts)) {
      minLetterCounts[ch] = Math.max(minLetterCounts[ch] ?? cnt, cnt);
    }

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
          if (candidate[i] === ch) return false;    // not allowed at same position
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
    const guess    = (guessInput.value || '').trim().toLowerCase();
    const feedback = (feedbackInput.value || '').trim().toUpperCase();

    // 1) Format validation
    const err = validateInputs(guess, feedback);
    if (err) {
      statusEl.textContent = '❌ ' + err;
      if (!SILENT_VALIDATION_ALERTS) alert(err);
      return;
    }

    // 2) Dictionary membership (optional)
    if (REQUIRE_GUESS_IN_DICTIONARY && !isGuessInDictionary(guess)) {
      const msg = `❌ "${guess.toUpperCase()}" is not in the word list. Enter a valid 5-letter word.`;
      statusEl.textContent = msg;
      if (!SILENT_VALIDATION_ALERTS) alert(msg);
      return;
    }

    // 3) Duplicate guess prevention
    if (PREVENT_DUPLICATE_GUESSES && previousGuessesSet.has(guess)) {
      const msg = `❌ You've already guessed "${guess.toUpperCase()}". Try a new word.`;
      statusEl.textContent = msg;
      if (!SILENT_VALIDATION_ALERTS) alert(msg);
      return;
    }

    if (candidates.length === 0 && dictionary.length === 0) {
      const msg = 'No candidates loaded. Did words.txt fail to load?';
      statusEl.textContent = '❌ ' + msg;
      if (!SILENT_VALIDATION_ALERTS) alert(msg);
      console.warn(msg);
      return;
    }

    const before = candidates.length;
    candidates = applyGuessToCandidates(guess, feedback, candidates);
    const after = candidates.length;

    // Record this guess in history (for duplicate prevention next time)
    previousGuesses.push(guess);
    previousGuessesSet.add(guess);
    savePreviousGuesses();

    const msg = `Applied ${guess.toUpperCase()} / ${feedback}. Remaining: ${after} (was ${before}).`;
    statusEl.textContent = msg;
    console.log(msg);

    // Optional: clear inputs for convenience
    guessInput.value = '';
    feedbackInput.value = '';
    guessInput.focus();

    renderCandidates();
  });

  resetBtn.addEventListener('click', () => {
    // Rehydrate candidate list & clear inputs
    candidates = [...dictionary];
    guessInput.value = '';
    feedbackInput.value = '';

    // ===== Option B: clear both in-memory and localStorage history =====
    clearPreviousGuesses();

    const msg = `Reset. Loaded ${dictionary.length} words. (Guess history fully cleared.)`;
    statusEl.textContent = msg;
    console.log(msg);

    renderCandidates();
  });

  // ========= Kick off =========
  loadDictionary();
});
