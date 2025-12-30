// script.js — with alert() logs for mobile debugging
document.addEventListener('DOMContentLoaded', () => {
  alert('Page loaded: initializing Wordle Solver script');

  // UI & workflow state
  let candidates = [];   // Current filtered candidates
  let dictionary = [];   // Full dictionary (5-letter words)

  // Grab DOM elements
  const guessInput   = document.getElementById('guess');
  const feedbackInput= document.getElementById('feedback');
  const submitBtn    = document.getElementById('submit-btn');
  const resetBtn     = document.getElementById('reset-btn');
  const listEl       = document.getElementById('possible-words');
  const countEl      = document.getElementById('count');
  const statusEl     = document.getElementById('status');

  // Guard: check for missing elements early
  const missing = [
    ['#guess', guessInput],
    ['#feedback', feedbackInput],
    ['#submit-btn', submitBtn],
    ['#reset-btn', resetBtn],
    ['#possible-words', listEl],
    ['#count', countEl],
    ['#status', statusEl],
  ].filter(([id, el]) => !el);

  if (missing.length) {
    const msg = 'Missing required elements: ' + missing.map(([id]) => id).join(', ');
    alert(msg);
    console.error(msg);
    return; // stop script—HTML must match IDs above
  }

  // Disable actions until dictionary loads
  submitBtn.disabled = true;
  resetBtn.disabled = true;

  // ----------------------
  // Dictionary loader
  // ----------------------
  async function loadDictionary() {
    try {
      statusEl.textContent = 'Loading word list...';
      alert('Fetching ./words.txt ...');

      // IMPORTANT: keep words.txt in the same folder as index.html
      const res = await fetch('./words.txt', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load words.txt (HTTP ${res.status})`);

      const text = await res.text();
      alert('words.txt fetched; parsing words...');

      // Normalize and keep only clean 5-letter [a-z]
      dictionary = text
        .split(/\r?\n/)
        .map(w => w.trim().toLowerCase())
        .filter(w => /^[a-z]{5}$/.test(w));

      candidates = [...dictionary];
      statusEl.textContent = `Loaded ${dictionary.length} words.`;
      alert(`Dictionary loaded: ${dictionary.length} words`);

      renderCandidates();

      submitBtn.disabled = false;
      resetBtn.disabled = false;
    } catch (err) {
      const msg = `Error loading dictionary: ${err.message}. Ensure words.txt is next to index.html (GitHub Pages: same directory)`;
      statusEl.textContent = msg;
      alert(msg);
      console.error(err);
    }
  }

  // ----------------------
  // Rendering results
  // ----------------------
  function renderCandidates() {
    listEl.innerHTML = '';
    countEl.textContent = candidates.length.toString();

    // Show up to 200 to keep UI responsive
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

  // ----------------------
  // Input validation
  // ----------------------
  function validateInputs(guess, feedback) {
    if (!/^[a-z]{5}$/.test(guess)) return 'Guess must be 5 letters (a–z).';
    if (!/^[GYXgyx]{5}$/.test(feedback)) return 'Feedback must be 5 characters using G/Y/X.';
    return null;
  }

  // ----------------------
  // Button handlers
  // ----------------------
  submitBtn.addEventListener('click', () => {
    alert('Submit button clicked');

    const guess = guessInput.value.trim().toLowerCase();
    const feedback = feedbackInput.value.trim().toUpperCase();

    alert(`Inputs captured:\nGuess = ${guess}\nFeedback = ${feedback}`);

    const err = validateInputs(guess, feedback);
    if (err) {
      alert(`Validation error: ${err}`);
      return;
    }

    if (candidates.length === 0) {
      alert('No candidates loaded. Did words.txt fail to load?');
      return;
    }

    alert('Inputs valid. Applying filter to candidates...');
    try {
      const before = candidates.length;
      candidates = applyGuessToCandidates(guess, feedback, candidates);
      const after = candidates.length;

      alert(`Filter applied.\nBefore: ${before}\nAfter: ${after}`);
      statusEl.textContent = `Applied ${guess.toUpperCase()} / ${feedback}. Remaining: ${after}`;
      renderCandidates();
    } catch (e) {
      alert('Internal error applying guess. See console for details.');
      console.error(e);
    }
  });

  resetBtn.addEventListener('click', () => {
    alert('Reset button clicked');
    candidates = [...dictionary];
    guessInput.value = '';
    feedbackInput.value = '';
    statusEl.textContent = `Reset. Loaded ${dictionary.length} words.`;
    renderCandidates();
    alert('State reset and candidates re-rendered');
  });

  // ----------------------
  // Filtering logic (G/Y/X)
  // ----------------------
  function countLetters(str) {
    const map = {};
    for (const ch of str) map[ch] = (map[ch] || 0) + 1;
    return map;
  }

  /**
   * Apply a single guess/feedback to filter the candidate list.
   * Feedback: 5 chars using G (green), Y (yellow), X (gray).
   *
   * Wordle duplicate-letter rules handled:
   * - G: candidate[i] must equal guess[i].
   * - Y: candidate must contain letter guess[i], but NOT at position i.
   * - X: If the letter had no G/Y in this guess, total occurrences must be 0.
   *       If the letter had some G/Y elsewhere, X means the candidate's total
   *       count for that letter must NOT exceed the confirmed (G+Y) count.
   */
  function applyGuessToCandidates(guess, feedback, words) {
    alert(`applyGuessToCandidates():\n${guess.toUpperCase()} / ${feedback}`);
    const guessArr = guess.split('');
    const fbArr = feedback.split('');

    const requiredPositions = {};  // pos -> letter (greens)
    const forbiddenPositions = {}; // pos -> Set(letter) forbidden here (yellows)
    const minLetterCounts = {};    // minimum due to total Y+G per letter
    const maxLetterCounts = {};    // maximum due to X constraints

    // Count total Y+G per letter in this guess
    const ygCounts = {};
    for (let i = 0; i < 5; i++) {
      const ch = guessArr[i];
      const fb = fbArr[i];
      if (fb === 'G') {
        requiredPositions[i] = ch;
        ygCounts[ch] = (ygCounts[ch] || 0) + 1;
      } else if (fb === 'Y') {
        forbiddenPositions[i] = (forbiddenPositions[i] || new Set());
        forbiddenPositions[i].add(ch);
        ygCounts[ch] = (ygCounts[ch] || 0) + 1;
      }
    }

    // For letters marked X, cap to Y+G count (if any); else 0
    for (let i = 0; i < 5; i++) {
      const ch = guessArr[i];
      const fb = fbArr[i];
      if (fb === 'X') {
        const allowed = ygCounts[ch] || 0;
        const prev = (maxLetterCounts[ch] ?? allowed);
        maxLetterCounts[ch] = Math.max(prev, allowed); // keep highest cap across positions
      }
    }

    // Set minimum counts from Y/G totals
    for (const [ch, cnt] of Object.entries(ygCounts)) {
      const prev = (minLetterCounts[ch] ?? cnt);
      minLetterCounts[ch] = Math.max(prev, cnt);
    }

    // For debugging: show constraints snapshot
    alert(
      'Constraints built:\n' +
      `Greens (pos=letter): ${JSON.stringify(requiredPositions)}\n` +
      `Min counts: ${JSON.stringify(minLetterCounts)}\n` +
      `Max counts: ${JSON.stringify(maxLetterCounts)}`
    );

    // Filter
    const filtered = words.filter(candidate => {
      // Greens: exact position match
      for (const [posStr, letter] of Object.entries(requiredPositions)) {
        const pos = Number(posStr);
        if (candidate[pos] !== letter) return false;
      }

      // Yellows: must be present but not at the same position
      for (let i = 0; i < 5; i++) {
        if (fbArr[i] === 'Y') {
          const ch = guessArr[i];
          if (candidate[i] === ch) return false;       // wrong place
          if (!candidate.includes(ch)) return false;    // must be present
        }
      }

      // Count constraints
      const candCounts = countLetters(candidate);
      // Minimums (from Y/G)
      for (const [ch, minCnt] of Object.entries(minLetterCounts)) {
        if ((candCounts[ch] || 0) < minCnt) return false;
      }
      // Maximums (from X)
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

    alert(`applyGuessToCandidates(): filtered to ${filtered.length} words`);
    return filtered;
  }

  // Kick off: load dictionary
  loadDictionary();
});
