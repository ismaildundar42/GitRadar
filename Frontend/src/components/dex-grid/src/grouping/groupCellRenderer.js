// Cell renderer of the auto group column: indent, expand/collapse toggle, label
// and leaf count. Leaf rows render nothing in this column.
// cellRendererParams: suppressCount, indentPx (default 20), innerRenderer(params) => string | Node.

export class DexGroupCellRenderer {
  init(params) {
    this.gui = document.createElement("span");
    this.gui.className = "dex-group-cell";
    this.render(params);
  }

  render(params) {
    const meta = params.data?.__dexGroup;
    this.gui.replaceChildren();
    if (!meta) return;
    const indent = params.indentPx ?? 20;
    this.gui.style.paddingLeft = `${meta.level * indent}px`;
    const toggle = document.createElement("span");
    toggle.className = "dex-group-toggle" + (meta.expanded ? " dex-group-expanded" : "");
    if (meta.noChildren) {
      // Pivot leaf groups and the grand total have nothing to expand.
      toggle.classList.add("dex-group-toggle-empty");
    } else {
      toggle.setAttribute("role", "button");
      toggle.setAttribute("aria-expanded", String(!!meta.expanded));
      toggle.textContent = meta.expanded ? "▾" : "▸";
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        params.api.setGroupExpanded(meta.id, !meta.expanded);
      });
    }
    const label = document.createElement("span");
    label.className = "dex-group-label";
    const inner = params.innerRenderer?.({ ...params, value: meta.label });
    if (inner instanceof Node) label.appendChild(inner);
    else label.textContent = inner ?? meta.label;
    this.gui.append(toggle, label);
    if (!params.suppressCount) {
      const count = document.createElement("span");
      count.className = "dex-group-count";
      count.textContent = ` (${meta.count})`;
      this.gui.appendChild(count);
    }
  }

  getGui() {
    return this.gui;
  }

  refresh(params) {
    this.render(params);
    return true;
  }
}
