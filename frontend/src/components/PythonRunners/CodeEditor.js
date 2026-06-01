// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

// CodeEditor.js
import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";

/**
 * A component that exists just for styling of the code snippet editors
 * on the history/details tab pages
 */
export default function CodeEditor({
  value,
  onChange,
  rows = 6,
  cols = 50,
  readOnly = false,
}) {
  const widthEm = cols * 0.6;
//   const heightEm = rows * 1.6;

  return (
    <div
      style={{
        resize: "horizontal",        // allows user to resize
        overflow: "auto",            // necessary for resize handles to show
        width: `${widthEm}em`,
        // height: `${heightEm}em`,
        border: "1px solid darkgray",
      }}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={[python()]}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          tabSize: 4,
        }}
        style={{
          height: "100%",
          fontSize: "1em",
          fontFamily: "monospace",
        }}
      />
    </div>
  );
}
