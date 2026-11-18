// Cell context menu.
//
// getContextMenuItems(params) returns AG Grid-style items: built-in names
// ("copy", "copyWithHeaders", "paste", "separator", "autoSizeAll", "resetColumns",
// "expandAll", "contractAll", "export", "csvExport", "excelExport", "chartRange")
// or objects { name, action, disabled, checked, icon, shortcut, subMenu,
// cssClasses, tooltip }. params: { node, column, value, api, context, defaultItems }.

import { attachMethods } from "../core/api.js";

const DEFAULT_ITEMS = ["copy", "copyWithHeaders", "paste", "separator", "export"];

export const contextMenuFeature = {
  name: "contextMenu",
  gridOptions: ["getContextMenuItems", "suppressContextMenu", "allowContextMenuWithControlKey"],
  prepare(options, ctx) {
    const userHandler = options.onCellContextMenu;
    return {
      ...options,
      preventDefaultOnContextMenu: !ctx.options.suppressContextMenu,
      onCellContextMenu: (event) => {
        userHandler?.(event);
        if (ctx.options.suppressContextMenu) return;
        const mouse = event.event;
        if (mouse?.ctrlKey && ctx.options.allowContextMenuWithControlKey) return;
        showMenu(ctx, { node: event.node, column: event.column, value: event.value, x: mouse?.clientX ?? 0, y: mouse?.clientY ?? 0 });
      },
    };
  },
  attach(api, ctx) {
    attachMethods(api, {
      showContextMenu: (params = {}) => showMenu(ctx, { node: params.rowNode ?? null, column: params.column ?? null, value: params.value, x: params.x ?? 0, y: params.y ?? 0 }),
      hidePopupMenu: () => closeMenu(ctx),
      /** Resolved items the menu would show for a cell (for tests and custom UIs). */
      getContextMenuItemsFor: (params = {}) => resolveItems(ctx, { node: params.rowNode ?? null, column: params.column ?? null, value: params.value }),
    });
  },
  destroy(ctx) {
    closeMenu(ctx);
  },
};

function t(ctx, key, fallback) {
  return ctx.api.getGridOption("localeText")?.[key] ?? fallback;
}

function builtIn(ctx, name) {
  const api = ctx.api;
  const has = (m) => typeof api[m] === "function";
  switch (name) {
    case "copy":
      return { name: t(ctx, "copy", "Copy"), shortcut: "Ctrl+C", action: () => api.copyToClipboard({ includeHeaders: false }), disabled: !has("copyToClipboard") };
    case "copyWithHeaders":
      return { name: t(ctx, "copyWithHeaders", "Copy with Headers"), action: () => api.copyToClipboard({ includeHeaders: true }), disabled: !has("copyToClipboard") };
    case "paste":
      return { name: t(ctx, "paste", "Paste"), shortcut: "Ctrl+V", action: () => api.pasteFromClipboard(), disabled: !has("pasteFromClipboard") || !!ctx.options.suppressClipboardPaste };
    case "separator":
      return "separator";
    case "autoSizeAll":
      return { name: t(ctx, "autosizeAllColumns", "Autosize All Columns"), action: () => api.autoSizeAllColumns() };
    case "resetColumns":
      return { name: t(ctx, "resetColumns", "Reset Columns"), action: () => api.resetColumnState() };
    case "expandAll":
      return { name: t(ctx, "expandAll", "Expand All Row Groups"), action: () => api.expandAll(), disabled: !ctx.state.isGrouped?.() };
    case "contractAll":
      return { name: t(ctx, "collapseAll", "Collapse All Row Groups"), action: () => api.collapseAll(), disabled: !ctx.state.isGrouped?.() };
    case "csvExport":
      return { name: t(ctx, "csvExport", "CSV Export"), action: () => api.exportDataAsCsv() };
    case "excelExport":
      return { name: t(ctx, "excelExport", "Excel Export"), action: () => api.exportDataAsExcel(), disabled: !ctx.XLSX };
    case "export":
      return { name: t(ctx, "export", "Export"), subMenu: [builtIn(ctx, "csvExport"), builtIn(ctx, "excelExport")] };
    case "chartRange":
      return { name: t(ctx, "chartRange", "Chart Range"), action: () => api.createRangeChart?.({ chartType: "groupedColumn" }), disabled: typeof api.createRangeChart !== "function" || !(ctx.state.getCellRanges?.() ?? []).length };
    default:
      console.warn(`dex-grid: unknown context menu item "${name}"`);
      return null;
  }
}

function normalize(ctx, items) {
  const out = [];
  for (const item of items ?? []) {
    const resolved = typeof item === "string" ? builtIn(ctx, item) : item;
    if (!resolved) continue;
    if (resolved === "separator") {
      if (out.length && out[out.length - 1] !== "separator") out.push("separator");
      continue;
    }
    out.push(resolved.subMenu ? { ...resolved, subMenu: normalize(ctx, resolved.subMenu) } : resolved);
  }
  while (out[out.length - 1] === "separator") out.pop();
  return out;
}

