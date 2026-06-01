// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import React, { useState, useMemo, useRef, useEffect } from 'react';

/**
 * Nicely format data values for the table cells
 */
const formatValue = (value) => {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') {
    if (value === 0) return '0';
    const abs = Math.abs(value);
    const formatted = abs < 0.01
      ? value.toExponential(2)                         // use scientific notation for very small
      : value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }); // commas + 2 sig digits max
    return formatted;
  }
  if (typeof value === 'string' && value.length > 50) {
    return value.slice(0, 47) + '...';
  }
  return value;
};

/**
 * The component for the data table at the top of the interface
 */
const DataTable = ({ data, columns, columnToTabMap, setActiveTab, hiddenColumns, setHiddenColumns, availableVisAttributes, makeVis }) => {
  const [page, setPage] = useState(0); // What 'page' number (to skim through rows) we are viewing of the table
  const [search, setSearch] = useState(""); // The current search string for the data table
  const [columnVisibilityPopup, setColumnVisibilityPopup] = useState(false); // Whether or not the column visibility toggle list is shown
  const [infoPopup, setInfoPopup] = useState(null); // Which column info popup is being shown, if any

  const popupRef = useRef(null); // For column toggle list
  const buttonRef = useRef(null); // For buttons in column visibility toggle list
  const infoPopupRef = useRef(null); // For column info popups
  const infoButtonRef = useRef(null); // For buttons in column info popups

  useEffect(() => {
    /**
     * Helper function to make sure column info popups disappear
     * when the user clicks anywhere outside of them
     */
    const handleClickOutside = (event) => {
      if (
        infoPopupRef.current &&
        !infoPopupRef.current.contains(event.target) &&
        !(event.target.closest('.col-info-icon'))
      ) {
        setInfoPopup(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [infoPopupRef]);


  useEffect(() => {
    /**
     * Helper function to make sure the column toggle list disappears
     * when the user clicks anywhere outside of it
     */
    const handleClickOutsideColumnPopup = (e) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setColumnVisibilityPopup(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutsideColumnPopup);
    return () => document.removeEventListener("mousedown", handleClickOutsideColumnPopup);
  }, []);

  const visibleColumns = columns.filter(col => !hiddenColumns.has(col)); // Which cols are visible after removing hidden ones

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    return data.filter(row =>
      Object.values(row).some(
        val => typeof val === 'string' && val.toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [data, search]);

  const rowsPerPage = 4;
  const pageCount = Math.ceil(filteredData.length / rowsPerPage);
  const visibleRows = filteredData.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  /**
   * Toggle whether a column should be shown or hidden
   */
  const toggleColumn = (col) => {
    setHiddenColumns(prev => {
      const updated = new Set(prev);
      if (updated.has(col)) updated.delete(col);
      else updated.add(col);
      return updated;
    });
  };

  return (
    <>
      {/* Container for the search, hide-columns toggle, and pagination */}
      <div className="table-controls">
        {/* Table search */}
        <input
          id="table-search"
          className='search-textbox'
          type="text"
          placeholder="Search the table"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginRight: '10px', padding: '4px' }}
        />

        {/* Column visibility toggle list */}
        <div style={{ position: 'relative', display: 'inline-block', marginLeft: '10px' }}>
          <button
            className='toggle-cols-button'
            ref={buttonRef}
            onClick={() => setColumnVisibilityPopup(prev => !prev)}
            style={{ fontSize: '0.9rem', padding: '4px 8px' }}
          >
            {columnVisibilityPopup ? 'Toggle Columns ▲' : 'Toggle Columns ▼'}
          </button>
          {/* What to show if the list is visible */}
          {columnVisibilityPopup && (
            <div ref={popupRef} className="column-toggle-popup">
              {columns.map(col => (
                <label key={col} className="column-checkbox-label">
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.has(col)}
                    onChange={() => toggleColumn(col)}
                  />
                  <span>{col.length > 33 ? col.slice(0, 30).trim() + '...' : col}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Table pagination */}
        <div className='pagination-group'>
          <button className='table-page-button' disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            Prev
          </button>
          <span className="pagination-text" style={{ margin: '0 8px' }}>Page {pageCount === 0? 0 : page + 1} of {pageCount}</span>
          <button className='table-page-button' disabled={(page === pageCount - 1) || (pageCount === 0)} onClick={() => setPage(p => p + 1)}>
            Next
          </button>
        </div>
      </div>

      {/* The table with data itself */}
      <div className="table-container">
        <table border="1" cellPadding="8" style={{ width: '100%', borderCollapse: 'collapse' }}>
          {/* Columns */}
          <thead>
            <tr>
              {visibleColumns.map(col => (
                <th key={col}>
                  <div className="header-cell">
                    <span style={{visibility: "hidden"}}>ⓘ</span>
                    <span className="col-label">{col.length > 20 ? col.slice(0, 17).trim() + '...' : col}</span>
                    <span
                      className="col-info-icon"
                      ref={infoButtonRef}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickedColumn = col;

                        // delay opening so that document click doesn't immediately close it
                        setTimeout(() => {
                          setInfoPopup(prev => {
                            if (prev && prev.column === clickedColumn) {
                              return null;
                            }

                            const popupWidth = 250;  // should match your CSS width
                            // const windowWidth = window.innerWidth;
                            // const desiredRight = rect.right + popupWidth;

                            const padding = 0;          // margin from edge
                            const minLeft = rect.left;  // show closer to icon
                            const maxLeft = window.innerWidth - popupWidth - padding;

                            const adjustedLeft = Math.min(Math.max(rect.right, minLeft), maxLeft + 10);

                            return {
                              column: clickedColumn,
                              x: adjustedLeft,
                              y: rect.bottom + window.scrollY
                            };
                          });
                        }, 0);
                      }}
                    >
                      ⓘ
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          {/* Rows */}
          <tbody>
            {visibleRows.map((row, idx) => (
              <tr key={idx}>
                {visibleColumns.map(col => (
                  <td
                    key={`${idx}-${col}`}
                    style={{ textAlign: typeof row[col] === 'number' ? 'right' : 'left' }}
                  >
                    {formatValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Render column info popup if necessary */}
        {infoPopup && (
          <div
            className="column-info-popup"
            ref={infoPopupRef}
            style={{
              top: `${infoPopup.y}px`,
              left: `${infoPopup.x}px`,
              transform: 'translate(-5px, 5px)'
            }}
          >
            {/* Content inside the info popup, beginning with the title */}
            <p><strong>{infoPopup.column}</strong></p>
            {/* Button to view the column's history tab page, if applicable */}
            {infoPopup.column in columnToTabMap &&
              <>
                <p>
                  {"Source: "}
                  <button
                    className="jump-to-tab-button"
                    onClick={(e) => {
                      setInfoPopup(null);
                      setActiveTab(columnToTabMap[infoPopup.column].id)
                    }}
                    title={columnToTabMap[infoPopup.column].source}
                  >
                    {columnToTabMap[infoPopup.column].source.length < 23? 
                     columnToTabMap[infoPopup.column].source :
                     columnToTabMap[infoPopup.column].source.slice(0, 20).trim() + "..."}
                  </button>
                </p>
              </>
            }
            {console.log(infoPopup.column, availableVisAttributes)}
            {/* Button to make a boxplot for the column's data, if applicable */}
            {availableVisAttributes.includes(infoPopup.column) &&
              <p>
                <button
                  className="make-vis-btn"
                  onClick={() => {
                    setInfoPopup(null);
                    makeVis({vis_type: 'boxplot', attributes: [infoPopup.column]})
                  }}
                >
                  View descriptive stats
                </button>
              </p>
            }
            {/* Button to hide the column */}
            <p>
              <button
                className="hide-column-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log(infoPopup.column);
                  toggleColumn(infoPopup.column);
                  setInfoPopup(null);
                }}
              >
                Hide this column
              </button>
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default DataTable;
