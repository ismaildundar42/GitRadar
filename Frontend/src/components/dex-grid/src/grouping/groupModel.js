// Pure row-grouping logic: tree building, aggregation and flattening.
//
// Group ids follow "dex-group-<colId>-<key>" ("row-group-" is reserved by AG Grid) with child levels appended as
// "-<colId>-<key>". null, undefined and "" (or whitespace-only) keys share the
// "" group. Groups keep their first-appearance order unless the caller orders
// leaves first (the flatten step orders groups by their first visible leaf).

/**
 * @param {object[]} leaves leaf row data objects
 * @param {Array<{ colId: string, keyOf: (data: object) => unknown }>} groupCols
 * @returns {{ root: object, groupsById: Map<string, object> }}
 */
export function buildTree(leaves, groupCols) {
  const root = { id: null, level: -1, children: [], leafs: [], childMap: new Map() };
  const groupsById = new Map();
  for (const data of leaves) {
    let parent = root;
    parent.leafs.push(data);
    for (let level = 0; level < groupCols.length; level++) {
      const { colId, keyOf } = groupCols[level];
      const key = groupKey(keyOf(data));
      let group = parent.childMap.get(key);
      if (!group) {
        const id = (parent.id ?? "dex-group") + `-${colId}-${key}`;
        group = { id, key, colId, level, parent, children: [], leafs: [], childMap: new Map(), leafLevel: level === groupCols.length - 1 };
        parent.childMap.set(key, group);
        parent.children.push(group);
        groupsById.set(id, group);
      }
      group.leafs.push(data);
      parent = group;
    }
    parent.children.push(data);
  }
  return { root, groupsById };
}

export function groupKey(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  const s = String(value);
  return s.trim() === "" ? "" : s;
}

// ----- aggregation ----------------------------------------------------------

const avgProto = { toString() { return this.value == null ? "" : String(this.value); }, toNumber() { return this.value; } };
const countProto = { toString() { return String(this.value); }, toNumber() { return this.value; } };

export const AGG_FUNCS = {
  sum(values) {
    let result = null;
    for (const v of values) {
      if (typeof v === "number" && Number.isFinite(v)) result = result === null ? v : typeof result === "bigint" ? result + BigInt(v) : result + v;
      else if (typeof v === "bigint") result = result === null ? v : (typeof result === "bigint" ? result : BigInt(result)) + v;
    }
    return result;
  },
  min(values) {
    let result = null;
    for (const v of values) if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "bigint") if (result === null || v < result) result = v;
    return result;
  },
  max(values) {
    let result = null;
    for (const v of values) if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "bigint") if (result === null || v > result) result = v;
    return result;
  },
  count(values) {
    let n = 0;
    for (const v of values) n += v !== null && typeof v === "object" && countProto.isPrototypeOf(v) ? v.value : 1;
    return Object.assign(Object.create(countProto), { value: n });
  },
  avg(values) {
    let sum = 0;
    let count = 0;
    for (const v of values) {
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        count++;
      } else if (v !== null && typeof v === "object" && avgProto.isPrototypeOf(v) && v.count > 0) {
        sum += v.value * v.count;
        count += v.count;
      }
    }
    return Object.assign(Object.create(avgProto), { value: count ? sum / count : null, count });
  },
  first(values) {
    return values.length ? values[0] : null;
  },
  last(values) {
    return values.length ? values[values.length - 1] : null;
  },
};

/**
 * Aggregates every group bottom-up over the leaves that pass.
 * Child groups contribute their own result (so avg stays weighted and count sums).
 * @param {object} root from buildTree
 * @param {Array<{ colId: string, aggFunc: string | Function, valueOf: (data: object) => unknown }>} valueCols
 * @param {(data: object) => boolean} passes
 * @param {Record<string, Function>} [customFuncs]
 */
export function aggregate(root, valueCols, passes, customFuncs = {}) {
  const visit = (group) => {
    const agg = {};
    const childResults = [];
    let visibleLeaves = 0;
    for (const child of group.children) {
      if (isGroup(child)) {
        visit(child);
        if (child.visibleLeaves > 0) {
          childResults.push(child);
          visibleLeaves += child.visibleLeaves;
        }
      } else if (passes(child)) {
        childResults.push(child);
        visibleLeaves++;
      }
    }
    for (const vc of valueCols) {
      const fn = typeof vc.aggFunc === "function" ? vc.aggFunc : customFuncs[vc.aggFunc] ?? AGG_FUNCS[vc.aggFunc];
      if (!fn) continue;
      const values = childResults.map((c) => (isGroup(c) ? c.agg[vc.colId] : vc.valueOf(c)));
      agg[vc.colId] = fn.length > 1 || customFuncs[vc.aggFunc] || typeof vc.aggFunc === "function" ? fn({ values, colId: vc.colId }) : fn(values);
    }
    group.agg = agg;
    group.visibleLeaves = visibleLeaves;
  };
  visit(root);
}

