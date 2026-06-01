// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

let pyodideInstance = null;
let pyodideReady = null;

/**
 * A function that helps modularize the process
 * for starting a Python browser instance through Pyodide
 */
export async function getPyodide() {
  if (pyodideInstance) return pyodideInstance;

  if (!pyodideReady) {
    pyodideReady = (async () => {
      if (!window.loadPyodide) {
        await new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js";
          script.onload = resolve;
          document.body.appendChild(script);
        });
      }

      const pyodide = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
      });

      await pyodide.loadPackage(["pandas", "numpy"]);

      // ✅ Only mark the instance ready after packages are installed
      pyodideInstance = pyodide;

      return pyodideInstance;
    })();
  }

  return pyodideReady;
}
