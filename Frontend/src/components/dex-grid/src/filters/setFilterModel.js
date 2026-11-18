// Pure set-filter logic: keys, labels, ordering, mini-filter matching and the
// pass test. A key is a string, or null for blanks (null, undefined, "" or
// whitespace-only). Arrays contribute one key per element; an empty array is blank.

/** Case folding that works for Turkish (İ/ı) and other text alike. */
export function foldVariants(text) {
  const s = String(text);
  return [s.toLocaleLowerCase("tr-TR"), s.toLowerCase()];
}

export function isBlank(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

/** Default key: String(value), or null for blanks. */
export function defaultKey(value) {
  if (isBlank(value)) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return String(value);
}

/**
 * Collects unique keys from raw cell values.
 * @param {Iterable<unknown>} values
 * @param {{ keyCreator?: (v: unknown) => string | null, caseSensitive?: boolean }} [options]
 * @returns {Map<string | null, unknown>} key -> first raw value seen for it
 */
export function collectKeys(values, options = {}) {
  const keyOf = options.keyCreator ? (v) => (isBlank(v) ? null : normalizeKey(options.keyCreator(v))) : defaultKey;
  const out = new Map();
  const seenFolded = new Set();
  const add = (raw) => {
    const key = keyOf(raw);
    if (key === null) {
      if (!out.has(null)) out.set(null, null);
      return;
    }
    if (options.caseSensitive) {
      if (!out.has(key)) out.set(key, raw);
      return;
    }
    const folded = foldVariants(key)[0];
    if (seenFolded.has(folded)) return;
    seenFolded.add(folded);
    out.set(key, raw);
  };
  for (const value of values) {
    if (Array.isArray(value)) {
      if (value.length === 0) add(null);
      for (const item of value) add(item);
    } else {
      add(value);
    }
  }
  return out;
}

function normalizeKey(key) {
  return isBlank(key) ? null : String(key);
}

const collator = new Intl.Collator("tr-TR", { numeric: true, sensitivity: "base" });

/** Blanks first, then numbers numerically, then text in Turkish collation order. */
export function compareKeys(a, b) {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  const na = Number(a);
  const nb = Number(b);
  const aNum = a.trim() !== "" && Number.isFinite(na);
  const bNum = b.trim() !== "" && Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return collator.compare(a, b);
}

/**
 * @param {Array<string | null>} keys
 * @param {{ comparator?: (a: unknown, b: unknown) => number, rawOf?: (k: string | null) => unknown, suppressSorting?: boolean }} [options]
 */
export function sortKeys(keys, options = {}) {
  if (options.suppressSorting) return [...keys];
  if (options.comparator) {
    const rawOf = options.rawOf ?? ((k) => k);
    return [...keys].sort((a, b) => {
      if (a === null) return b === null ? 0 : -1;
      if (b === null) return 1;
      return options.comparator(rawOf(a), rawOf(b));
    });
  }
  return [...keys].sort(compareKeys);
}

/** True when the label contains the typed text, ignoring case (Turkish-aware). */
export function matchesMiniFilter(label, text) {
  if (!text) return true;
  const labels = foldVariants(label ?? "");
  const needles = foldVariants(text);
  return labels.some((l) => needles.some((n) => l.includes(n)));
}

/**
 * Builds the pass test for a model's selected keys.
 * @param {Array<string | null>} selected
 * @param {{ caseSensitive?: boolean, keyCreator?: (v: unknown) => string | null }} [options]
 * @returns {(value: unknown) => boolean}
 */
export function createMatcher(selected, options = {}) {
  const keyOf = options.keyCreator ? (v) => (isBlank(v) ? null : normalizeKey(options.keyCreator(v))) : defaultKey;
  const fold = (k) => (k === null ? null : options.caseSensitive ? k : foldVariants(k)[0]);
  const wanted = new Set(selected.map((k) => fold(normalizeKey(k))));
  const has = (raw) => wanted.has(fold(keyOf(raw)));
  return (value) => {
    if (Array.isArray(value)) {
      if (value.length === 0) return wanted.has(null);
      return value.some(has);
    }
    return has(value);
  };
}