export function isGroup(item) {
  return !!item && typeof item === "object" && item.childMap instanceof Map && "level" in item;
}

// ----- flattening -----------------------------------------------------------

/**
 * Display order: depth-first, groups ordered by the position of their first
 * passing leaf in `leafOrder`, leaves in `leafOrder` order. Groups without
 * passing leaves are dropped; children of collapsed groups are skipped.
 * @param {object} root
 * @param {{ passes: (data) => boolean, leafOrder: Map<object, number>, expanded: (group) => boolean }} options
 * @returns {Array<{ type: "group", group: object } | { type: "leaf", data: object, level: number }>}
 */
export function flatten(root, { passes, leafOrder, expanded, compareGroups, groupsOnly = false }) {
  const rank = (item) => {
    if (!isGroup(item)) return leafOrder.get(item) ?? Number.MAX_SAFE_INTEGER;
    let best = Number.MAX_SAFE_INTEGER;
    for (const leaf of item.leafs) if (passes(leaf)) best = Math.min(best, leafOrder.get(leaf) ?? Number.MAX_SAFE_INTEGER);
    return best;
  };
  const out = [];
  const visit = (group, level) => {
    const items = group.children
      .filter((c) => (isGroup(c) ? c.leafs.some(passes) : passes(c) && !groupsOnly))
      .map((c) => ({ c, r: rank(c) }))
      .sort((a, b) => {
        if (compareGroups && isGroup(a.c) && isGroup(b.c)) {
          const d = compareGroups(a.c, b.c);
          if (d !== 0) return d;
        }
        return a.r - b.r;
      })
      .map((x) => x.c);
    for (const item of items) {
      if (isGroup(item)) {
        out.push({ type: "group", group: item });
        if (expanded(item)) visit(item, level + 1);
      } else {
        out.push({ type: "leaf", data: item, level });
      }
    }
  };
  visit(root, 0);
  return out;
}

// ----- pivot ------------------------------------------------------------------

/**
 * Unique pivot key paths in first-appearance order, sorted per level.
 * @param {object[]} leaves
 * @param {Array<(data: object) => unknown>} keyOfs one per pivot column
 * @param {(a: string, b: string) => number} [compare]
 * @returns {string[][]} key paths, e.g. [["2024","Q1"], ["2024","Q2"]]
 */
export function pivotKeyPaths(leaves, keyOfs, compare) {
  if (!keyOfs.length) return [];
  const tree = new Map();
  for (const d of leaves) {
    let level = tree;
    for (const keyOf of keyOfs) {
      const k = groupKey(keyOf(d));
      if (!level.has(k)) level.set(k, new Map());
      level = level.get(k);
    }
  }
  const out = [];
  const walk = (level, prefix) => {
    const keys = [...level.keys()];
    if (compare) keys.sort(compare);
    for (const k of keys) {
      const next = level.get(k);
      if (next.size === 0) out.push([...prefix, k]);
      else walk(next, [...prefix, k]);
    }
  };
  walk(tree, []);
  return out;
}

export const PIVOT_KEY_SEP = "\u0001";

/**
 * Per group (and the root), aggregates for each pivot key path and value column
 * over passing leaves: group.pivot[path.join(SEP)][colId].
 */
export function aggregatePivot(root, keyOfs, valueCols, passes, customFuncs = {}) {
  const fnOf = (vc) => (typeof vc.aggFunc === "function" ? vc.aggFunc : customFuncs[vc.aggFunc] ?? AGG_FUNCS[vc.aggFunc]);
  const call = (vc, values) => {
    const fn = fnOf(vc);
    if (!fn) return null;
    return typeof vc.aggFunc === "function" || customFuncs[vc.aggFunc] ? fn({ values, colId: vc.colId }) : fn(values);
  };
  const visit = (group) => {
    const buckets = new Map();
    for (const leaf of group.leafs) {
      if (!passes(leaf)) continue;
      const path = keyOfs.map((k) => groupKey(k(leaf))).join(PIVOT_KEY_SEP);
      if (!buckets.has(path)) buckets.set(path, []);
      buckets.get(path).push(leaf);
    }
    const pivot = {};
    for (const [path, leaves] of buckets) {
      pivot[path] = {};
      for (const vc of valueCols) pivot[path][vc.colId] = call(vc, leaves.map(vc.valueOf));
    }
    group.pivot = pivot;
    for (const c of group.children) if (isGroup(c)) visit(c);
  };
  visit(root);
}

/** All groups in depth-first order (for expand/collapse all and exports). */
export function allGroups(root) {
  const out = [];
  const visit = (g) => {
    for (const c of g.children) if (isGroup(c)) {
      out.push(c);
      visit(c);
    }
  };
  visit(root);
  return out;
}