function resolveItems(ctx, target) {
  const getItems = ctx.options.getContextMenuItems;
  const params = { ...target, api: ctx.api, context: ctx.api.getGridOption("context"), defaultItems: [...DEFAULT_ITEMS] };
  const items = getItems ? getItems(params) : DEFAULT_ITEMS;
  return normalize(ctx, items);
}

function closeMenu(ctx) {
  ctx.state.menuCleanup?.();
  ctx.state.menuCleanup = null;
}

function showMenu(ctx, target) {
  closeMenu(ctx);
  const items = resolveItems(ctx, target);
  if (!items.length) return null;
  const layers = [];
  const root = renderLayer(ctx, items, target.x, target.y, layers, 0);
  const onDown = (e) => {
    if (!layers.some((l) => l.contains(e.target))) closeMenu(ctx);
  };
  const onKey = (e) => {
    if (e.key === "Escape") closeMenu(ctx);
  };
  const onScroll = (e) => {
    if (!layers.some((l) => l.contains(e.target))) closeMenu(ctx);
  };
  setTimeout(() => document.addEventListener("mousedown", onDown, true));
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onScroll, true);
  ctx.state.menuCleanup = () => {
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, true);
    for (const l of layers) l.remove();
    layers.length = 0;
  };
  root.focus();
  return root;
}

function renderLayer(ctx, items, x, y, layers, depth) {
  const menu = document.createElement("div");
  menu.className = "dex-menu";
  menu.setAttribute("role", "menu");
  menu.tabIndex = -1;
  menu.dataset.depth = String(depth);
  const rows = [];
  for (const item of items) {
    if (item === "separator") {
      const sep = document.createElement("div");
      sep.className = "dex-menu-separator";
      sep.setAttribute("role", "separator");
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement("div");
    row.className = "dex-menu-item" + (item.disabled ? " dex-menu-disabled" : "") + (item.cssClasses ? " " + item.cssClasses.join(" ") : "");
    row.setAttribute("role", "menuitem");
    if (item.disabled) row.setAttribute("aria-disabled", "true");
    if (item.tooltip) row.title = item.tooltip;
    const icon = document.createElement("span");
    icon.className = "dex-menu-icon";
    if (item.checked) icon.textContent = "✓";
    else if (item.icon instanceof HTMLElement) icon.appendChild(item.icon);
    else if (typeof item.icon === "string") icon.innerHTML = item.icon;
    const label = document.createElement("span");
    label.className = "dex-menu-label";
    label.textContent = item.name;
    const shortcut = document.createElement("span");
    shortcut.className = "dex-menu-shortcut";
    shortcut.textContent = item.subMenu ? "›" : item.shortcut ?? "";
    row.append(icon, label, shortcut);
    const openSub = () => {
      while (layers.length > depth + 1) layers.pop().remove();
      if (item.subMenu?.length && !item.disabled) {
        const rect = row.getBoundingClientRect();
        renderLayer(ctx, item.subMenu, rect.right, rect.top, layers, depth + 1);
      }
    };
    row.addEventListener("mouseenter", () => {
      rows.forEach((r) => r.classList.remove("dex-menu-active"));
      row.classList.add("dex-menu-active");
      openSub();
    });
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      if (item.disabled) return;
      if (item.subMenu) {
        openSub();
        return;
      }
      closeMenu(ctx);
      item.action?.();
    });
    row._dexItem = item;
    row._openSub = openSub;
    rows.push(row);
    menu.appendChild(row);
  }
  menu.addEventListener("keydown", (e) => onMenuKey(e, ctx, rows, layers, depth));
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
  layers.push(menu);
  return menu;
}

function onMenuKey(e, ctx, rows, layers, depth) {
  const enabled = rows.filter((r) => !r._dexItem.disabled);
  if (!enabled.length) return;
  const idx = enabled.findIndex((r) => r.classList.contains("dex-menu-active"));
  const activate = (r) => {
    rows.forEach((x) => x.classList.remove("dex-menu-active"));
    r.classList.add("dex-menu-active");
  };
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const next = e.key === "ArrowDown" ? (idx + 1) % enabled.length : (idx - 1 + enabled.length) % enabled.length;
    activate(enabled[next]);
  } else if (e.key === "Enter") {
    e.preventDefault();
    enabled[idx]?.click();
  } else if (e.key === "ArrowRight" && enabled[idx]?._dexItem.subMenu) {
    e.preventDefault();
    enabled[idx]._openSub();
    layers[depth + 1]?.focus();
  } else if (e.key === "ArrowLeft" && depth > 0) {
    e.preventDefault();
    layers.pop().remove();
    layers[depth - 1]?.focus();
  }
}
