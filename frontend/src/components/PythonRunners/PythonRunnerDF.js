// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import React, { useState, useEffect } from 'react';
import { usePyodide } from "./PyodideContext";
import CodeEditor from "./CodeEditor";

/**
 * A small code editor that can run Python code, like a row in a Jupyter notebook;
 * this variant is used for showing dataframes: the initial dataframe being joined,
 * the preview of the existing columns, and the missing data rows;
 * the editor area may be hidden from view to prevent the user from manipulating the df,
 * or the whole thing may be hidden to just set Python variables on the page
 */
export default function PythonRunnerDF({df, df_name='df2', numHeadRows=5, codeRows=6, hideTextArea=false, hidden=false}) {
  const kernel = usePyodide();
  const [code, setCode] = useState("*** Initializing... ***"); // we'll fill this after preload
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(true);

  // PRELOAD df from backend
  useEffect(() => {
        /**
         * Pre-load the dataframe as a Python variable for the current page
         */
        const preloadData = async () => {
        if (!kernel) return;

        try {
          // ✅ Destructure inside the hook
          const { pyodide, namespace } = kernel;

          var data_slice = structuredClone(df.data);
          if (!hidden) {
            data_slice = data_slice.slice(0,15);
          }

          // setCode("*** Initializing... ***");
          // setRunning(true);

          const initCode = `
import pandas as pd
import numpy as np
#pd.reset_option("all")
#pd.set_option("display.max_columns", 4)
#pd.set_option("display.width", 100)

${df_name} = pd.DataFrame(${JSON.stringify(data_slice)}, columns=${JSON.stringify(df.columns)})
          `.trim().replaceAll("true", "True").replaceAll("false", "False");
          console.log(initCode);
          await pyodide.runPythonAsync(initCode, { globals: namespace });
          const result0 = await pyodide.runPythonAsync(`${df_name}.head(${numHeadRows})`, { globals: namespace });
          if (numHeadRows !== 5) {
            setCode(`${df_name}.head(${numHeadRows})`);
          } else {
            setCode(`${df_name}.head()`);
          }
          setOutput(result0?.toString() ?? "(no output)");
          setRunning(false);
          // runCode();

        } catch (err) {
          setOutput(err.toString());
          setRunning(false);
        }

        }; /*  END  preloadData()  */

        preloadData();
  }, [kernel, df, df_name, numHeadRows, hidden]);

  /**
   * Run the Python code from the editor area
   */
  const runCode = async () => {
    try {
      setOutput("");
      setRunning(true);
      const result = await pyodide.runPythonAsync(code, { globals: namespace });
      setOutput(result?.toString() ?? "(no output)");
    } catch (err) {
      setOutput(err.toString());
    } finally {
      setRunning(false);
    }
  };

  if (!kernel) {
    return <div>Loading Python...</div>;
  }

  const { pyodide, namespace } = kernel;

  return (
    <div style={{display: hidden? "none" : "block"}}>
      {/* The code editor area, which may be hidden */}
      {!hideTextArea && (
        <>
        <CodeEditor
          value={code}
          onChange={setCode}
          rows={codeRows}
          cols={50}
        />
        <br />
        {/* The 'Run' button */}
        <button onClick={runCode} disabled={running}>
          {running ? "Running..." : "Run"}
        </button>
        </>
      )}
      {/* The code output area */}
      <pre>{output}</pre>
    </div>
  );
}
