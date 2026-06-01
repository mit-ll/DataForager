// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

// PyodideContext.js
import React, { createContext, useContext, useEffect, useState } from "react";
import { getPyodide } from "./PyodideManager";

const PyodideContext = createContext(null);

/**
 * A function which sets the shared Pyodide variable context
 * when called from inside a PythonRunner
 */
export function usePyodide() {
  return useContext(PyodideContext);
}

/**
 * A component which wraps around PythonRunner components,
 * enabling them to share the same variable context;
 * see the DetailsTabPage code, bookending each subsection
 */
export function PyodideProvider({ children }) {
  const [kernel, setKernel] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const setup = async () => {
      const pyodide = await getPyodide();
      const namespace = pyodide.globals.get("dict")(); // new empty global scope
      setKernel({ pyodide, namespace });
      setReady(true); // mark when it's safe to proceed
    };
    setup();
  }, []);

  return (
    // Just a wrapper around all its children (which may be PythonRunners or not)
    // to ensure all PythonRunners have the same variable context
    <PyodideContext.Provider value={ready ? kernel : null}>
      {children}
    </PyodideContext.Provider>
  );
}
