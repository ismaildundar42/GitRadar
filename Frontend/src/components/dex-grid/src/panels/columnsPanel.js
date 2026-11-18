// Columns tool panel (sideBar). Supports sideBar: true | "columns" |
// "agColumnsToolPanel" | string[] | { toolPanels, defaultToolPanel, hiddenByDefault, position }.
// The panel lists every column (hidden ones too) with a visibility checkbox and
// drag-to-reorder; extra sections (e.g. row groups) are added by other features
// through ctx.state.columnsPanelSections.

import { attachMethods } from "../core/api.js";

const COLUMNS_IDS = new Set(["columns", "agColumnsToolPanel"]);

export function normalizeSideBar(sideBar) {
  if (!sideBar) return null;
  if (sideBar === true) return { panels: [{ id: "columns", params: {} }], defaultToolPanel: "columns", hiddenByDefault: false, position: "right" };
  if (typeof sideBar === "string") return normalizeSideBar([sideBar]);
  if (Array.isArray(sideBar)) {
    const panels = sideBar.filter(isColumnsId).map(() => ({ id: "columns", params: {} }));
    return panels.length ? { panels, defaultToolPanel: "columns", hiddenByDefault: false, position: "right" } : null;
  }
  const panels = (sideBar.toolPanels ?? ["columns"])
    .map((p) => (typeof p === "string" ? { id: p, toolPanel: p } : p))
    .filter((p) => isColumnsId(p.id) || isColumnsId(p.toolPanel))
    .map((p) => ({ id: "columns", params: p.toolPanelParams ?? {}, labelDefault: p.labelDefault, labelKey: p.labelKey }));
  if (!panels.length) return null;
  return {
    panels,
    defaultToolPanel: isColumnsId(sideBar.defaultToolPanel) ? "columns" : sideBar.defaultToolPanel === undefined ? null : sideBar.defaultToolPanel,
    hiddenByDefault: !!sideBar.hiddenByDefault,
    position: sideBar.position === "left" ? "left" : "right",
  };
}

function isColumnsId(id) {
  return typeof id === "string" && COLUMNS_IDS.has(id);
}

export const columnsPanelFeature = {
  name: "columnsPanel",
  gridOptions: ["sideBar", "columnsPanel", "suppressSideBar"],
  prepare(options, ctx) {
    const hasSideBar = options.sideBar !== false && !options.suppressSideBar && options.columnsPanel !== false && Boolean(normalizeSideBar(options.sideBar));
    if (!hasSideBar) {
      ctx.gridContainer = ctx.container;
      return options;
    }
    const root = ctx.container;
    root.classList.add("dex-grid-root");
    const main = document.createElement("div");
    main.className = "dex-grid-main";
    const gridEl = document.createElement("div");
    gridEl.className = "dex-grid-host";
    main.appendChild(gridEl);
    const side = document.createElement("div");
    side.className = "dex-side-bar";
    root.append(main, side);
    ctx.gridContainer = gridEl;
    ctx.state.mainEl = main;
    ctx.state.sideBarEl = side;
    ctx.state.columnsPanelSections = ctx.state.columnsPanelSections ?? [];
    return options;
  },
  attach(api, ctx) {
    if (!ctx.state.sideBarEl) return;
    const s = ctx.state;
    s.sideBar = normalizeSideBar(ctx.options.sideBar);
    s.sideBarVisible = true;
    s.openPanel = s.sideBar && !s.sideBar.hiddenByDefault ? s.sideBar.defaultToolPanel : null;
    const refresh = () => renderSideBar(api, ctx);
    for (const type of ["columnVisible", "columnMoved", "columnPinned", "newColumnsLoaded", "displayedColumnsChanged", "columnEverythingChanged"]) {
      api.addEventListener(type, refresh);
    }
    ctx.on("groupingChanged", refresh);
    attachMethods(api, {
      openToolPanel: (key) => {
        if (s.sideBar && isColumnsId(key)) {
          s.openPanel = "columns";
          refresh();
        }
      },
      closeToolPanel: () => {
        s.openPanel = null;
        refresh();
      },
      isToolPanelShowing: () => !!s.openPanel && s.sideBarVisible,
      getOpenedToolPanel: () => s.openPanel,
      setSideBarVisible: (visible) => {
        s.sideBarVisible = !!visible;
        refresh();
      },
      isSideBarVisible: () => !!s.sideBar && s.sideBarVisible,
      getSideBar: () => ctx.options.sideBar,
      refreshToolPanel: refresh,
    });
    refresh();
  },
  onOptionChanged(key, value, ctx) {
    if (!ctx.state.sideBarEl) return;
    const s = ctx.state;
    s.sideBar = normalizeSideBar(value);
    s.openPanel = s.sideBar && !s.sideBar.hiddenByDefault ? s.sideBar.defaultToolPanel : null;
    renderSideBar(ctx.api, ctx);
  },
};

function t(api, key, fallback) {
  return api.getGridOption("localeText")?.[key] ?? fallback;
}

