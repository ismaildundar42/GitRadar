// Registers the dex components behind the AG Grid Enterprise names used in
// column definitions (agSetColumnFilter, agRichSelectCellEditor). The name
// rewriting itself happens in core/colDefs.js for initial and later columnDefs.

import { DexSetFilter } from "../filters/setFilter.js";
import { DexRichSelectEditor } from "../editors/richSelect.js";

export const aliasesFeature = {
  name: "aliases",
  prepare(options) {
    return { ...options, components: { dexSetFilter: DexSetFilter, dexRichSelectEditor: DexRichSelectEditor, ...options.components } };
  },
};
