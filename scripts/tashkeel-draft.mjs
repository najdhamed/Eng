/**
 * Drafts vowel marks for words that are missing from src/voice/lexicon.ar.ts.
 *
 *   npm run voice:tashkeel -- السكر "عيادة السكر"
 *
 * It prints one lexicon line per word, ready to paste. The marks come from a
 * published model (libtashkeel, MIT / Apache-2.0) that was trained on formal
 * Arabic, so it misreads Saudi forms: «لف» comes out as «لَفَّ» (should be
 * «لِفّ»), «أنت» as feminine, «الدرج» as a drawer. It also puts case endings on
 * words (الطريقُ) which the lexicon leaves off. Read every answer and correct it
 * before saving it; the unit tests then check that only vowels were added.
 */
import { do_tashkeel } from 'libtashkeel-wasm/libtashkeel_wasm.js';

const words = process.argv
  .slice(2)
  .flatMap((arg) => arg.split(/\s+/))
  .filter(Boolean);
if (words.length === 0) {
  console.error(
    'Give the missing words, as the failing test lists them:\n  npm run voice:tashkeel -- السكر',
  );
  process.exit(2);
}

const MARKS = /[ً-ٰٟ]/g;
for (const word of new Set(words)) {
  const key = word.replace(MARKS, '');
  console.log(`  ${key}: '${do_tashkeel(word)}',`);
}
