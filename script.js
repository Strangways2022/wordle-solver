document.getElementById('submit-btn').addEventListener('click', () => {
    const guess = document.getElementById('guess').value.trim().toLowerCase();
    const feedback = document.getElementById('feedback').value.trim().toUpperCase();

    if (guess.length !== 5 || feedback.length !== 5) {
        alert('Please enter a 5-letter guess and feedback.');
        return;
    }

    const possibleWords = filterWords(guess, feedback);
    displayWords(possibleWords);
});

function displayWords(words) {
    const list = document.getElementById('possible-words');
    list.innerHTML = '';
    words.forEach(word => {
        const li = document.createElement('li');
        li.textContent = word;
        list.appendChild(li);
    });
}
