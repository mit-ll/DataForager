// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import React, { useEffect, useRef } from 'react';
import ButtonList from './ButtonList';

/**
 * Component that wraps around 1+ ButtonList(s)
 * to make a holistic list for display to the user;
 * used ONLY for Kaggle/Web
 */
const ButtonListWrapperWeb = ({ objects, joinDatacommonsProperty, joinWikidataProperty, kaggleDownload, joinTable }) => {
  const buttonListWrapperRef = useRef(null);
 
  // Scroll to top when the objects to be displayed in the component change
  useEffect(() => {
    if (buttonListWrapperRef.current) {
      buttonListWrapperRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [objects]);

  const sourceFunctions = {
    datacommons: joinDatacommonsProperty,
    wikidata: joinWikidataProperty,
  };

  /**
   * Helper function so we know what to do when the user clicks "Add" for any data source type
   */
  const handleAction = (obj) => {
    const { source } = obj;
    if (source === 'kaggle' && "ai_search_result" in obj) {
      var k_params = {'dataset_ref': obj.ref, 'dataset_title': obj.title, 'search_keyword': obj.search_keyword, 'file_choice_explanation': obj.file_choice_explanation};
      if ("file_choice_explanation" in obj) {
        k_params['file_choice_explanation'] = obj.file_choice_explanation;
      }
      return joinTable(obj.file, { topic: obj.search_keyword, source: "Kaggle", kaggle_params: k_params});   
    } 
    if (source === 'kaggle' && !("ai_search_result" in obj)) return kaggleDownload(obj);
    if (source === 'web') return joinTable(obj.path, { topic: obj.attr_query, source: obj.organization, web_params: {url: obj.url, org_url: obj.org_url} });
    if (source === 'test') return joinTable(obj.path, { topic: obj.topic, source: "TEST" });
    return sourceFunctions[source]?.(obj);
  };

  // Divide up results so we can put them in different ButtonLists
  const ai_recs = objects.filter(obj => "ai_search_result" in obj);
  // console.log(objects);
  // console.log(ai_recs);
  const reg_results = objects.filter(obj => !("ai_search_result" in obj));

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

      {/* All other regular options at the bottom */}
      {reg_results.length > 0 && (
        <ButtonList
          objects={reg_results}
          variant="default"
          handleAction={handleAction}
        />
      )}
    </div>
  );
};

export default ButtonListWrapperWeb;