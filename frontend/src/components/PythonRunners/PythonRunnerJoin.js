// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import { usePyodide } from "./PyodideContext";
import CodeEditor from "./CodeEditor";

/**
 * A small code editor that can run Python code, like a row in a Jupyter notebook;
 * this variant is used for the table join (i.e., `pd.merge()`) code
 */
export default function PythonRunner({startingCode, secretDf={}, codeRows=6, codeCols=50}) {
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
      const initCode = `
import pandas as pd
import numpy as np
df2 = pd.DataFrame(${JSON.stringify(secretDf.data)}, columns=${JSON.stringify(secretDf.columns)})
      `.trim().replaceAll("true", "True").replaceAll("false", "False");
      console.log(initCode);
      await pyodide.runPythonAsync(initCode, { globals: namespace });
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
