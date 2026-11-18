// Set filter component for AG Grid Community (custom filter interface).
// Model: null (inactive) or { filterType: "set", values: Array<string | null> }.
// filterParams: values (array | ({ success }) => void), valueFormatter, keyCreator,
// comparator, caseSensitive, suppressSorting, suppressMiniFilter, suppressSelectAll.

import { collectKeys, sortKeys, matchesMiniFilter, createMatcher } from "./setFilterModel.js";
import { userFilterValueGetters } from "../core/api.js";

const ROW_HEIGHT = 24;
const LIST_HEIGHT = 240;

export class DexSetFilter {
  init(params) {
    this.params = params;
    this.model = null;
    this.matcher = null;
    this.miniText = "";
    this.providedValues = null;
    this.gui = document.createElement("div");
    this.gui.className = "dex-set-filter";
    this.gui.innerHTML = `
      <div class="dex-set-filter-search"><input type="text" class="dex-set-filter-mini" aria-label="search"></div>
      <label class="dex-set-filter-item dex-set-filter-all"><input type="checkbox"><span></span></label>
      <div class="dex-set-filter-list" role="listbox"><div class="dex-set-filter-spacer"></div></div>`;
    this.eMini = this.gui.querySelector(".dex-set-filter-mini");
    this.eMini.placeholder = this.text("searchOoo", "Search...");
    this.eAll = this.gui.querySelector(".dex-set-filter-all input");
    this.gui.querySelector(".dex-set-filter-all span").textContent = this.text("selectAll", "(Select All)");
    this.eList = this.gui.querySelector(".dex-set-filter-list");
    this.eSpacer = this.gui.querySelector(".dex-set-filter-spacer");
    this.eList.style.height = `${LIST_HEIGHT}px`;
    if (params.suppressMiniFilter) this.gui.querySelector(".dex-set-filter-search").style.display = "none";
    if (params.suppressSelectAll) this.gui.querySelector(".dex-set-filter-all").style.display = "none";
    this.eMini.addEventListener("input", () => {
      this.miniText = this.eMini.value;
      this.refreshDisplayed();
    });
    this.eAll.addEventListener("change", () => this.toggleAllDisplayed(this.eAll.checked));
    this.eList.addEventListener("scroll", () => this.renderWindow());
    this.eList.addEventListener("change", (e) => {
      const input = e.target.closest("input[data-index]");
      if (input) this.toggleKey(this.displayed[Number(input.dataset.index)], input.checked);
    });
    this.loadValues();
  }

  text(key, fallback) {
    return this.params.api?.getGridOption?.("localeText")?.[key] ?? fallback;
  }

  // ----- values -------------------------------------------------------------

  loadValues() {
    const provided = this.params.values;
    if (Array.isArray(provided)) {
      this.providedValues = provided;
    } else if (typeof provided === "function") {
      provided({ ...this.params, success: (values) => { this.providedValues = values ?? []; this.recomputeKeys(); } });
    }
    this.recomputeKeys();
  }

  /**
   * Raw cell value. For inferred "object" columns AG Grid injects a stringifying
   * filterValueGetter (arrays become "x,y"), so params.getValue is used only for
   * a filterValueGetter the application wrote.
   */
  valueOf(node) {
    const getter = this.params.colDef.filterValueGetter;
    if (typeof getter === "string" || userFilterValueGetters.has(getter)) return this.params.getValue(node);
    return this.params.api.getCellValue({ rowNode: node, colKey: this.params.column });
  }

  rowValues(predicate) {
    const out = [];
    this.params.api.forEachNode((node) => {
      if (!node.data || node.group || node.data.__dexGroup) return;
      if (predicate && !predicate(node)) return;
      out.push(this.valueOf(node));
    });
    return out;
  }

  recomputeKeys() {
    const opts = { keyCreator: this.params.keyCreator && ((value) => this.params.keyCreator({ value, colDef: this.params.colDef, column: this.params.column, api: this.params.api })), caseSensitive: !!this.params.caseSensitive };
    this.allKeys = collectKeys(this.providedValues ?? this.rowValues(), opts);
    const available = this.providedValues
      ? this.allKeys
      : collectKeys(this.rowValues((node) => this.params.doesRowPassOtherFilter?.(node) ?? true), opts);
    this.availableKeys = sortKeys([...available.keys()], { comparator: this.params.comparator, rawOf: (k) => this.allKeys.get(k), suppressSorting: this.params.suppressSorting });
    this.refreshDisplayed();
  }

