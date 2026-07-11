/**
 * Smart product search: keyboard layout (EN↔RU) + typo tolerance.
 */

const EN =
  "`qwertyuiop[]asdfghjkl;'zxcvbnm,." +
  '~QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>';
const RU =
  'ёйцукенгшщзхъфывапролджэячсмитьбю' +
  'ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ';

const EN_TO_RU = Object.fromEntries([...EN].map((ch, i) => [ch, RU[i]]));
const RU_TO_EN = Object.fromEntries([...RU].map((ch, i) => [ch, EN[i]]));

export function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Swap QWERTY ↔ ЙЦУКЕН for each character. */
export function swapKeyboardLayout(value) {
  return [...String(value || '')]
    .map((ch) => EN_TO_RU[ch] || RU_TO_EN[ch] || ch)
    .join('');
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function maxTypoDistance(len) {
  if (len <= 2) return 0;
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  return 3;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 3 && Math.max(a.length, b.length) > 8) {
    // quick reject for clearly different lengths on longer strings
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array(cols);
  let curr = new Array(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;

  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j < cols; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function tokenFuzzyMatch(haystack, token) {
  if (!token) return true;
  if (haystack.includes(token)) return true;

  const maxD = maxTypoDistance(token.length);
  if (maxD === 0) return false;

  const words = haystack.split(' ');
  for (const word of words) {
    if (!word) continue;
    if (levenshtein(word, token) <= maxD) return true;

    // Prefix: «павл» → «павлова»
    if (word.length > token.length) {
      if (levenshtein(word.slice(0, token.length), token) <= maxD) return true;
    }

    // Sliding window inside longer words (опечатка в середине)
    const minLen = Math.max(2, token.length - maxD);
    const maxLen = token.length + maxD;
    for (let len = minLen; len <= maxLen; len++) {
      if (word.length < len) continue;
      for (let i = 0; i <= word.length - len; i++) {
        if (levenshtein(word.slice(i, i + len), token) <= maxD) return true;
      }
    }
  }

  return false;
}

function queryMatchesHaystack(haystack, query) {
  if (!query) return true;
  if (haystack.includes(query)) return true;

  const tokens = query.split(' ').filter(Boolean);
  if (!tokens.length) return true;

  // All tokens must match (order-independent)
  return tokens.every((token) => tokenFuzzyMatch(haystack, token));
}

/**
 * Returns true if `text` matches `query` with layout fix and typo tolerance.
 */
export function smartMatch(text, query) {
  const raw = String(query || '').trim();
  if (!raw) return true;

  const haystack = normalizeSearchText(text);
  if (!haystack) return false;

  const variants = unique([
    normalizeSearchText(raw),
    normalizeSearchText(swapKeyboardLayout(raw)),
  ]);

  return variants.some((q) => queryMatchesHaystack(haystack, q));
}

/** Match against several text fields. */
export function smartMatchAny(texts, query) {
  const raw = String(query || '').trim();
  if (!raw) return true;
  return texts.some((t) => smartMatch(t, raw));
}
