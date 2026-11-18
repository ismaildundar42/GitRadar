// Drop-in mode for pages that call agGrid.createGrid directly (classic scripts).
// Load the self-contained bundle after ag-grid-community:
//   <script src="ag-grid-community.js"></script>
//   <script src="ag-grid-compat.js"></script>
// Every agGrid.createGrid(el, options) then creates a dex grid. The original
// Community namespace stays available as agGrid.community.

import { createDexGrid } from "./index.js";

export function installAgGridCompat(target = globalThis) {
  const original = target.agGrid;
  if (!original?.createGrid) throw new Error("dex-grid compat: load ag-grid-community before ag-grid-compat.js");
  if (original.__dexCompat) return original;
  const community = { ...original };
  const patched = {
    ...community,
    community,
    __dexCompat: true,
    createGrid: (container, options, params) => createDexGrid(container, options, { agGrid: community, ...(params?.dexEnv ?? {}) }),
  };
  target.agGrid = patched;
  return patched;
}
