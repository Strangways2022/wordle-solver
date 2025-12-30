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
 