function renderSideBar(api, ctx) {
  const s = ctx.state;
  const side = s.sideBarEl;
  const root = ctx.container;
  if (!s.sideBar || !s.sideBarVisible) {
    side.hidden = true;
    side.style.display = "none";
    side.replaceChildren();
    return;
  }
  side.style.display = "";
  side.hidden = false;
  root.classList.toggle("dex-side-left", s.sideBar.position === "left");
  const scroll = side.querySelector(".dex-columns-list")?.scrollTop ?? 0;
  const search = side.querySelector(".dex-columns-search")?.value ?? "";
  const hadFocus = document.activeElement?.classList?.contains("dex-columns-search");
  const tabs = document.createElement("div");
  tabs.className = "dex-side-tabs";
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "dex-side-tab" + (s.openPanel === "columns" ? " dex-side-tab-open" : "");
  // As in AG Grid: localeText[labelKey] first, then labelDefault.
  const panel = s.sideBar.panels[0];
  const localeText = api.getGridOption("localeText") ?? {};
  tab.textContent = (panel.labelKey && localeText[panel.labelKey]) ?? panel.labelDefault ?? t(api, "columns", "Columns");
  tab.addEventListener("click", () => (s.openPanel === "columns" ? api.closeToolPanel() : api.openToolPanel("columns")));
  tabs.appendChild(tab);
  const content = [];
  if (s.openPanel === "columns") content.push(renderColumnsPanel(api, ctx, s.sideBar.panels[0].params, search));
  side.replaceChildren(...(s.sideBar.position === "left" ? [tabs, ...content] : [...content, tabs]));
  const list = side.querySelector(".dex-columns-list");
  if (list) list.scrollTop = scroll;
  if (hadFocus) {
    const input = side.querySelector(".dex-columns-search");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }
}

function panelColumns(api) {
  return api
    .getColumnState()
    .map((st) => api.getColumn(st.colId))
    .filter((col) => col && !isUtility(col) && !col.getColDef().suppressColumnsToolPanel);
}

function isUtility(col) {
  const id = col.getColId();
  return id === "ag-Grid-SelectionColumn" || id === "ag-Grid-RowNumbersColumn" || !!col.getColDef().context?.dexAddedColumn;
}

function renderColumnsPanel(api, ctx, params, searchText) {
  const panel = document.createElement("div");
  panel.className = "dex-columns-panel";
  const head = document.createElement("div");
  head.className = "dex-columns-head";
  const all = document.createElement("input");
  all.type = "checkbox";
  all.className = "dex-columns-all";
  all.setAttribute("aria-label", t(api, "selectAll", "Select All"));
  const search = document.createElement("input");
  search.type = "text";
  search.className = "dex-columns-search";
  search.placeholder = t(api, "searchOoo", "Search...");
  search.value = searchText;
  if (!params.suppressColumnSelectAll) head.appendChild(all);
  if (!params.suppressColumnFilter) head.appendChild(search);
  const list = document.createElement("div");
  list.className = "dex-columns-list";
  const cols = panelColumns(api);
  const label = (col) => api.getDisplayNameForColumn(col, "columnToolPanel") ?? col.getColId();
  const fold = (x) => String(x).toLocaleLowerCase("tr-TR");
  const shown = cols.filter((c) => !searchText || fold(label(c)).includes(fold(searchText)));
  const toggleable = shown.filter((c) => !c.getColDef().lockVisible);
  const visibleCount = toggleable.filter((c) => c.isVisible()).length;
  all.checked = toggleable.length > 0 && visibleCount === toggleable.length;
  all.indeterminate = visibleCount > 0 && visibleCount < toggleable.length;
  all.addEventListener("change", () => api.setColumnsVisible(toggleable.map((c) => c.getColId()), all.checked));
  search.addEventListener("input", () => {
    renderSideBar(api, ctx);
  });
  for (const col of shown) {
    const row = document.createElement("div");
    row.className = "dex-columns-item";
    row.dataset.colId = col.getColId();
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = col.isVisible();
    box.disabled = !!col.getColDef().lockVisible;
    box.addEventListener("change", () => api.setColumnsVisible([col.getColId()], box.checked));
    const name = document.createElement("span");
    name.className = "dex-columns-name";
    name.textContent = label(col);
    row.append(box, name);
    if (!col.getColDef().lockPosition && !params.suppressColumnMove) {
      row.draggable = true;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/dex-col", col.getColId());
        e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragover", (e) => {
        if (e.dataTransfer.types.includes("text/dex-col")) {
          e.preventDefault();
          row.classList.add("dex-columns-drop");
        }
      });
      row.addEventListener("dragleave", () => row.classList.remove("dex-columns-drop"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("dex-columns-drop");
        moveColumnBefore(api, e.dataTransfer.getData("text/dex-col"), col.getColId());
      });
    }
    list.appendChild(row);
  }
  panel.append(head, list);
  for (const section of ctx.state.columnsPanelSections) {
    const el = section(api, ctx, params);
    if (el) panel.appendChild(el);
  }
  return panel;
}

/** Moves a column to the position of another column in the full column order. */
export function moveColumnBefore(api, colId, targetColId) {
  if (!colId || colId === targetColId) return;
  const order = api.getColumnState().map((s) => s.colId);
  const from = order.indexOf(colId);
  let to = order.indexOf(targetColId);
  if (from < 0 || to < 0) return;
  // moveColumns takes the final index; moving down shifts the target up by one.
  if (from < to) to -= 1;
  api.moveColumns([colId], to);
}
