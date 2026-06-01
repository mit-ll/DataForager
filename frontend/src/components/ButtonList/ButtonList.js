// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';

// Helpful map to show nicer-formatted source names
const sourceMap = {
    datacommons: "DataCommons",
    wikidata: "Wikidata",
    kaggle: "Kaggle",
    local: "Local File Upload"
};

/**
 * Helper function to compute details that will be shown
 * when the button is expanded
 */
const getDetails = (obj) => {
    if (obj.source === "wikidata") {
        return (
        <>
        <p>Data type: {obj.Data_Type && obj.Data_Type.split("#").pop()}</p>
        <p>View this attribute's webpage <a href={"https://www.wikidata.org/wiki/Property:" + obj.Property_ID} target='_blank' rel="noreferrer">here</a>.</p>
        </>
        );
    } else if (obj.source === "datacommons") {
        return (
        <>
        <p>Data type: {(obj.Data_Type && obj.Data_Type.length > 0) ? obj.Data_Type.charAt(0).toUpperCase() + obj.Data_Type.slice(1) : "Number"}</p>
        <p>View this attribute's webpage <a href={"https://datacommons.org/browser/" + obj.Property_ID} target='_blank' rel="noreferrer">here</a>.</p>
        </>
        );
    } else if (obj.source === "kaggle") {
        return (
        <>
        <p>View this dataset's Kaggle page <a href={"https://www.kaggle.com/datasets/" + obj.ref} target='_blank' rel="noreferrer">here</a>.</p>
        {obj.file && <p>The file with the desired data is: {obj.file.split("/").pop().replace(/(\.csv).*$/, '$1')}</p>}
        </>
        );
    } else if (obj.source === "web") {
        return (
        <>
        <p>View the download page from the organization <a href={obj.org_url} target='_blank' rel="noreferrer">here</a>.</p>
        <p>The direct dataset download link is <a href={obj.url} target='_blank' rel="noreferrer">here</a>.</p>
        </>
        );
    } else if (obj.source === "local") {
        return (
        <>
        <p>You uploaded this file from your local machine.</p>
        </>
        );
    } else {
        return;
    }
}

/**
 * Component for a subsection of a ButtonListWrapper,
 * i.e., a ButtonListWrapper contains 1+ ButtonList(s);
 * this is where the buttons themselves are rendered
 */
const ButtonList = ({ objects, variant = "default", handleAction }) => {
  const [expandedIndex, setExpandedIndex] = useState(null); // The index of the button that is expanded to show details, if any

  /**
   * Function to expand a button at a certain index to show details
   */
  const toggle = (idx) => {
    setExpandedIndex(prev => (prev === idx ? null : idx));
  };

  return (
    <>
      {/* For each object (KG attribute or Web/Kaggle data source...) */}
      {objects.map((obj, idx) => {
        // console.log(obj);
        const isExpanded = expandedIndex === idx;
        const label = obj.Label || obj.title || obj.name || obj.path.split("/").pop().replace(/(\.csv).*$/, '$1') || "Untitled";
        const subinfo = sourceMap[obj.source] || obj.organization || obj.source || "Unknown";

        return (
          <div key={idx}>
            <div className={`button-row ${variant}`}>
              <div className="left">
                {/* Button to expand and show detail */}
                <button className="arrow" onClick={() => toggle(idx)}>
                  {isExpanded ? "▼" : "▶"}
                </button>
                {/* The main info that is always displayed for the button */}
                <div className="label-block">
                  <div className="label">{variant === "ai" ? `${label} ✨` : label}</div>
                  <div className="subinfo">{subinfo}</div>
                </div>
              </div>
              {/* Button to add this attribute or data source to the current dataset */}
              <div className="right">
                <button onClick={() => handleAction(obj)}>Add</button>
              </div>
            </div>
            {/* Conditionally show these details if the button is expanded */}
            {isExpanded && (
              <div className="details">
                {getDetails(obj) || "No additional details."}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

export default ButtonList;
