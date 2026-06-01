// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import { usePyodide } from "./PyodideContext";
import CodeEditor from "./CodeEditor";

/**
 * A small code editor that can run Python code, like a row in a Jupyter notebook;
 * this variant is used for data warnings, column subsetting, and row aggregation
 */
export default function PythonRunner({startingCode, codeRows=6, codeCols=50}) {
  const [code, setCode] = useState(startingCode);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const kernel = usePyodide();

  if (!kernel) {
    return <div>Loading Python...</div>;
  }

  const { pyodide, namespace } = kernel;

  /**
   * Run the Python code from the editor area
   */
  const runCode = async () => {
    if (!pyodide) return;
    try {
      setOutput("");
      setRunning(true);
      const result = await pyodide.runPythonAsync(code, { globals: namespace });
      setRunning(false);
      setOutput(result?.toString() ?? "(no output)");
    } catch (err) {
      setOutput(err.toString());
      setRunning(false);
    }
  };

  return (
    <div>
      {/* The code editor area */}
      <CodeEditor
        value={code}
        onChange={setCode}
        rows={codeRows}
        cols={codeCols}
      />
      <br />
      {/* The 'Run' button */}
      <button onClick={runCode} disabled={running}>{!running? "Run" : "Running..."}</button>
      {/* The code output area */}
      <pre>{output}</pre>
    </div>
  );
}