  label(key) {
    if (key === null) return this.text("blanks", "(Blanks)");
    const formatter = this.params.valueFormatter ?? this.params.colDef.valueFormatter;
    if (typeof formatter === "function") {
      const value = this.allKeys?.get(key) ?? key;
      try {
        const out = formatter({ value, data: null, node: null, colDef: this.params.colDef, column: this.params.column, api: this.params.api, context: this.params.context });
        if (out !== undefined && out !== null) return String(out);
      } catch {
        // formatter expected row data; fall back to the key
      }
    }
    return key;
  }

  // ----- selection ----------------------------------------------------------

  isSelected(key) {
    return this.model === null ? true : this.matcher(key);
  }

  selectedKeys() {
    return this.availableKeys.filter((k) => this.isSelected(k));
  }

  toggleKey(key, on) {
    const current = new Set(this.model === null ? [...this.allKeys.keys()] : this.model.values);
    if (on) {
      current.add(key);
    } else {
      current.delete(key);
    }
    this.applySelection([...current]);
  }

  toggleAllDisplayed(on) {
    const current = new Set(this.model === null ? [...this.allKeys.keys()] : this.model.values);
    for (const key of this.displayed) {
      if (on) {
        current.add(key);
      } else {
        current.delete(key);
      }
    }
    this.applySelection([...current]);
  }

  applySelection(values) {
    const everything = [...this.allKeys.keys()];
    const all = everything.length > 0 && everything.every((k) => values.includes(k)) && values.length === everything.length;
    this.setModelInternal(all ? null : { filterType: "set", values });
    this.params.filterChangedCallback();
  }

  setModelInternal(model) {
    this.model = model ? { filterType: "set", values: [...model.values] } : null;
    this.matcher = this.model ? createMatcher(this.model.values, { caseSensitive: !!this.params.caseSensitive }) : null;
    this.refreshDisplayed();
  }

  // ----- AG Grid filter interface -------------------------------------------

  getGui() {
    return this.gui;
  }

  isFilterActive() {
    return this.model !== null;
  }

  doesFilterPass(params) {
    if (!this.model) return true;
    const value = this.valueOf(params.node);
    const keyCreator = this.params.keyCreator;
    if (keyCreator) {
      const key = keyCreator({ value, colDef: this.params.colDef, column: this.params.column, api: this.params.api });
      return this.matcher(key);
    }
    return this.matcher(value);
  }

  getModel() {
    return this.model ? { filterType: "set", values: [...this.model.values] } : null;
  }

  setModel(model) {
    this.setModelInternal(model && Array.isArray(model.values) ? model : null);
  }

  getModelAsString(model) {
    const m = model ?? this.model;
    if (!m) return "";
    return `(${m.values.length}) ${m.values.slice(0, 10).map((k) => this.label(k)).join(", ")}`;
  }

  onNewRowsLoaded() {
    this.recomputeKeys();
  }

  onAnyFilterChanged() {
    this.recomputeKeys();
  }

  afterGuiAttached() {
    this.recomputeKeys();
    this.eMini.focus();
  }

  /** Values shown in the list now (after other filters and the mini filter). */
  getDisplayedKeys() {
    return [...this.displayed];
  }

  setMiniFilter(text) {
    this.miniText = text ?? "";
    this.eMini.value = this.miniText;
    this.refreshDisplayed();
  }

  // ----- rendering ----------------------------------------------------------

  refreshDisplayed() {
    if (!this.availableKeys) return;
    this.displayed = this.availableKeys.filter((k) => matchesMiniFilter(this.label(k), this.miniText));
    const selectedCount = this.displayed.filter((k) => this.isSelected(k)).length;
    this.eAll.checked = this.displayed.length > 0 && selectedCount === this.displayed.length;
    this.eAll.indeterminate = selectedCount > 0 && selectedCount < this.displayed.length;
    this.eSpacer.style.height = `${this.displayed.length * ROW_HEIGHT}px`;
    this.renderWindow(true);
  }

  renderWindow() {
    const first = Math.max(0, Math.floor(this.eList.scrollTop / ROW_HEIGHT) - 5);
    const last = Math.min(this.displayed.length, first + Math.ceil(LIST_HEIGHT / ROW_HEIGHT) + 10);
    for (const el of [...this.eList.querySelectorAll(".dex-set-filter-row")]) el.remove();
    const frag = document.createDocumentFragment();
    for (let i = first; i < last; i++) {
      const key = this.displayed[i];
      const row = document.createElement("label");
      row.className = "dex-set-filter-item dex-set-filter-row";
      row.style.top = `${i * ROW_HEIGHT}px`;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.index = String(i);
      input.checked = this.isSelected(key);
      const span = document.createElement("span");
      span.textContent = this.label(key);
      row.append(input, span);
      frag.appendChild(row);
    }
    this.eList.appendChild(frag);
  }
}
