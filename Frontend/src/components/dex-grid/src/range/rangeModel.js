// Pure cell-range geometry. A range is { r1, r2, c1, c2 } in displayed row
// indexes and displayed column positions, inclusive, in any order.

export function normalize({ r1, r2, c1, c2 }) {
  return { top: Math.min(r1, r2), bottom: Math.max(r1, r2), left: Math.min(c1, c2), right: Math.max(c1, c2) };
}

export function contains(range, row, col) {
  const n = normalize(range);
  return row >= n.top && row <= n.bottom && col >= n.left && col <= n.right;
}

/**
 * Edge flags of a cell against all ranges, for drawing borders.
 * @returns {null | { top: boolean, bottom: boolean, left: boolean, right: boolean, count: number }}
 */
export function cellState(ranges, row, col) {
  let count = 0;
  const edges = { top: false, bottom: false, left: false, right: false };
  for (const range of ranges) {
    if (!contains(range, row, col)) continue;
    count++;
    const n = normalize(range);
    if (row === n.top) edges.top = true;
    if (row === n.bottom) edges.bottom = true;
    if (col === n.left) edges.left = true;
    if (col === n.right) edges.right = true;
  }
  return count ? { ...edges, count } : null;
}

/** Moves the active end of the last range by (dr, dc), clamped to the grid. */
export function extend(range, dr, dc, maxRow, maxCol) {
  return { ...range, r2: clamp(range.r2 + dr, 0, maxRow), c2: clamp(range.c2 + dc, 0, maxCol) };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Number of distinct cells covered by the ranges. */
export function cellCount(ranges) {
  const seen = new Set();
  for (const range of ranges) {
    const n = normalize(range);
    for (let r = n.top; r <= n.bottom; r++) for (let c = n.left; c <= n.right; c++) seen.add(`${r}:${c}`);
  }
  return seen.size;
}
