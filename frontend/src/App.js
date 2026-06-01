// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import Sidebar from './components/Sidebar.js';
import DataTable from './components/DataTable';
import DetailsTabPage from './components/DetailsTabPage.js';
import D3Histogram from './components/D3Charts/D3Histogram.js';
import D3Choropleth from './components/D3Charts/D3Choropleth.js'
import D3BarChart from './components/D3Charts/D3BarChart.js';
import D3Scatterplot from './components/D3Charts/D3Scatterplot.js';
import D3Boxplot from './components/D3Charts/D3Boxplot.js';
import ButtonListWrapper from './components/ButtonList/ButtonListWrapper.js';
import ButtonListWrapperWeb from './components/ButtonList/ButtonListWrapperWeb.js';
// import { useContainerSize } from './hooks/useContainerSize.js';

/**
 * Where the main app components live;
 * the basic setup of the whole app
 */
function App() {
  // State
  const [datasetMode, setDatasetMode] = useState(null) // "counties" or "airports"
  const [data, setData] = useState([]); // the data rows in the data table
  const [dataColumns, setDataColumns] = useState([]); // the columns of the data in the data table
  const [df1Data, setDf1Data] = useState({}); // small dataset minimally representing the current dataset we are joining into, for history tabs
  const [joinedTabs, setJoinedTabs] = useState([]); // history tabs representing joined KG attributes or CSV files
  const [activeTab, setActiveTab] = useState('main'); // history tab currently being viewed (or just the Main view)
  const [activeSubTab, setActiveSubTab] = useState('datacommons'); // 'local', 'web' (Web + Kaggle), or 'datacommons' (all KGs)
  const [activeVis, setActiveVis] = useState('boxplot'); // Which vis is currently being shown (assuming there are some attributes)
  const [webSourcesDEBUG, setWebSourcesDEBUG] = useState([]); // DEPRECATED
  const [testFiles, setTestFiles] = useState([]); // the test data files from the backend
  const [webDatasets, setWebDatasets] = useState([]); // DEPRECATED
  const [kaggleDatasets, setKaggleDatasets] = useState([]); // All Web datasets (at first Kaggle, but Web datasets are added here)
  const [wikidataProperties, setWikidataProperties] = useState([]); // List of joinable properties from Wikidata
  const [datacommonsProperties, setDatacommonsProperties] = useState([]); // List of joinable properties from DataCommons
  const [knowledgeGraphProperties, setKnowledgeGraphProperties] = useState([]); // Calculated based on a combo of Wiki and DC properties
  const [statusMessages, setStatusMessages] = useState([{message: "Add data attributes to begin.", terminated: true}]); // Bottom-left status msgs
  const [hiddenColumns, setHiddenColumns] = useState(new Set()); // List of data columns that the user wants to hide from view
  const [columnToTabMap, setColumnToTabMap] = useState({}); // Object mapping data column names to history tabs (for data table interactivity)
  const [searchResultsKG, setSearchResultsKG] = useState([]); // Search results for KG attributes 
  const [visAttribute, setVisAttribute] = useState(''); // Current attribute being visualized in a chart
  const [availableAttributes, setAvailableAttributes] = useState([]); // Available attributes that are valid for a chart
  const [barDirection, setBarDirection] = useState('top'); // Whether we use ascending or descending order for the bar chart
  const [barCount, setBarCount] = useState(20); // How many top/bottom results we see in the bar chart
  const [yAttributeScatter, setYAttributeScatter] = useState(''); // Y attribute for the scatterplot
  const [clipOutliersHistogram, setClipOutliersHistogram] = useState(false); // Whether or not to clip outliers in the histogram
  const [numSearchesWaiting, setNumSearchesWaiting] = useState(null); // Number of Web searches remaining to complete
  // const [numNewSearchResults, setNumNewSearchResults] = useState(0);
  const [newSearchResults, setNewSearchResults] = useState([]); // How many new Web data sources were found on the last search
  const [injectedMessage, setInjectedMessage] = useState(null); // Utility state variable to 'inject' a message into the Sidebar chat history
  // 
  const [webSearchRunning, setWebSearchRunning] = useState(false); // Indicator for whether Web search is running
  const [kSearchRunning, setKSearchRunning] = useState(false); // Indicator for whether Kaggle search is running
  const [kgSearchRunning, setKgSearchRunning] = useState(false); // Indicator for whether KG search is running
  const [isFileUploading, setIsFileUploading] = useState(false); // Indicator fof whether a file upload is being processed
  // Hooks
  // const [visPanelRef, visSize] = useContainerSize();
  // Refs
  const webSearchInputRef = useRef(null);
  const kSearchInputRef = useRef(null);
  const kgSearchInputRef = useRef(null);
  const dataIdsRef = useRef(new Set());
  const fileInputRef = useRef(null);
  const tabRefs = useRef({});

  // const testData = Array.from({ length: 100 }, () => ({
  //   value: Math.floor(Math.random() * 100),
  //   age: Math.floor(Math.random() * 60) + 20,
  //   score: Math.floor(Math.random() * 50) + 50,
  // }));


  // Update attribute options automatically when `data` changes
  useEffect(() => {
    if (data.length > 0) {
      const keys = Object.keys(data[0]).filter(key =>
        data.some(row => typeof row[key] === 'number')
      ).filter(key => !hiddenColumns.has(key));
      setAvailableAttributes(keys);

      // Safe check for valid attribute
      setVisAttribute(current => keys.includes(current) ? current : keys[0]);

      setYAttributeScatter(current => {
        // console.log(current);
        if (current && current !== "" && current !== keys[0]) return current; // keep current if it's already set
        if (keys.length > 1) {
          return (!current || current === keys[0]) ? keys[1] : keys[0];
        } else {
          return keys[0];
        }
      });

    }
  }, [data, hiddenColumns]);

  // Manage status message updates as Web search progresses
  useEffect(() => {
    if (numSearchesWaiting > 0) {
      setStatusMessages(prev => [...prev, {message: `Identifying promising datasets... ${numSearchesWaiting.toString()} more to check.`, terminated: false}]);
    } else if (numSearchesWaiting != null && !webSearchRunning && !kSearchRunning) {
      var word = newSearchResults.length !== 1 ? "datasets" : "dataset";
      setStatusMessages(prev => [...prev, {message: `${newSearchResults.length} new Web ${word} found.`, terminated: true}]);
      if (newSearchResults.length > 0) {
        setInjectedMessage({role: 'assistant', content: `I found ${newSearchResults.length} new ${word} on the Web. Take a look!`, timestamp: Date.now()});
      } else {
        setInjectedMessage({role: 'assistant', content: `I didn't find any new datasets on the Web this time.`, timestamp: Date.now()});
      }
      setNumSearchesWaiting(null);
    }
  }, [numSearchesWaiting, newSearchResults, webSearchRunning, kSearchRunning]);

  // Set test files
  useEffect(() => {
    if (datasetMode === "counties") {
      axios.get('http://localhost:5000/get-test-files')
      .then(response => {
        var test_files = response.data.test_files;
        // console.log(test_files);
        setTestFiles(test_files);
      });
    } else {
      setTestFiles([]);
    }
  }, [datasetMode]);


  // Set dataset
  useEffect(() => {
    axios.get('http://localhost:5000/get-dataset')
    .then(response => {
      setDatasetMode(response.data.dataset);
    });
  }, []);


  /**
   * Set search results after they have already been retrieved
   */
  const setSearchResultsKGHelper = (attributes) => {
    if (attributes.length > 0) {
      setSearchResultsKG(attributes);
      console.log(searchResultsKG);
      setActiveSubTab('datacommons');
      setStatusMessages(prev => [...prev, {message: 'KG attribute search complete.', terminated: true}]);
    }
  }

  /**
   * Change history tab and ensure the one we want to select scrolls into view
   */
  const setActiveTabAndScroll = (tabId) => {
    setActiveTab(tabId);

    // Use requestAnimationFrame in case it's not in DOM yet
    requestAnimationFrame(() => {
      const tabEl = tabRefs.current[tabId];
      if (tabEl) {
        const container = tabEl.parentElement; // assuming tab bar is the parent
        const tabRect = tabEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        if (tabRect.left < containerRect.left || tabRect.right > containerRect.right) {
          tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      }
    });
  };

  /**
   * Set the active visualization and attribute(s) based on a specification
   */
  const makeVis = (spec) => {
    setActiveVis(spec['vis_type']);
    // console.log(spec);
    setVisAttribute(spec['attributes'][0]);
    if (spec['vis_type'] === "scatterplot") {
      setYAttributeScatter(spec['attributes'][1]);
    }
  }

  /**
   * Helper function for mixing the DC and Wiki attributes in a single list
   */
  function frontLoadedInterleave(listA, listB) {
    const maxLength = Math.max(listA.length, listB.length);
    const result = [];

    for (let i = 0; i < maxLength; i++) {
      if (i < listA.length) result.push(listA[i]);
      if (i < listB.length) result.push(listB[i]);
    }

    return result;
  }

  /**
   * Helper function to make sure history tab names are not too long
   */
  function getShortTabTitle(title) {
    var spl = title.split(" (");
    var first_part = spl[0];
    var second_part = spl[1].slice(0, -1);
    if (second_part.length >= 23) {
      second_part = second_part.slice(0, 20).trim() + "..."
    }
    return first_part + " (" + second_part + ")";
  }

  /**
   * Handle when the user uploads their own local CSV data file to join
   */
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsFileUploading(true);
    setStatusMessages(prev => [...prev, {message: 'Uploading file...', terminated: false}]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      axios.post("http://localhost:5000/upload-file", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      })
      .then(response => {
        console.log("Upload complete:", response.data);
        setTestFiles(prev => [response.data.file_obj, ...prev])
        setIsFileUploading(false);
        setStatusMessages(prev => [...prev, {message: 'File upload complete.', terminated: true}]);
      });
    } catch (error) {
      console.error("Upload error:", error);
      setIsFileUploading(false);
      setStatusMessages(prev => [...prev, {message: 'File upload failed.', terminated: true}]);
    }
  };

  // Get current dataset from the backend and set the frontend data table state accordingly
  const getAndSetData = async() => {
    axios.get('http://localhost:5000/get-current-data')
      .then(response => {
        // console.log(response);
        if (typeof response.data === "string") {
          var thing = JSON.parse(response.data);
          setData(thing.rows);
          setDataColumns(thing.columns);
        } else {
        setData(response.data.rows);
        setDataColumns(response.data.columns);
        }
        // setLoading(false);
      });
  }

  /**
   * Initiate Web and Kaggle search for datasets based on the user's query
   */
  const searchForDatasets = async(search_query, from_search_button=false) => {
    setActiveSubTab('kaggle');
    // setNumNewSearchResults(0);
    setNewSearchResults([]);
    setWebSearchRunning(true);
    if (from_search_button) {
      var user_message = {role:  'user', content: `Search the web for data about ${search_query}.`, timestamp: Date.now()};
      setInjectedMessage(user_message);
      var messages = [{ role: 'system', content: 'You are a helpful assistant.' }, user_message];
      try {
        await axios.post("http://localhost:5000/chat-with-assistant", {messages: messages, vis_attributes: []})
        .then(response => {
          const data = response.data;
          setInjectedMessage({role: "assistant", content: data.reply, timestamp: Date.now()});
          if ("function" in data && data.function === "search_web") {
            search_query = data.web_query;
          } else {
            console.log("** SOMETHING WENT WRONG **");
          }
        });
      } catch {
        console.log("** SOMETHING WENT WRONG **");
        setInjectedMessage({role: "assistant", content: `Sure, I'll initiate a Web search for data about ${search_query}.`, timestamp: Date.now()});
      }
      // setInjectedMessage({role: "assistant", content: `Let me initiate a web search for data about ${search_query}.`});
    }
    console.log(search_query);
    await Promise.all([
      getWebSources(search_query),
      searchKaggleDatasets(search_query)
    ]);
    // setWebSearchRunning(false);
  }

  /**
   * Search for data sources using the Kaggle API via the backend, and set state with the results
   */
  const searchKaggleDatasets = useCallback( async(search_query) => {
    setKSearchRunning(true);
    var startupMode = false;
    if (search_query.trim().length === 0) {
      search_query = "US "+datasetMode;
      startupMode = true;
    }
    axios.get('http://localhost:5000/kaggle-dataset-search',
              {params: {'keyword': search_query, 'startup_mode': startupMode}})
    .then(response => {
      var datasets = response.data;
      datasets.forEach(obj => {obj.search_keyword = search_query});
      if (startupMode) {
        setKaggleDatasets(datasets);
        setKSearchRunning(false);
      } else {
        setNumSearchesWaiting(old => old === null? datasets.length : old + datasets.length);
        for (var dataset of datasets) {
          getDataFromKaggle(dataset);
        }
        setKSearchRunning(false);
      }
    });
  }, [setKSearchRunning, setKaggleDatasets, setNumSearchesWaiting, datasetMode]);

  // On startup, get the relevant Kaggle datasets for the current dataset mode/topic
  useEffect(() => {
    if (datasetMode) {
      searchKaggleDatasets("");
    } else {
      setKaggleDatasets([]);
    }
  }, [searchKaggleDatasets, datasetMode]);

  /**
   * Initiate a download and join of a dataset from Kaggle, 
   * when the user clicks on a "default" (not AI suggested) Kaggle dataset
   */
  const kaggleDownload = async(dataset_obj) => {
    if (dataIdsRef.current.has(dataset_obj.ref)) {
      setStatusMessages(prev => [...prev, {message: 'Dataset "' + dataset_obj.title + '" has already been joined.', terminated: true}]);
      return;
    }
    dataIdsRef.current.add(dataset_obj.ref);
    setStatusMessages(prev => [...prev, {message: 'Downloading dataset...', terminated: false}]);
    var kaggle_params = {'dataset_ref': dataset_obj.ref, 'dataset_title': dataset_obj.title, 'search_keyword': dataset_obj.search_keyword};
    axios.get('http://localhost:5000/kaggle-dataset-download',
              {params: kaggle_params, startup_mode: true})
      .then(response => {
        setStatusMessages(prev => [...prev, {message: 'Dataset downloaded.', terminated: true}]);
        var filepath = response.data.filepath;
        if (filepath.length === 0){
          return;
        }
        if ("file_choice_explanation" in response.data) {
          kaggle_params["file_choice_explanation"] = response.data.file_choice_explanation;
        }
        // console.log(filepath);
        joinTable(filepath, {topic: dataset_obj.title, source: "Kaggle", kaggle_params: kaggle_params});
      });
  }

  /**
   * Populate an AI search result for a Kaggle dataset (if it turns out to be a good source)
   */
  const getDataFromKaggle = async(dataset) => {
    var params = {dataset_ref: dataset.ref, dataset_title: dataset.title, search_keyword: dataset.search_keyword, startup_mode: false}
    axios.get('http://localhost:5000/kaggle-dataset-download', {params: params})
      .then(response => {
        var filepath = response.data.filepath;

        setNumSearchesWaiting(oldNum => oldNum - 1);

        if (filepath.length === 0) {
          return;
        }
        dataset['file'] = filepath;
        dataset['ai_search_result'] = true;
        if ("file_choice_explanation" in response.data) {
          dataset["file_choice_explanation"] = response.data.file_choice_explanation;
        }

        setKaggleDatasets(prev => {
          const empty = filepath === 0;
          // const alreadyExists = false;
          const alreadyExists = prev.some(item => 'file' in item && item.file.trim() === filepath.trim());
          if (!(empty || alreadyExists)) {
            // setNumNewSearchResults(prev => prev + 1);
            setNewSearchResults(prev => [dataset, ...prev])
          } 
          return (empty || alreadyExists) ? prev : [dataset, ...prev];
        });
    })
  }

  /**
   * Search the KG attribute lists based on the user's query
   */
  const searchKGs = async(query) => {
    if (query === "") {
      setSearchResultsKG([]);
      return;
    }
    setKgSearchRunning(true);
    // Ask chatbot
    var user_message = {role:  'user', content: `Search the knowledge graphs for data attributes about ${query}.`, timestamp: Date.now()};
    setInjectedMessage(user_message);
    var messages = [{ role: 'system', content: 'You are a helpful assistant.' }, user_message];
    try {
      await axios.post("http://localhost:5000/chat-with-assistant", {messages: messages, vis_attributes: []})
      .then(response => {
        const data = response.data;
        setInjectedMessage({role: "assistant", content: data.reply, timestamp: Date.now()});
        if ("function" in data && data.function === "search_kg_attributes") {
          setSearchResultsKGHelper(data.all_results);
        } else {
          console.log("** SOMETHING WENT WRONG **");
        }
        setKgSearchRunning(false);
      });
    } catch {
      // Bypass chatbot if there's an issue
      console.log("** SOMETHING WENT WRONG **");
      axios.get('http://localhost:5000/search-knowledge-graphs', {params: {'query': query}})
      .then(response => {
        // console.log(response.data);
        setSearchResultsKGHelper(response.data.all_results);
        setKgSearchRunning(false);
        setInjectedMessage({role: "assistant", content: `Sure, here's what I found for ${query}.`, timestamp: Date.now()});
      })
    }
  }

  /**
   * Join a new data attribute from Wikidata
   */
  const joinWikidataProperty = async(property_obj) => {
    if (dataIdsRef.current.has(property_obj.Property_ID)) {
      setStatusMessages(prev => [...prev, {message: 'Attribute "' + property_obj.Label + '" is already in the dataset.', terminated: true}]);
      return;
    }
    dataIdsRef.current.add(property_obj.Property_ID);
    setStatusMessages(prev => [...prev, {message: 'Joining attribute "' + property_obj.Label + '"...', terminated: false}]);
    axios.get('http://localhost:5000/wikidata-join-property', {params: {'property_id': property_obj.Property_ID, 'property_label': property_obj.Label}})
      .then(response => {
        var joinStatus = response.data.warnings.status;
        var doneMessage = `Join of attribute "${property_obj.Label}" is complete.\nMissing data for ${joinStatus.num_null_rows} ${joinStatus.num_null_rows === 1? "row" : "rows"} (${(joinStatus.pct_missing*100).toFixed(2)}%).`;
        setStatusMessages(prev => [...prev, {message: doneMessage, terminated: true}]);
        console.log(response.data);
        var newTab = {id: property_obj.Property_ID, type: "knowledge_graph", obj: property_obj, "source": "Wikidata", history: response.data.history};
        newTab['title'] = property_obj.Label + " (Wikidata)"
        newTab['joinStatus'] = joinStatus;
        setJoinedTabs(prev => [...prev, newTab]);
        setColumnToTabMap(prev => ({
          ...prev,
          [property_obj.Label]: structuredClone(newTab)
        }));
        getAndSetData();
      })
  }

  /**
   * Join a new data attribute from DataCommons
   */
  const joinDatacommonsProperty = async(property_obj) => {
    if (dataIdsRef.current.has(property_obj.Property_ID)) {
      setStatusMessages(prev => [...prev, {message: 'Attribute "' + property_obj.Label + '" is already in the dataset.', terminated: true}]);
      return;
    }
    dataIdsRef.current.add(property_obj.Property_ID);
    setStatusMessages(prev => [...prev, {message: 'Joining attribute "' + property_obj.Label + '"...', terminated: false}]);
    axios.get('http://localhost:5000/datacommons-join-property', {params: {'property_id': property_obj.Property_ID, 'property_label': property_obj.Label}})
      .then(response => {
        var joinStatus = response.data.warnings.status;
        var doneMessage = `Join of attribute "${property_obj.Label}" is complete.\nMissing data for ${joinStatus.num_null_rows} ${joinStatus.num_null_rows === 1? "row" : "rows"} (${(joinStatus.pct_missing*100).toFixed(2)}%).`;
        setStatusMessages(prev => [...prev, {message: doneMessage, terminated: true}]);
        console.log(response.data);
        var newTab = {id: property_obj.Property_ID, type: "knowledge_graph", obj: property_obj, "source": "DataCommons", history: response.data.history};
        newTab['title'] = property_obj.Label + " (DataCommons)"
        newTab['joinStatus'] = joinStatus;
        setJoinedTabs(prev => [...prev, newTab]);
        setColumnToTabMap(prev => ({
          ...prev,
          [property_obj.Label]: structuredClone(newTab)
        }));
        getAndSetData();
      })
  }

  /**
   * Get a list of promising data sources from OpenAI web search
   */
  const getWebSources = async(search_query) => {
    setWebSearchRunning(true);
    setStatusMessages(prev => [...prev, {message: "Searching for web sources...", terminated: false}]);
    axios.get('http://localhost:5000/get-sources', {params: {'attr_query': search_query}})
      .then(async response => {
        setNumSearchesWaiting(old => old === null? response.data.source_list.length : old + response.data.source_list.length);
        setWebSourcesDEBUG(response.data.source_list);
        const fetchPromises = response.data.source_list.map(obj =>
          getDataFromWebSource({ source: obj, attr_query: search_query })
        );
        await Promise.all(fetchPromises);
        setWebSearchRunning(false);
      });
  }

  /**
   * Helper function for getWebSources; here, we actually assess each individual source;
   * if the source seems like the data can reasonably be loaded & joined, add it to the Web list
   */
  const getDataFromWebSource = async(source) => {
    // `source` looks like {source: {"organization": ..., "url": ...}}
    var org_url;
    axios.post('http://localhost:5000/get-data-from-source', source)
      .then(response => {
        if (Object.keys(response.data).length === 0) {
          return;
        }
        // `response.data` looks like {"url": ..., "text_to_click": ..., "explanation": ...}
        var params = {source: response.data}
        org_url = response.data.url;
        // console.log(response.data);
        return axios.post('http://localhost:5000/get-csv-from-page', params)
      })
      .then(response2 => {
        // console.log(response2);
        return axios.get('http://localhost:5000/test-load-file', {params: {'file': response2.data.url, 'attr_query': source.attr_query}})
      })
      .then(response3 => {
        setNumSearchesWaiting(oldNum => oldNum - 1);
        // console.log(response3);
        console.log(response3.data.path);
        // var found = webDatasets.some(source => source.path === response3.data.path);
        // console.log(found);
        response3.data['attr_query'] = source.attr_query;
        response3.data['organization'] = source.source.organization;
        response3.data['source'] = 'web';
        response3.data['org_url'] = org_url;
        response3.data['ai_search_result'] = true;
        // setWebDatasets(prev => {
        //   const empty = response3.data.path.length === 0;
        //   const alreadyExists = prev.some(item => item.path.trim() === response3.data.path.trim());
        //   if (!(empty || alreadyExists)) setNumNewSearchResults(prev => prev + 1);
        //   return (empty || alreadyExists) ? prev : [...prev, response3.data];
        // });
        
        setKaggleDatasets(prev => {
          const empty = response3.data.path.length === 0;
          const alreadyExists = prev.some(item => 'path' in item && item.path.trim() === response3.data.path.trim());
          if (!(empty || alreadyExists)) {
            // setNumNewSearchResults(prev => prev + 1);
            setNewSearchResults(prev => [response3.data, ...prev]);
          }
          return (empty || alreadyExists) ? prev : [response3.data, ...prev];
        });
      });
  }

  // Reset the current data table, on startup and when changing dataset mode
  // ** MAY WANT TO DEACTIVATE THIS DURING USER STUDIES? **
  useEffect(() => {
    axios.get('http://localhost:5000/reset-data')
      .then(() => getAndSetData());
  }, [datasetMode]);

  // Get the small, static dataset template for join demonstration in history tabs,
  // on startup and when changing dataset mode
  useEffect(() => {
    axios.get('http://localhost:5000/get-df1-template-data')
      .then(response => {
        setDf1Data(response.data.df1);
        console.log(response.data.df1);
      });
  }, [datasetMode]);

  // Get the list of Wikidata properties and set state
  useEffect(() => {
    axios.get('http://localhost:5000/wikidata-get-properties')
      .then(response => {
        console.log(response);
        var properties_list = response.data.properties;
        setWikidataProperties(properties_list)
      });
  }, [datasetMode]);

  // Get the list of DataCommons properties and set state
  useEffect(() => {
    if (datasetMode === "counties") {
      axios.get('http://localhost:5000/datacommons-get-properties')
        .then(response => {
          console.log(response);
          var properties_list = response.data.properties;
          setDatacommonsProperties(properties_list);
        });
    } else {
      setDatacommonsProperties([]);
    }
  }, [datasetMode]);

  // Set the combined KG properties list based on Wiki and DC property lists
  useEffect(() => {
    const combined = frontLoadedInterleave(wikidataProperties, datacommonsProperties);
    setKnowledgeGraphProperties(combined);
    console.log(combined);
  }, [datacommonsProperties, wikidataProperties]);

  /**
   * Join a Web search result or AI-suggested (i.e., pre-vetted) Kaggle dataset
   * into the current data table; takes multiple (pre-processing) steps
   */
  const joinTable = async(file, {topic = "the main topic of the dataset", source = "", kaggle_params = {}, web_params = {}} = {}) => {
    var file_clean = file.split("/").pop().replace(/(\.csv).*$/, '$1');
    if (dataIdsRef.current.has(file_clean)) {
      setStatusMessages(prev => [...prev, {message: 'Dataset "' + file_clean + '" has already been joined.', terminated: true}]);
      return;
    }
    dataIdsRef.current.add(file_clean);
    var newTab = {id: file, responses: [], type: "file"};
    setStatusMessages(prev => [...prev, {message: 'Loading data table...', terminated: false}]);
    axios.get('http://localhost:5000/load-table', {params: {'file': file}})
      .then(response1 => {
        console.log(response1.data);
        newTab.responses.push(response1.data);
        var message1;
        if ("response" in response1.data && response1.data.response.num_extra_rows > 0) {
          message1 = "Data table loaded. " + response1.data.response.num_extra_rows.toString() + " extra header row(s) removed.";
        } else {
          message1 = "Data table loaded.";
        }
        setStatusMessages(prev => [...prev, {message: message1, terminated: false}]);
        setStatusMessages(prev => [...prev, {message: "Checking data columns...", terminated: false}]);
        return axios.get('http://localhost:5000/check-columns', {params: {'topic': topic, 'file': file}});
      })
      .then(response2 => {
        console.log(response2.data);
        newTab.responses.push(response2.data);
        var message2;
        if ("response" in response2.data) {
          message2 = "Column check complete. Took a relevant subset of " + response2.data.response.col_list.length.toString() + " columns.";
        } else {
          message2 = "Column check complete.";
        }
        setStatusMessages(prev => [...prev, {message: message2, terminated: false}]);
        setStatusMessages(prev => [...prev, {message: "Checking if row aggregation is necessary...", terminated: false}]);
        return axios.get('http://localhost:5000/check-aggregation');
      })
     .then(response3 => {
        console.log(response3.data);
        newTab.responses.push(response3.data);
        var message3;
        if ("response" in response3.data) {
          message3 = "Row aggregation necessary. Aggregated based on the following columns: " + response3.data.response.columns.toString();
        } else {
          message3 = "No need to aggregate data rows.";
        }
        setStatusMessages(prev => [...prev, {message: message3, terminated: false}]);
        setStatusMessages(prev => [...prev, {message: "Joining data tables...", terminated: false}]);
        return axios.get('http://localhost:5000/join-table', {params: {'file': file}});
      })
      .then(response4 => {
        console.log(response4.data);
        if ("exception" in response4.data) {
          var error_msg = "ERROR: An exception occurred repeatedly when attempting to join the data.";
          setStatusMessages(prev => [...prev, {message: error_msg, terminated: true}]);
          return;
        }
        var res4 = {'response': response4.data.response};
        var hist = response4.data.history;
        newTab.responses.push(res4);
        newTab['history'] = hist;
        // 
        newTab['source'] = source;
        newTab['file_clean'] = file.split("/").pop().replace(/(\.csv).*$/, '$1');
        // 
        if (Object.keys(kaggle_params).length > 0) {
          newTab['dataset_ref'] = kaggle_params['dataset_ref'];
          newTab['dataset_title'] = kaggle_params['dataset_title'];
          newTab['title'] = newTab['dataset_title'] + " (" + source + ")";
          if ('file_choice_explanation' in kaggle_params) {
            newTab['file_choice_explanation'] = kaggle_params['file_choice_explanation'];
          }
        }
        if (Object.keys(web_params).length > 0) {
          newTab['url'] = web_params['url'];
          newTab['org_url'] = web_params['org_url'];
          newTab['title'] = newTab['file_clean'] + " (" + source + ")";
        }
        if (source === "Local") {
          newTab['title'] = newTab['file_clean'] + " (" + source + ")";
        }
        // 
        var joinStatus = response4.data.warnings.status;
        newTab['joinStatus'] = joinStatus;
        var message4 = `Join complete!\nFailed to join ${joinStatus.num_null_rows} ${joinStatus.num_null_rows === 1? "row" : "rows"} (${(joinStatus.pct_missing*100).toFixed(2)}%).`;
        setStatusMessages(prev => [...prev, {message: message4, terminated: true}]);
        // 
        setJoinedTabs(prev => [...prev, newTab]);
        // 
        var tabClone = structuredClone(newTab);
        var newColumns = Object.fromEntries(hist.final.columns.map(col => [col, tabClone]));
        setColumnToTabMap(prev => ({
          ...prev,
          ...newColumns
        }));
        // 
        getAndSetData();
      })
  };


  return (
    <div className="app-container">

      {/* The sidebar */}
      <Sidebar 
        setSearchResultsKG={setSearchResultsKGHelper} 
        getWebSources={searchForDatasets} 
        makeVis={makeVis} 
        visAttributes={availableAttributes} 
        statusMessages={statusMessages}
        injectedMessage={injectedMessage}
      />

      {/* Everything to the right of the sidebar */}
      <div className="main-content">

        {/* The 'history' tabs at the top of the interface */}
        <div className="tab-bar">
          <div className="main-tab-fixed">
            <button
              id="main-tab-button"
              onClick={() => setActiveTab('main')}
              className={activeTab === 'main' ? 'active-tab' : ''}
            >
              <i>Main</i>
            </button>
          </div>

          <div className="scrollable-tabs">
            {joinedTabs.map(tab => (
              <button
                key={tab.id}
                ref={el => tabRefs.current[tab.id] = el}
                onClick={() => setActiveTab(tab.id)}
                className={activeTab === tab.id ? 'active-tab' : ''}
              >
                {tab.title !== undefined ? getShortTabTitle(tab.title) : tab.id}
              </button>
            ))}
          </div>
        </div>

        {/* The "Main" tab (not looking at any attribute/file history) */}
        {activeTab === 'main' && (
          <>
            <h1>Data Table</h1>
            <DataTable 
              data={data} 
              columns={dataColumns} 
              columnToTabMap={columnToTabMap} 
              setActiveTab={setActiveTabAndScroll} 
              hiddenColumns={hiddenColumns} 
              setHiddenColumns={setHiddenColumns} 
              availableVisAttributes={availableAttributes}
              makeVis={makeVis}
            />
            {/* <br /> */}

            {/* Everything underneath the data table */}
            <div className="main-tab-bottom-row">
              {/* The Data Sources panel */}
              <div className="subtab-panel">
                <h1>Data Sources</h1>

                {/* Another bar of tabs, to choose KGs vs. Web vs. Local */}
                <div className="sub-tab-bar">
                  {/* <button
                    className={activeSubTab === 'wikidata' ? 'active-subtab' : ''}
                    onClick={() => setActiveSubTab('wikidata')}
                  >
                    Wikidata
                  </button> */}
                  <button
                    className={activeSubTab === 'datacommons' ? 'active-subtab' : ''}
                    onClick={() => setActiveSubTab('datacommons')}
                  >
                    Knowledge Graphs
                  </button>
                  {/* <button
                    className={activeSubTab === 'web' ? 'active-subtab' : ''}
                    onClick={() => setActiveSubTab('web')}
                  >
                    Web Search
                  </button> */}
                  <button
                    className={activeSubTab === 'kaggle' ? 'active-subtab' : ''}
                    onClick={() => setActiveSubTab('kaggle')}
                  >
                    Web
                  </button>
                  <button
                    className={activeSubTab === 'local' ? 'active-subtab' : ''}
                    onClick={() => setActiveSubTab('local')}
                  >
                    Local Files
                  </button>
                </div>
                {activeSubTab === 'local' && (
                  <>
                    {/* <h1>Local Files for Testing</h1> */}
                    {/* {testFiles.map((obj, idx) =>
                      obj.topic ? 
                      <button key={idx} onClick={() => joinTable(obj.path, {topic: obj.topic})}>{obj.name}</button>
                      :
                      <button key={idx} onClick={() => joinTable(obj.path)}>{obj.name}</button>
                    )} */}
                    <div className='search-row'>
                      {/* Hidden file input */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".csv"
                        style={{ display: "none" }}
                        onChange={handleFileUpload}
                      />

                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="upload-button"
                        disabled={isFileUploading}
                      >
                        {isFileUploading ? "Uploading..." : "Upload CSV"}
                      </button>
                    </div>
                    <br/>
                    <ButtonListWrapper 
                      objects={testFiles} 
                      joinDatacommonsProperty={joinDatacommonsProperty}
                      joinWikidataProperty={joinWikidataProperty}
                      kaggleDownload={kaggleDownload}
                      joinTable={joinTable}
                    />
                  </>
                )}
                {/* <br/> */}
                {/* WEB TAB IS DEPRECATED -- SEE KAGGLE */}
                {activeSubTab === "web" && (
                  // WEB TAB IS DEPRECATED
                  <>
                    {/* <h1>Web Search</h1> */}
                    <form
                      className="search-row"
                      onSubmit={(e) => {
                        e.preventDefault(); // prevent page reload
                        getWebSources(webSearchInputRef.current.value);
                      }}
                    >
                      <input
                        type="text"
                        id="web-search-input"
                        className="search-textbox"
                        placeholder="Search for data on the web"
                        ref={webSearchInputRef}
                      />
                      <button type="submit" className="search-button" disabled={webSearchRunning || numSearchesWaiting > 0}>Search</button>
                    </form>
                    {/* {webSourcesDEBUG.map((obj, idx) =>
                      <button key={idx} title={obj.url} onClick={() => getDataFromWebSource({source: obj})}>{obj.organization}</button>
                    )} */}
                    {/* {numSearchesWaiting > 0 && (
                      <p>Identifying promising datasets... {numSearchesWaiting.toString()} more to check.</p>
                    )} */}
                    {/* {webDatasets.length > 0 && (
                      <p>{webDatasets.length} dataset(s) found.</p>
                    )} */}
                    <br/>
                    <ButtonListWrapper 
                      objects={webDatasets} 
                      joinDatacommonsProperty={joinDatacommonsProperty}
                      joinWikidataProperty={joinWikidataProperty}
                      kaggleDownload={kaggleDownload}
                      joinTable={joinTable}
                    />
                    {/* {webDatasets.map((obj, idx) =>
                      <button key={idx} title={obj.url} onClick={() => joinTable(obj.path, {topic: obj.attr_query})}>{obj.organization}</button>
                    )} */}
                  </>
                )}
                {activeSubTab === 'kaggle' && (
                  <>
                    {/* <h1>Kaggle Search</h1> */}
                    <form
                      className="search-row"
                      onSubmit={(e) => {
                        e.preventDefault(); // prevent full-page reload
                        searchForDatasets(kSearchInputRef.current.value, true);
                      }}
                    >
                      <input
                        type="text"
                        id="k-search-input"
                        className="search-textbox"
                        placeholder="Search for data on the Web"
                        ref={kSearchInputRef}
                      />
                      <button type="submit" className="search-button" disabled={kSearchRunning || webSearchRunning || numSearchesWaiting > 0}>Search</button>
                    </form>
                    <br/>
                    <ButtonListWrapperWeb 
                      objects={kaggleDatasets} 
                      joinDatacommonsProperty={joinDatacommonsProperty}
                      joinWikidataProperty={joinWikidataProperty}
                      kaggleDownload={kaggleDownload}
                      joinTable={joinTable}
                    />
                    {/* <br/> */}
                  </>
                )}
                {/* WIKIDATA TAB IS DEPRECATED -- SEE DATACOMMONS */}
                {activeSubTab === "wikidata" && (
                  // WIKIDATA TAB IS DEPRECATED
                  <>
                    {/* <h1>Wikidata</h1> */}
                    <ButtonListWrapper 
                      objects={wikidataProperties} 
                      joinDatacommonsProperty={joinDatacommonsProperty}
                      joinWikidataProperty={joinWikidataProperty}
                      kaggleDownload={kaggleDownload}
                      joinTable={joinTable}
                    />
                  </>
                )}
                {activeSubTab === "datacommons" && (
                  <>
                    {/* <h1>DataCommons</h1> */}
                    <form
                      className="search-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        searchKGs(kgSearchInputRef.current.value);
                      }}
                    >
                      <input
                        type="text"
                        id="kg-search-input"
                        className="search-textbox"
                        placeholder="Search for attributes"
                        ref={kgSearchInputRef}
                      />
                      <button type="submit" className="search-button" disabled={kgSearchRunning}>Search</button>
                    </form>
                    <br/>
                    {/* {datacommonsProperties.map(obj =>
                      <button key={obj.Property_ID} onClick={() => joinDatacommonsProperty(obj)}>{obj.Label}</button>
                    )} */}
                    {/* <ButtonListWrapper 
                      objects={datacommonsProperties} 
                      joinDatacommonsProperty={joinDatacommonsProperty}
                      joinWikidataProperty={joinWikidataProperty}
                      kaggleDownload={kaggleDownload}
                      joinTable={joinTable}
                    /> */}
                    <ButtonListWrapper 
                      objects={knowledgeGraphProperties} 
                      searchResultObjects={searchResultsKG}
                      joinDatacommonsProperty={joinDatacommonsProperty}
                      joinWikidataProperty={joinWikidataProperty}
                      kaggleDownload={kaggleDownload}
                      joinTable={joinTable}
                    />
                    {/* {searchResultsKG.length > 0 &&
                      <br/>
                    } */}
                    {/* <ButtonListWrapper 
                      objects={searchResultsKG} 
                      joinDatacommonsProperty={joinDatacommonsProperty}
                      joinWikidataProperty={joinWikidataProperty}
                      kaggleDownload={kaggleDownload}
                      joinTable={joinTable}
                      aiRecs={true}
                    /> */}
                  </>
                )}
              </div>
              {/* The Visualization Panel */}
              <div className='vis-panel'> {/* ref={visPanelRef} */}
                <h1>Visualization</h1>
                <div style={{ padding: '0rem' }}> {/* 2rem */}
                  {availableAttributes.length > 0 ? (
                    // The various controls: choosing vis type, attribute(s) to visualize, etc.
                    // If there's no attributes, just show a message prompting the user to add some.
                    <div className="vis-controls-row">
                      <div className="vis-control">
                        <label>Vis Type:</label>
                        <select value={activeVis} onChange={e => setActiveVis(e.target.value)}>
                          <option value="boxplot">Boxplot</option>
                          <option value="histogram">Histogram</option>
                          {datasetMode === "counties" && <option value="map">Choropleth</option>}
                          <option value="bar">Bar Chart</option>
                          <option value="scatterplot">Scatterplot</option>
                        </select>
                      </div>

                      <div className="vis-control">
                        <label>Attribute:</label>
                        <select className="attribute-input" value={visAttribute} onChange={e => setVisAttribute(e.target.value)}>
                          {availableAttributes.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>

                      {activeVis === "histogram" && (
                        <div className="vis-control">
                          <label>Outliers:</label>
                          <select value={clipOutliersHistogram} onChange={e => setClipOutliersHistogram(e.target.value)}>
                            <option value="keep">Keep</option>
                            <option value="remove">Remove</option>
                          </select>
                        </div>
                      )}

                      {activeVis === "scatterplot" && (
                        <div className="vis-control">
                          <label>2nd Attribute:</label>
                          <select
                            className="attribute-input"
                            value={yAttributeScatter}
                            onChange={e => setYAttributeScatter(e.target.value)}
                          >
                            {availableAttributes.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {activeVis === "bar" && (
                        <>
                          <div className="vis-control">
                            <label>Direction:</label>
                            <select value={barDirection} onChange={e => setBarDirection(e.target.value)}>
                              <option value="top">Top</option>
                              <option value="bottom">Bottom</option>
                            </select>
                          </div>
                          <div className="vis-control">
                            <label>Count:</label>
                            <input
                              type="number"
                              value={barCount}
                              min={1}
                              max={100}
                              step={1}
                              onChange={e => setBarCount(parseInt(e.target.value))}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p>Add data attributes to begin.</p>
                  )}
                  {/* Different components based on the currently selected vis type */}
                  {activeVis === "boxplot" &&
                    <D3Boxplot data={data} attribute={visAttribute} datasetMode={datasetMode} />
                  }
                  {activeVis === "histogram" && 
                    <D3Histogram data={data} attribute={visAttribute} remove_outliers={clipOutliersHistogram === "remove"} />
                  }
                  {activeVis === "map" && 
                    <D3Choropleth data={data} attribute={visAttribute} />
                  }
                  {activeVis === "bar" && 
                    <>
                      <D3BarChart
                        data={data}
                        attribute={visAttribute}
                        direction={barDirection}
                        count={barCount}
                        datasetMode={datasetMode}
                      />
                    </>
                  }
                  {activeVis === "scatterplot" &&
                    <>
                      <D3Scatterplot data={data} xAttribute={visAttribute} yAttribute={yAttributeScatter} datasetMode={datasetMode} />
                    </>
                  }
                </div>
              </div>
            </div>
          </>
        )}

        {/* The actual pages for the history/details tabs, one for each KG attribute or Web/Kaggle CSV */}
        {joinedTabs.map(tab =>
          activeTab === tab.id ? (
            <DetailsTabPage key={tab.id} tab={tab} df1Data={df1Data} datasetMode={datasetMode}/>
          ) : null
        )}

      </div>

    </div>
  );
}

export default App;
