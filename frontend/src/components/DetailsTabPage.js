// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import { PyodideProvider } from "./PythonRunners/PyodideContext";
import PythonRunnerDF from "./PythonRunners/PythonRunnerDF";
import PythonRunner from "./PythonRunners/PythonRunner";
import PythonRunnerJoin from "./PythonRunners/PythonRunnerJoin";

/**
 * Component rendering a page (accessed through a tab in the header) 
 * with details about a joined KG attribute or Web/Kaggle file
 */
const DetailsTabPage = ({tab, df1Data, datasetMode}) => {

  // Handle the case where the tab is about a Web/Kaggle file
  if (tab.type === "file") {

    // This means we had to correct a data load warning;
    // load code accordingly
    if ("response" in tab.responses[0]) {
      var dataLoadingCode = "df2 = df2.iloc[" + JSON.stringify(tab.responses[0].response.num_extra_rows) + ":]\ndf2.head()";
    }
    // This means we had to take a subset of columns;
    // load code accordingly
    if ("response" in tab.responses[1]) {
      var columnCheckCode = "cols_subset = " + JSON.stringify(tab.responses[1].response.col_list).replaceAll('","', '", "');
      columnCheckCode += "\n\ndf2 = df2[cols_subset]\ndf2.head()";
    }
    // This means we had to aggregate rows;
    // load code accordingly
    if ("response" in tab.responses[2]) {
      var aggregationCodeCore = `
numeric_cols = df2.select_dtypes(include=[np.number]).columns.tolist()
string_cols = [c for c in df2.columns if c not in numeric_cols + group_cols]
agg_dict = {c: 'median' for c in numeric_cols}
for c in string_cols:
  agg_dict[c] = lambda s: s.mode().iat[0]

df2 = df2.groupby(group_cols, as_index=False).agg(agg_dict)
df2.head()`;
      var aggregationCodePrefix = "group_cols = " + JSON.stringify(tab.responses[2].response.columns).replaceAll('","', '", "');
      var aggregationCode = aggregationCodePrefix + "\n" + aggregationCodeCore;
      // var aggregationCode = "print('Hello World')";
    }

    // Every file has table join code
    var tableJoinCode = tab.responses[3].response.code;
    tableJoinCode += "\n\nmerged.head()"

    return (
      <PyodideProvider>
      <div className="tab-body" key={tab.id}>
          <h2>{tab.title !== undefined ? tab.title : tab.id}</h2>
          {/* Kaggle -- data source info */}
          {tab.source === "Kaggle" && 
          <>
            <h4>Where is this data from?</h4>
            <p>The file "{tab.file_clean}" was downloaded from the <a href={"https://www.kaggle.com/datasets/" + tab.dataset_ref} target='_blank' rel="noreferrer">{tab.dataset_title} dataset</a> on Kaggle.</p>
            {tab.file_choice_explanation && <p>Out of several files in the dataset, this file was chosen for the following reason: {tab.file_choice_explanation}</p>}
          </>
          }
          {/* Web search -- data source info */}
          {(tab.source !== "Kaggle" && tab.source !== "TEST" && tab.source !== "Local") && 
          <>
            <h4>Where did the AI get this data?</h4>
            <p>The file "{tab.file_clean}" was downloaded from the <a href={tab.org_url} target='_blank' rel="noreferrer">{tab.source}</a>, found via web search.</p>
            <p>The exact data download link to the file itself is <a href={tab.url} target='_blank' rel="noreferrer">here</a>.</p>
          </>
          }
          {/* Local file upload -- data source info */}
          {(tab.source === "Local") && 
          <>
            <h4>Where is this data from?</h4>
            <p>The file "{tab.file_clean}" was uploaded by you from your local machine.</p>
          </>
          }
          {/* TEST file -- data source info */}
          {(tab.source === "TEST") && 
          <>
            <h4>Where is this data from?</h4>
            <p>The file "{tab.file_clean}" was loaded locally as a test.</p>
          </>
          }
          {/* Show the data before merging in a Python snippet */}
          <h4>Initial Look at the Dataframe (df2)</h4>
          <PythonRunnerDF df={tab.history.initial} />
          {console.log(tab.history)}
          <h4>Data Loading</h4>
          {/* If necessary, provide details on data loading warnings */}
          {("response" in tab.responses[0]) ?
            <>
              <p>When loading the data, the following warning was encountered:</p>
              <pre><code>{tab.responses[0].warnings[0]}</code></pre>
              <p>Upon further inspection, the issue was diagnosed as follows. {tab.responses[0].response.explanation}</p>
              <p>The following code was used to remove the extra row:</p>
              <PythonRunner startingCode={dataLoadingCode} codeRows={3} />
              {/* <pre><code>{"df = df.iloc[" + JSON.stringify(tab.responses[0].response.num_extra_rows) + ":]"}</code></pre> */}
            </> :
            <>
              <p>There were no issues encountered when loading the data.</p>
            </>
          }
          <h4>Column Check</h4>
          {/* If necessary, provide details on column checking & subsetting */}
          {("response" in tab.responses[1]) ?
            <>
              <p>There are a large number of columns in df2. {tab.responses[1].response.explanation}</p>
              <PythonRunner startingCode={columnCheckCode} codeRows={9} />
              {/* <pre><code>{"cols_subset = " + JSON.stringify(tab.responses[1].response.col_list)}</code></pre> */}
              {/* <pre><code>{`df2 = df2[cols_subset]`}</code></pre> */}
            </> :
            <>
              <p>There are a reasonable number of columns in df2 and thus no need to take a subset.</p>
            </>
          }
          <h4>Row Aggregation</h4>
          {/* If necessary, provide details on row aggregation */}
          {("response" in tab.responses[2]) ?
            <>
              <p>{tab.responses[2].response.explanation}</p>
              <PythonRunner startingCode={aggregationCode} codeRows={11} codeCols={75}/>
              {/* <pre><code>{"group_cols = " + JSON.stringify(tab.responses[2].response.columns)}</code></pre>
              <pre><code>
  {`numeric_cols = df2.select_dtypes(include=[np.number]).columns.tolist()
  string_cols = [c for c in df2.columns if c not in numeric_cols + group_cols]
  agg_dict = {c: 'median' for c in numeric_cols}
  for c in string_cols:
      agg_dict[c] = lambda s: s.mode().iat[0]
  df2 = df2.groupby(group_cols, as_index=False).agg(agg_dict)`}
              </code></pre> */}
            </> :
            <>
              <p>The rows in df2 correspond to rows in df1, so there is no need for aggregation.</p>
            </>
          }
          <h4>Table Joining</h4>
          {/* Provide details on table joining */}
          <p>First, let's recall what the identifying columns of the existing dataset (df1) look like:</p>
          <PythonRunnerDF df={df1Data} df_name={"df1"} numHeadRows={3} hideTextArea={true} />
          <p>The code below was used to execute the join. {tab.responses[3].response.explanation}</p>
          <PythonRunnerJoin startingCode={tableJoinCode} codeRows={9} codeCols={70} secretDf={tab.history.final}/>
          {/* <pre><code>{tab.responses[3].response.code}</code></pre> */}
          <h4>Join Quality</h4>
          {/* Provide details on join quality/performance */}
          <p>The above code failed to find joinable matches for {tab.joinStatus.num_null_rows} {tab.joinStatus.num_null_rows === 1? "row" : "rows"} ({(tab.joinStatus.pct_missing*100).toFixed(2)}%).</p>
          {tab.joinStatus.num_null_rows > 0 &&
          <>
          <p>Here {tab.joinStatus.num_null_rows > 5? "is a subset of" : "are"} the rows in the data for which matches were not found:</p>
          <PythonRunnerDF df={tab.joinStatus.null_rows} df_name="null_rows" />
          </>
          }
      </div>
      </PyodideProvider>
    );
  } else if (tab.type === "knowledge_graph" && tab.source === "Wikidata") { // Handle Wikidata case
    return (
      <PyodideProvider>
      <div className="tab-body" key={tab.id}>
        <h2>{tab.title !== undefined ? tab.title : tab.id}</h2>
        <h4>Where is this data from?</h4>
        {/* Wikidata -- data source info */}
        <p>The property "{tab.obj.Label}" has ID {tab.id} on {tab.source}.</p>
        <p>Its description is as follows: "{tab.obj.Description}"</p>
        <p>Read more about this property on <a href={"https://www.wikidata.org/wiki/Property:" + tab.id} target='_blank' rel="noreferrer">its Wikidata page</a>.</p>
        <h4>Retrieving and Joining the Data</h4>
        {/* Wikidata -- data provenance info */}
        <p>We use the <a href={"https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service"} target='_blank' rel="noreferrer">Wikidata SPARQL query service</a>. The following SPARQL query enables us to retrieve this data attribute for each of the {datasetMode} in the U.S.:</p>
        <pre><code>{tab.history.query.trim()}</code></pre>
        <p>After cleaning up the response, we get the following table (first 5 rows shown):</p>
        <PythonRunnerDF df={tab.history.final} hideTextArea={true} />
        <p>It is then easy to join this table with the existing data using the {datasetMode === "counties"? "FIPS" : "IATA"} code unique identifier for {datasetMode}.</p>
        <h4>Data Missingness</h4>
        {/* Wikidata -- data missingness info */}
        <p>This attribute is missing data for {tab.joinStatus.num_null_rows} {tab.joinStatus.num_null_rows === 1? "row" : "rows"} ({(tab.joinStatus.pct_missing*100).toFixed(2)}%).</p>
        {tab.joinStatus.num_null_rows > 0 &&
        <>
        <p>Here {tab.joinStatus.num_null_rows > 5? "is a subset of" : "are"} the rows with missing values:</p>
        <PythonRunnerDF df={tab.joinStatus.null_rows} df_name="null_rows" hideTextArea={true} />
        </>
        }
      </div>
      </PyodideProvider>
    )
  } else if (tab.type === "knowledge_graph" && tab.source === "DataCommons") { // Handle DataCommons case
    
    var params = `{
  "variable.dcids": "${tab.id}",
  "date": "LATEST",
  "entity.expression": "country/USA<-containedInPlace+{typeOf:County}",
  "select": ["entity", "variable", "value", "date"]
}`

    return (
      <PyodideProvider>
      <div className="tab-body" key={tab.id}>
        <h2>{tab.title !== undefined ? tab.title : tab.id}</h2>
        <h4>Where is this data from?</h4>
        {/* DataCommons -- data source info */}
        <p>The property "{tab.obj.Label}" has ID {tab.id} on {tab.source}.</p>
        <p>Read more about this property on <a href={"https://datacommons.org/browser/" + tab.id} target='_blank' rel="noreferrer">its DataCommons page</a>.</p>
        <h4>Retrieving and Joining the Data</h4>
        {/* DataCommons -- data provenance info */}
        <p>We use the <a href={"https://docs.datacommons.org/api/rest/v2/observation"} target='_blank' rel="noreferrer">DataCommons API's observation endpoint</a>. The following query parameters enable us to retrieve this data attribute for every U.S. county:</p>
        <pre><code>{params}</code></pre>
        <p>After cleaning up the response, we get the following table (first 5 rows shown):</p>
        <PythonRunnerDF df={tab.history.final} hideTextArea={true} />
        <p>It is then easy to join this table with the existing data using the FIPS code unique county identifier.</p>
        <h4>Data Missingness</h4>
        {/* DataCommons -- data missingness info */}
        <p>This attribute is missing data for {tab.joinStatus.num_null_rows} {tab.joinStatus.num_null_rows === 1? "row" : "rows"} ({(tab.joinStatus.pct_missing*100).toFixed(2)}%).</p>
        {tab.joinStatus.num_null_rows > 0 &&
        <>
        <p>Here {tab.joinStatus.num_null_rows > 5? "is a subset of" : "are"} the rows with missing values:</p>
        <PythonRunnerDF df={tab.joinStatus.null_rows} df_name="null_rows" hideTextArea={true} />
        </>
        }
      </div>
      </PyodideProvider>
    )
  } else { // Something went wrong...
    return <div className="tab-body"><p>Unsupported tab type: {tab.type}</p></div>;
  }
};

export default DetailsTabPage;
