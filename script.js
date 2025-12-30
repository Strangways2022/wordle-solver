// UI & workflow
let candidates = [];            // Current filtered candidates
let dictionary = [];            // Full dictionary (5-letter words)

const guessInput = document.getElementById('guess');
const feedbackInput = document.getElementById('feedback');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');
const listEl = document.getElementById('possible-words');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');

async function loadDictionary() {
  try {
    statusEl.textContent = 'Loading word list...';
    const res = await fetch('words.txt', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load words.txt (${res.status})`);
    const text = await res.text();

    // Normalize & keep only clean 5-letter words [a-z]
    dictionary = text
      .split(/\r?\n/)
      .map(w => w.trim().toLowerCase())
      .filter(w => /^[a-z]{5}$/.test(w));
    candidates = [...dictionary];
    statusEl.textContent = `Loaded ${dictionary.length} words.`;
    renderCandidates();
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}. Make sure words.txt exists in the repo root.`;
  }
}

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

function validateInputs(guess, feedback) {
  if (!/^[a-z]{5}$/.test(guess)) return 'Guess must be 5 letters (a–z).';
  if (!/^[GYXgyx]{5}$/.test(feedback)) return 'Feedback must be 5 characters using G/Y/X.';
  return null;
}

submitBtn.addEventListener('click', () => {
  const guess = guessInput.value.trim().toLowerCase();
  const feedback = feedbackInput.value.trim().toUpperCase();

  const err = validateInputs(guess, feedback);
  if (err) {
    alert(err);
    return;
  }
  if (candidates.length === 0) {
    alert('No candidates loaded. Did words.txt fail to load?');
    return;
  }

  // Apply constraints to current candidate set
  candidates = applyGuessToCandidates(guess, feedback, candidates);
  renderCandidates();

    // Quick status update
  statusEl.textContent = `Applied ${guess.toUpperCase()} / ${feedback}. Remaining: ${candidates.length}`;
});

resetBtn.addEventListener('click', () => {
  candidates = [...dictionary];
  guessInput.value = '';
  feedbackInput.value = '';
  statusEl.textContent = `Reset. Loaded ${dictionary.length} words.`;
  renderCandidates();
});

// Load dictionary on page start
loadDictionary();

function countLetters(str) {
  const map = {};
  for (const ch of str) map[ch] = (map[ch] || 0) + 1;
  return map;
}

/**
 * Apply a single guess/feedback to filter the candidate list.
 * Feedback: 5 chars using G (green), Y (yellow), X (gray).
 * Wordle duplicate-letter rules are handled:
 * - G: candidate[i] must equal guess[i].
 * - Y: candidate must contain letter guess[i], but NOT at position i.
 * - X: if the letter was never G/Y in the guess, total occurrence of that letter must be 0.
 *       If the letter had some G/Y elsewhere, X means the candidate must NOT exceed the total
 *       number of times the letter was confirmed by G/Y.
 */
function applyGuessToCandidates(guess, feedback, words) {
  const guessArr = guess.split('');
  const fbArr = feedback.split('');

  // First pass: compute per-letter requirements from feedback
  const requiredPositions = {}; // pos -> letter (greens)
  const forbiddenPositions = {}; // pos -> Set of letters forbidden here (yellows)
  const minLetterCounts = {}; // minimum occurrences due to Y+G
  const maxLetterCounts = {}; // maximum occurrences due to X constraints

  // Count Y/G occurrences per letter in this guess
  const ygCounts = {};
  for (let i = 0; i < 5; i++) {
    const ch = guessArr[i];
    const fb = fbArr[i];
    if (fb === 'G') {
      requiredPositions[i] = ch;
      ygCounts[ch] = (ygCounts[ch] || 0) + 1;
    } else if (fb === 'Y') {
      // Yellow: letter must exist but not at this position
      forbiddenPositions[i] = (forbiddenPositions[i] || new Set());
      forbiddenPositions[i].add(ch);
      ygCounts[ch] = (ygCounts[ch] || 0) + 1;
    }
  }

  // For letters marked X, set max count to the Y+G count (if any), else 0
  for (let i = 0; i < 5; i++) {
    const ch = guessArr[i];
    const fb = fbArr[i];
    if (fb === 'X') {
      const allowed = ygCounts[ch] || 0;
      // If letter had no G/Y, it must be absent completely
      maxLetterCounts[ch] = Math.max(maxLetterCounts[ch] ?? allowed, allowed);
    }
  }

  // For letters with Y/G, set minimum counts
  for (const [ch, cnt] of Object.entries(ygCounts)) {
    minLetterCounts[ch] = Math.max(minLetterCounts[ch] ?? cnt, cnt);
  }

  // Now evaluate each candidate
  return words.filter(candidate => {
    // Quick format check
    if (!/^[a-z]{5}$/.test(candidate)) return false;

    // 1) Enforce greens (exact match at positions)
    for (const [posStr, letter] of Object.entries(requiredPositions)) {
      const pos = Number(posStr);
      if (candidate[pos] !== letter) return false;
    }

    // 2) Enforce yellows: letter present somewhere but NOT at that position
    for (let i = 0; i < 5; i++) {
      if (fbArr[i] === 'Y') {
        const ch = guessArr[i];
        if (candidate[i] === ch) return false; // not allowed in same position
        if (!candidate.includes(ch)) return false; // must be present elsewhere
      }
    }

    // 3) Enforce gray with duplicate nuance via min/max counts
    const candCounts = countLetters(candidate);

    // Minimum counts from Y/G
    for (const [ch, minCnt] of Object.entries(minLetterCounts)) {
      if ((candCounts[ch] || 0) < minCnt) return false;
    }

    // Maximum counts from X
    for (const [ch, maxCnt] of Object.entries(maxLetterCounts)) {
      if ((candCounts[ch] || 0) > maxCnt) return false;
    }

    // 4) Additionally forbid yellow letters at their specific positions
    for (let i = 0; i < 5; i++) {
      const set = forbiddenPositions[i];
      if (set && set.has(candidate[i])) return false;
    }

    return true;
  });
}
 
