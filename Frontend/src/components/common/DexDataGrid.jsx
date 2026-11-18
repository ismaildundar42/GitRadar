import React, { useEffect, useRef } from 'react';
import * as agGrid from 'ag-grid-community';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import * as XLSX from 'xlsx';
import * as agCharts from 'ag-charts-community';
import { createDexGrid, DexSetFilter, DexRichSelectEditor } from '../dex-grid/src/index.js';
import '../dex-grid/src/styles.css';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { useTheme } from '../../context/ThemeContext';

// AG Grid v33+ Modül Kaydı (Error #200 Çözümü)
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * Enterprise DexDataGrid React Wrapper
 * AG Grid Community + DexShed Enterprise modüllerini React yaşam döngüsüne bağlar.
 */
export default function DexDataGrid({
  rowData = [],
  columnDefs = [],
  onRowClick,
  pagination = true,
  paginationPageSize = 15,
  isDark: propIsDark,
  className = '',
  gridOptions: extraGridOptions = {},
  onGridReady: userOnGridReady,
  apiRef: externalApiRef,
}) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const onRowClickRef = useRef(onRowClick);

  const themeContext = useTheme();
  const isDark = propIsDark !== undefined ? propIsDark : themeContext?.isDark ?? true;

  // onRowClick güncelliğini koru
  useEffect(() => {
    onRowClickRef.current = onRowClick;
  }, [onRowClick]);

  const fitColumns = () => {
    try {
      if (apiRef.current && !apiRef.current.isDestroyed?.()) {
        const cols = apiRef.current.getAllDisplayedColumns?.();
        if (cols && cols.length > 0) {
          apiRef.current.sizeColumnsToFit();
        }
      }
    } catch {
      // ignore
    }
  };

  // Grid başlatma
  useEffect(() => {
    if (!containerRef.current) return;

    const baseOptions = {
      theme: 'legacy', // AG Grid v33/v36 CSS tema uyumluluğu için zorunlu (Error #239 çözümü)
      sideBar: false,
      suppressSideBar: true,
      columnsPanel: false,
      headerHeight: 46,
      rowHeight: 52,
      rowData,
      columnDefs,
      pagination,
      paginationPageSize,
      paginationPageSizeSelector: [10, 15, 25, 50, 100],
      rowSelection: {
        mode: 'singleRow',
        checkboxes: false,
        enableClickSelection: true,
      },
      suppressRowClickSelection: false,
      domLayout: 'autoHeight', // Gövdenin 0px çökmesini engelleyen otomatik yükseklik
      cellSelection: false,
      enableRangeSelection: false,
      enableCharts: true,
      suppressClipboardPaste: true,
      suppressCopyRowsToClipboard: false,
      autoSizeStrategy: { type: 'fitGridWidth' },
      defaultColDef: {
        sortable: true,
        resizable: true,
        filter: true,
      },
      components: {
        agSetColumnFilter: DexSetFilter,
        dexSetFilter: DexSetFilter,
        agRichSelectCellEditor: DexRichSelectEditor,
        dexRichSelectEditor: DexRichSelectEditor,
        ...(extraGridOptions.components || {}),
      },
      groupDefaultExpanded: 1,
      autoGroupColumnDef: {
        headerName: 'Zafiyet Ağacı / Grup',
        minWidth: 220,
        cellRendererParams: {
          suppressCount: false,
        },
        ...(extraGridOptions.autoGroupColumnDef || {}),
      },
      onGridReady: (params) => {
        if (externalApiRef) {
          externalApiRef.current = params.api;
        }
        if (userOnGridReady) {
          userOnGridReady(params);
        }
        setTimeout(() => {
          try {
            if (params?.api?.getAllDisplayedColumns?.()?.length > 0) {
              params.api.sizeColumnsToFit();
            }
          } catch {
            // ignore
          }
        }, 100);
      },
      onRowClicked: (event) => {
        if (
          event.event?.target?.tagName === 'A' ||
          event.event?.target?.closest('a')
        ) {
          return;
        }
        // Grup başlık satırına tıklandığında çekmeceyi açma, grubu katla/aç
        if (event.data?.__dexGroup || event.node?.data?.__dexGroup) {
          const meta = event.data?.__dexGroup || event.node?.data?.__dexGroup;
          if (meta && event.api?.setGroupExpanded) {
            event.api.setGroupExpanded(meta.id, !meta.expanded);
          }
          return;
        }
        if (onRowClickRef.current && event.data) {
          onRowClickRef.current(event.data);
        }
      },
      ...extraGridOptions,
    };

    let api;
    try {
      api = createDexGrid(containerRef.current, baseOptions, {
        agGrid,
        ModuleRegistry,
        AllCommunityModule,
        XLSX,
        agCharts,
      });
      apiRef.current = api;
      if (externalApiRef) {
        externalApiRef.current = api;
      }
      setTimeout(fitColumns, 60);
    } catch (err) {
      console.error('DexDataGrid initialization error:', err);
    }

    const handleResize = () => {
      fitColumns();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (externalApiRef) {
        externalApiRef.current = null;
      }
      if (apiRef.current) {
        try {
          apiRef.current.destroy();
        } catch {
          // ignore
        }
        apiRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rowData değişikliklerini dinamik yansıt
  useEffect(() => {
    if (apiRef.current && rowData) {
      try {
        apiRef.current.setGridOption('rowData', rowData);
        setTimeout(fitColumns, 50);
      } catch (err) {
        console.warn('DexDataGrid rowData update warning:', err);
      }
    }
  }, [rowData]);

  // columnDefs değişikliklerini dinamik yansıt
  useEffect(() => {
    if (apiRef.current && columnDefs) {
      try {
        apiRef.current.setGridOption('columnDefs', columnDefs);
        setTimeout(fitColumns, 50);
      } catch (err) {
        console.warn('DexDataGrid columnDefs update warning:', err);
      }
    }
  }, [columnDefs]);

  // Tema değiştiğinde kolonları tekrar hizala
  useEffect(() => {
    const timer = setTimeout(fitColumns, 100);
    return () => clearTimeout(timer);
  }, [isDark]);

  const themeClass = isDark ? 'ag-theme-alpine-dark' : 'ag-theme-alpine';

  return (
    <div
      ref={containerRef}
      className={`w-full ${themeClass} rounded-xl shadow-sm text-left ${className}`}
      style={{ width: '100%' }}
    />
  );
}
