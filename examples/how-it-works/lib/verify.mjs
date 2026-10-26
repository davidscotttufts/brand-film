// The speech-to-text check on a voiced take.
//
// A take passes when the transcript matches what the take was meant to say
// closely enough (word error rate at or under the threshold) AND every
// lexicon term the take uses was heard. The comparison forgives what a
// transcriber legitimately writes differently: case, punctuation, digits for
// spoken numbers ("17" for "seventeen") and a term written either way
// ("nginx" or "engine x").

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** An integer under a million, in words ("1204" → "one thousand two hundred four"). */
export function numberWords(n) {
  if (!Number.isInteger(n) || n < 0 || n >= 1e6) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberWords(n % 100) : '');
  return numberWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numberWords(n % 1000) : '');
}

const NUM = '\u0001num';

/**
 * Words for comparison: lower case, no punctuation, hyphens split. In English,
 * digits become words ("17" → "seventeen"). In other languages a run of digits
 * becomes a token that matches any one word, since the script spells numbers
 * out and the transcriber may write them as digits.
 */
export function normalize(text, lang = 'en') {
  const en = lang === 'en';
  return text
    .toLowerCase()
    .replace(/(\d)[,.](\d{3})/g, '$1$2')
    .replace(/\d+/g, (d) => ' ' + (en ? numberWords(Number(d)) : NUM) + ' ')
    .replace(/[%]/g, en ? ' percent ' : ' ')
    .replace(/&/g, en ? ' and ' : ' ')
    .replace(/[-–—/]/g, ' ')
    .replace(/[^\p{L}\p{N}'\u0001 ]/gu, ' ')
    .replace(/'/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/** Word error rate of `hyp` against `ref` (both word arrays). */
export function wer(ref, hyp) {
  if (!ref.length) return hyp.length ? 1 : 0;
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j++) {
      const same = ref[i - 1] === hyp[j - 1] || hyp[j - 1] === NUM || ref[i - 1] === NUM;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (same ? 0 : 1));
    }
    prev = cur;
  }
  return prev[hyp.length] / ref.length;
}

const joined = (words) => ' ' + words.join(' ') + ' ';

/**
 * Replace every occurrence of a term, in any of its forms, with one token, so
 * "Brandfilm", "brand film" and "Brand Film" all count as the same single
 * word. Without this a transcriber's legitimate spelling of a term reads as
 * a word error.
 */
function canonical(words, terms, lang) {
  const forms = [];
  terms.forEach((t, i) => {
    for (const f of [normalize(t.written, lang), normalize(t.spoken, lang)]) {
      if (f.length) forms.push({ words: f, squashed: f.join(''), id: `\u0000term${i}` });
    }
  });
  forms.sort((a, b) => b.words.length - a.words.length);
  const out = [];
  for (let i = 0; i < words.length;) {
    const hit = forms.find((f) => f.words.every((w, j) => words[i + j] === w))
      ?? forms.find((f) => words[i] === f.squashed);
    if (hit) { out.push(hit.id); i += words[i] === hit.squashed && hit.words.length > 1 ? 1 : hit.words.length; continue; }
    out.push(words[i]); i++;
  }
  return out;
}

/**
 * Check a transcript against a take.
 *   spoken:   what was sent to the voice
 *   written:  the take as written (lexicon terms in their written form)
 *   terms:    lexicon rules the take uses ({ written, spoken })
 */
export function checkTranscript({ transcript, spoken, written = spoken, terms = [], maxWer = 0.15, lang = 'en' }) {
  const hyp = canonical(normalize(transcript, lang), terms, lang);
  // Score against whichever form of the take the transcriber's spelling is closer to.
  const rate = Math.min(wer(canonical(normalize(spoken, lang), terms, lang), hyp), wer(canonical(normalize(written, lang), terms, lang), hyp));
  const heard = joined(hyp);
  const missingTerms = terms.filter((_, i) => !heard.includes(` \u0000term${i} `)).map((t) => t.written);
  return { wer: +rate.toFixed(3), missingTerms, pass: rate <= maxWer && missingTerms.length === 0 };
}
