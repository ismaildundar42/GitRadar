/**
 * Export/clipboard value of a cell. The auto group column's value is its sort
 * key (the group path), so exports use the group label for group rows and
 * leave leaf rows empty, as the cell renderer does.
 */
export function exportValue(api, node, column) {
  if (column.getColDef().context?.dexAutoGroup) {
    return node.data?.__dexGroup ? node.data.__dexGroup.label : null;
  }
  return api.getCellValue({ rowNode: node, colKey: column });
}
