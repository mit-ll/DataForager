// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import React, { useEffect, useRef } from 'react';
import ButtonList from './ButtonList';

/**
 * Component that wraps around 1+ ButtonList(s)
 * to make a holistic list for display to the user;
 * used for all lists EXCEPT Kaggle/Web
 */
const ButtonListWrapper = ({ objects, searchResultObjects = [], joinDatacommonsProperty, joinWikidataProperty, kaggleDownload, joinTable }) => {
  const buttonListWrapperRef = useRef(null);
  const prevObjectsRef = useRef([]);

  useEffect(() => {
    const prev = prevObjectsRef.current;
    const prevIds = new Set(prev.map(obj => obj.Property_ID || obj.path || obj.name));
    const currentIds = new Set(objects.map(obj => obj.Property_ID || obj.path || obj.name));

    const hasMeaningfulChange = (
      prev.length !== objects.length ||
      [...prevIds].some(id => !currentIds.has(id)) ||
      [...currentIds].some(id => !prevIds.has(id))
    );

    // Scroll to top when the objects to be displayed in the component change
    if ((hasMeaningfulChange || searchResultObjects.length > 0) && buttonListWrapperRef.current) {
      buttonListWrapperRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }

    prevObjectsRef.current = objects;
  }, [objects, searchResultObjects]);

  const sourceFunctions = {
    datacommons: joinDatacommonsProperty,
    wikidata: joinWikidataProperty,
  };

  /**
   * Helper function so we know what to do when the user clicks "Add" for any data source type
   */
  const handleAction = (obj) => {
    const { source } = obj;
    if (source === 'kaggle') return kaggleDownload(obj);
    if (source === 'web') return joinTable(obj.path, { topic: obj.attr_query, source: obj.organization, web_params: {url: obj.url, org_url: obj.org_url} });
    if (source === 'test') return joinTable(obj.path, { topic: obj.topic, source: "TEST" });
    if (source === 'local') return joinTable(obj.path, { topic: obj.topic, source: "Local" });
    return sourceFunctions[source]?.(obj);
  };

  // Divide up results so we can put them in different ButtonLists;
  // only relevant for for KGs (recall Web/Kaggle have thier own list wrapper)
  const aiIds = new Set(searchResultObjects.filter(obj => obj.ai_choice).map(obj => obj.Property_ID));
  const searchIds = new Set(searchResultObjects.map(obj => obj.Property_ID));
  const ai_recs = objects.filter(obj => aiIds.has(obj.Property_ID));
  const reg_results = objects.filter(obj => searchIds.has(obj.Property_ID) && !aiIds.has(obj.Property_ID));

  return (
    <div className="buttonListWrapper" ref={buttonListWrapperRef} style={{borderBottomWidth: objects.length > 0 ? '1px' : '0px'}}>
      {/* AI recommended things on top */}
      {ai_recs.length > 0 && (
        <ButtonList
          objects={ai_recs}
          variant="ai"
          handleAction={handleAction}
        />
      )}

      {/* Regular search results not recommneded by AI in the middle */}
      {reg_results.length > 0 && (
        <ButtonList
          objects={reg_results}
          variant="result"
          handleAction={handleAction}
        />
      )}

      {/* All other regular options at the bottom */}
      {objects.length > 0 && (
        <ButtonList
          objects={objects}
          variant="default"
          handleAction={handleAction}
        />
      )}
    </div>
  );
};

export default ButtonListWrapper;