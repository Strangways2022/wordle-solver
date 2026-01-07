# wordle-solver
A Wordle or Absurdle game solver.

The word list is used to validate words and possible future guesses.  A second word list could be used for possible words, but the list would have to be accurate if Wordle change their word list.  

The word list has over 12,000 English words however, there may be words which are recognised by Wordle or Absurdle which are not in the word list.  If a word is not in the word list, the guessed word is treated as invalid.

Possible future adjustments to the code:
a. only show the Wordle board as guesses are made for better screen fitting.
b. allow an option for light/dark modes.

Improvements
1. Update the word list to match both Wordle and Absurdle to ensure all words are valid.
2. Create a separate word list to validate for Wordle words to reduce the number of future possible words.
