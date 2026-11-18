// Builds the classic-script bundles:
//   dist/dex-grid.js          window.dexGrid = { createDexGrid, ... }
//   dist/ag-grid-compat.js    self-contained: window.dexGrid too, and makes
//                             agGrid.createGrid create dex grids (load it alone)
//   dist/dex-grid.css         copy of src/styles.css
import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
const common = { bundle: true, format: "iife", target: "es2020", legalComments: "inline", logLevel: "info" };
await build({ ...common, entryPoints: ["src/index.js"], globalName: "dexGrid", outfile: "dist/dex-grid.js" });
await build({
  ...common,
  stdin: {
    contents: 'import * as dexGrid from "./src/index.js"; import { installAgGridCompat } from "./src/compat.js"; globalThis.dexGrid = dexGrid; installAgGridCompat();',
    resolveDir: ".",
    sourcefile: "ag-grid-compat-entry.js",
  },
  outfile: "dist/ag-grid-compat.js",
});
await copyFile("src/styles.css", "dist/dex-grid.css");
