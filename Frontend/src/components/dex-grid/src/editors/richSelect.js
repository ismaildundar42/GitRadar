// Rich select cell editor for AG Grid Community (custom cell editor interface).
// cellEditorParams: values (array | Promise<array>), formatValue(value) => string,
// filterList / allowTyping (show a search box), searchType ("matchAny" | "match"),
// valueListMaxHeight (px).

import { matchesMiniFilter } from "../filters/setFilterModel.js";

export class DexRichSelectEditor {
  init(params) {
    this.params = params;
    this.value = params.value;
    this.values = [];
    this.highlight = -1;
    this.gui = document.createElement("div");
    this.gui.className = "dex-rich-select";
    this.gui.tabIndex = -1;
    const searchable = params.filterList || params.allowTyping;
    this.eSearch = document.createElement("input");
    this.eSearch.className = "dex-rich-select-search";
    this.eSearch.type = "text";
    if (!searchable) this.eSearch.style.display = "none";
    this.eList = document.createElement("div");
    this.eList.className = "dex-rich-select-list";
    this.eList.setAttribute("role", "listbox");
    const max = params.valueListMaxHeight ?? 220;
    this.eList.style.maxHeight = typeof max === "number" ? `${max}px` : String(max);
    this.gui.append(this.eSearch, this.eList);
    if (typeof params.eventKey === "string" && params.eventKey.length === 1 && searchable) {
      this.eSearch.value = params.eventKey;
    }
    this.eSearch.addEventListener("input", () => this.render());
    this.gui.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.eList.addEventListener("mousedown", (e) => {
      const item = e.target.closest("[data-index]");
      if (!item) return;
      e.preventDefault();
      this.choose(this.shown[Number(item.dataset.index)]);
    });
    Promise.resolve(typeof params.values === "function" ? params.values(params) : params.values).then((values) => {
      this.values = Array.isArray(values) ? values : [];
      this.render();
    });
  }

  format(value) {
    if (this.params.formatValue) return String(this.params.formatValue(value) ?? "");
    return value === null || value === undefined ? "" : String(value);
  }

  render() {
    const text = this.eSearch.value;
    const startsWith = this.params.searchType === "match";
    this.shown = this.values.filter((v) => {
      const label = this.format(v);
      if (!text) return true;
      return startsWith ? label.toLocaleLowerCase("tr-TR").startsWith(text.toLocaleLowerCase("tr-TR")) : matchesMiniFilter(label, text);
    });
    const current = this.shown.findIndex((v) => v === this.value);
    this.highlight = text ? (this.shown.length ? 0 : -1) : current;
    this.eList.replaceChildren(
      ...this.shown.map((v, i) => {
        const el = document.createElement("div");
        el.className = "dex-rich-select-item" + (i === this.highlight ? " dex-rich-select-active" : "") + (v === this.value ? " dex-rich-select-current" : "");
        el.dataset.index = String(i);
        el.setAttribute("role", "option");
        el.textContent = this.format(v);
        return el;
      }),
    );
    this.eList.querySelector(".dex-rich-select-active")?.scrollIntoView?.({ block: "nearest" });
  }

  onKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (!this.shown.length) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      this.highlight = (this.highlight + delta + this.shown.length) % this.shown.length;
      [...this.eList.children].forEach((el, i) => el.classList.toggle("dex-rich-select-active", i === this.highlight));
      this.eList.children[this.highlight]?.scrollIntoView?.({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (this.highlight >= 0) this.choose(this.shown[this.highlight]);
      else this.params.stopEditing();
    }
  }

  choose(value) {
    this.value = value;
    this.params.stopEditing();
  }

  getGui() {
    return this.gui;
  }

  afterGuiAttached() {
    (this.eSearch.style.display === "none" ? this.gui : this.eSearch).focus();
  }

  getValue() {
    return this.value;
  }

  isPopup() {
    return true;
  }

  getPopupPosition() {
    return "under";
  }
}
