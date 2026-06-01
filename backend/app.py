# Copyright (c) 2026 Massachusetts Institute of Technology
# SPDX-License-Identifier: MIT

# backend/app.py
import os, json, warnings, time, random, urllib
from dotenv import load_dotenv
from openai import OpenAI
import pandas as pd
from pandas.errors import DtypeWarning
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS

## Set the dataset (called "dataset mode" in frontend)
DATASET = "counties"
# DATASET = "airports"

load_dotenv(dotenv_path='../.env.local')
my_api_key = os.getenv("API_KEY")

from utils import *
from utils_wikidata import *
from utils_datacommons import *
from utils_embedding_search import *

client = OpenAI(api_key=my_api_key)

# Initialize and authenticate Kaggle API
k_api = KaggleApi()
k_api.authenticate()

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from React

## Initialize some important variables
if DATASET == "counties":
    template_data = pd.read_csv("data/static/COUNTIES_TEMPLATE_FINAL_v2.csv", dtype={"FIPS": str})
    RELEVANT_COLS = ['FIPS', 'County', 'State']
    # dc_index, dc_metadata = load_index("data/static/faiss_combined.index",
    #                                    "data/static/metadata_combined.json")
    dc_index, dc_metadata = load_index("data/static/faiss_combined_v2.index",
                                       "data/static/metadata_combined_v2.json")
else:
    template_data = pd.read_csv("data/static/AIRPORTS_TEMPLATE_FINAL.csv", dtype={"IATA": str})
    # template_data = pd.read_csv("data/static/AIRPORTS_TEMPLATE_FINAL.csv", dtype={"IATA": str})[['IATA']]
    RELEVANT_COLS = ['IATA']
    dc_index, dc_metadata = load_index("data/static/faiss_airports.index",
                                       "data/static/metadata_airports.json")

## Initialize global variables which will be populated later
current_data = pd.DataFrame()
df2 = pd.DataFrame()
df2_history = dict()


## Schemas for LLM function calling
attr_search_function_schema = {
    "name": "search_kg_attributes",
    "description": '''If the user asks for data (not just to answer a question), 
                      search for matching data attributes from knowledge graphs based on a user's query.
                      Any question asking like "is there any data about X", or anything like that,
                      your first action should be to search the knowledge graphs with this function.
                      Never claim that certain data attributes exist without calling this function.
                   ''',
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "What the user is looking for"}
        },
        "required": ["query"]
    }
}
web_search_function_schema = {
    "name": "search_web",
    "description": "If the user excplicitly asks to search for a data attribute on the web, construct an appropriate web search query.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "What the user is looking for. Should end with 'in US "+DATASET+"' or similar and should not include the word 'data'"}
        },
        "required": ["query"]
    }
}
check_data_function_schema = {
    "name": "check_data",
    "description": "If the user asks a question about one of the current data attributes/columns by mentioning its name (they don't have to say 'column'):",
    "parameters": {
        "type": "object",
        "properties": {
            "attribute": {"type": "string", "description": "The data attribute/column that the question is about"}
        },
        "required": ["attribute"]
    }
}
make_vis_function_schema = {
    "name": "make_vis",
    "description": '''If the user says they want to make a visualization or chart about a data attribute.
                      There are four visualization types: histogram, choropleth map, bar chart, and scatterplot.
                      The user may specify a vis type, or you can choose, but the only type that allows >1 data attribute is scatterplot.
                      If the user doesn't specify, use your judgement.
                      The only one that shows 'stats' is the boxplot, so choose that one if the user says they want a statistical summary.
                      The valid candidate attributes to visualize are:
                   ''',
    "parameters": {
        "type": "object",
        "properties": {
            "vis_type": {"type": "string", "description": "The type of visualization: 'boxplot', 'histogram', 'map', 'bar', or 'scatterplot'."},
            "attributes": {"type": "array", "items": {"type": "string"}, "description": "The IDs of data attribute(s)/column(s) that the vis should have. Length 2 for scatterplot, else length 1."}
        },
        "required": ["vis_type", "attributes"]
    }
}

## API Endpoints
@app.route('/api/message')
def message():
    '''
    This is just a basic test
    '''
    return jsonify({'message': 'Hello from Flask!'})

@app.route('/test-threads')
def test_threads():
    '''
    This is a test to make sure api calls can be made concurrently
    '''
    start = time.time()
    time.sleep(random.randint(0, 5))
    end = time.time()
    return jsonify({'start': start, 'end': end})

@app.route('/openai/test')
def test():
    '''
    This is a test to check the connection to the OpenAI API
    '''
    response = client.responses.create(
        model="gpt-4.1-nano",
        input="Write a one-sentence bedtime story about a unicorn."
    )
    return jsonify({'message': response.output_text})

@app.route('/get-dataset')
def get_dataset():
    '''
    This tells the frontend which dataset mode (e.g., counties vs. airports) is active
    '''
    return jsonify({'dataset': DATASET})

@app.route('/upload-file', methods=['POST'])
def upload_file():
    '''
    Handle local file upload of CSV data
    '''
    if 'file' not in request.files:
        return {'error': 'No file part'}, 400

    file = request.files['file']
    if file.filename == '':
        return {'error': 'No selected file'}, 400

    # Read into pandas
    df = pd.read_csv(file)
    print("Loaded dataframe:")
    print(df.head())
    df.to_csv(os.path.join("data", file.filename), index=False)
    file_dict = {"source": "local", "path": os.path.join("data", file.filename),
                 "name": file.filename, "topic": ""}
    return {'message': 'File received and loaded successfully', 'file_obj': file_dict}

@app.route('/chat-with-assistant', methods=['POST'])
def chat_with_assistant():
    '''
    Send user message to the OpenAI virtual assistant.
    If necessary, use function calling to initiate a search, create a chart, etc.
    '''
    data = request.get_json()
    messages = data.get('messages', [])
    vis_attributes = data.get('vis_attributes', [])

    # cols_OLD = ', '.join(current_data.columns.to_list())
    cols = "[" + ', '.join(["'" + c + "'" for c in current_data.columns.to_list()]) + "]"
    check_data_function_schema["description"] += cols

    # vis_cols_OLD = ', '.join(vis_attributes)
    vis_cols = "[" + ', '.join(["'" + a + "'" for a in vis_attributes]) + "]"
    make_vis_function_schema["description"] += vis_cols
    # messages[0]['content'] = messages[0]['content'] + " The current data columns are: [" + cols + "]"
    # print(messages[0])
    try:
        response = client.chat.completions.create(
            model="gpt-4.1",  # gpt-4.1
            messages=messages,
            # max_tokens=200,
            temperature=0.2,
            functions=[attr_search_function_schema, web_search_function_schema,
                       check_data_function_schema, make_vis_function_schema],
            function_call="auto"
        )
        choice = response.choices[0]
        message = choice.message
        if message.function_call is not None:
            print("**FUNCTION CALL**")
            fc = message.function_call
            print("**", fc.name, "**")
            if fc.name == "search_kg_attributes":
                # print(fc.arguments)
                search_results = search_kg_attributes(dc_index, dc_metadata, 
                                                      json.loads(fc.arguments)["query"],
                                                      top_k = 5)

                # Send back function result
                messages.append(message)  # include function_call message
                messages.append({
                    "role": "function",
                    "name": "search_kg_attributes",
                    "content": json.dumps(search_results)
                })

                messages.append({
                    "role": "user",
                    "content": '''
                               If any of these attributes match my desired attribute itself, display them. Mention if they closely or only loosely match.
                               If there are multiple close matches with similar wording, choose a diverse and non-redundant set. Show human-readable names only.
                               If there are multiple sources, choose the best and most sensible match(es) from each source.
                               Give a brief intro to start, but don't say anything else after listing any attributes. 
                               Each attribute *must* actually match a search result, don't assume they exist.
                               If there are no good matches, especially if the user asks more than once, ask if I want to search the web instead.
                               If the user asks multiple questions about the same attribute, don't just respond with the same thing every time.

                               Respond in Python-readable JSON format, with the plain text 'response' (listing attributes on their own line) and the 'attributes' separated:
                               {{ "response": "Here are the attributes...  - Attribute A...  - Attribute B...",
                                  "attributes": [{{"Property_ID": attr_a_id, "Label": attr_a_label, "source": attr_a_source_lowercase}}, ...] }}
                               '''
                })

                # Ask GPT to summarize the result
                final_response = client.chat.completions.create(
                    model="gpt-4.1",
                    messages=messages
                )

                final_response_text = final_response.choices[0].message.content.strip()
                final_response_json = json.loads(final_response_text)
                # print(final_response_json['attributes'])
                for result in search_results:
                    result['ai_choice'] = result['Property_ID'] in set([a['Property_ID'] for a in final_response_json['attributes']])
                return jsonify({'reply': final_response_json['response'], 'function': fc.name,
                                'attributes': final_response_json['attributes'],
                                'all_results': search_results})
            
            if fc.name == "search_web":
                canned_response = {"response": "Sure! Let me initiate a web search for files containing reputable data about " + json.loads(fc.arguments)["query"] + "."}
                return jsonify({'reply': canned_response['response'], 'function': fc.name, 'web_query': json.loads(fc.arguments)["query"]})
            
            if fc.name == "check_data":
                # print(json.loads(fc.arguments)["attribute"])
                relevant_cols = RELEVANT_COLS.copy()
                col_of_interest = json.loads(fc.arguments)["attribute"]
                if col_of_interest not in relevant_cols:
                    relevant_cols.append(col_of_interest)
                current_data_small = current_data[relevant_cols].head().to_csv(index=False)
                # Send back function result
                messages.append(message)  # include function_call message
                messages.append({
                    "role": "function",
                    "name": "check_data",
                    "content": json.dumps(current_data_small)
                })

                messages.append({
                    "role": "user",
                    "content": '''
                               Answer the question about the data attribute, based on the data provided about U.S. {DATASET}.
                               Provide specific examples based on the data rows, if it helps to explain the answer.
                               Actually compare the values in the data to what your knowledge would suggest for the answer, don't just make an assumption.
                               When figuring out units, check your answer by comparing the first data row with specific values from your own knowledge. Fix your answer if it doesn't make sense.
                               Don't make any conclusive statements before checking, and say "let me check" before you check and think through each step carefully.
                               Respond in Python-readable JSON format, with a plain text 'response':
                               {{ "response": "The ... column ...  "}}
                               '''.format(DATASET)
                })

                # Ask GPT to summarize the result
                final_response = client.chat.completions.create(
                    model="gpt-4.1",
                    messages=messages,
                    temperature=0.0
                )

                final_response_text = final_response.choices[0].message.content.strip()
                final_response_json = json.loads(final_response_text)

                # canned_response = {"response": "Let me look at the data and get back to you on that."}
                return jsonify({'reply': final_response_json['response'], 'function': fc.name})
            
            if fc.name == "make_vis":
                arguments = json.loads(fc.arguments)
                print(arguments)
                return jsonify({'reply': "Okay, no problem. Let me make that chart for you.",
                                'function': fc.name,
                                'spec': {'vis_type': arguments['vis_type'],
                                         'attributes': arguments['attributes']}
                                })
        # response.choices
        # print(response.choices[0].message.content.strip())
        # return jsonify({})
        # assistant_reply = response.choices[0].message.content.strip()
        return jsonify({'reply': message.content.strip()})
    
    except Exception as e:
        print(f"OpenAI API error: {e}")
        return jsonify({'reply': "Sorry, I couldn't reach the AI engine."}), 500

@app.route('/assistant-summarize-results', methods=['POST'])
def assistant_summarize_results():
    '''
    CURRENTLY NOT USED
    Summarizes search results in a conversational way for the chat window
    '''
    data = request.get_json()
    results = data.get('results', [])
    print(results)

    try:
        prompt = '''
        I previously asked to search for datasets.
        Please summarize these results briefly.
        Look at things like the title, filename, source, and maybe URL (for Kaggle, ignore creator),
        thought not necesarily all that info. Just do a short, one-sentence summary for each,
        written as plain English. Each sentence should be short and concise!
        If there are no results, just respond like "I couldn't find anything new on this search."

        results=
        ```
        {}
        ```
        '''.format(json.dumps(results, indent=2))

        response = client.responses.create(
            model="gpt-4.1-nano",
            temperature=0.0,# if model!="o4-mini" else None,
            input=prompt,
            # model="o4-mini",
        )

        # text = response.output_text
        # # print(text)
        # if text.startswith("```json"):
        #     text = text[len("```json"):].strip()
        # # if text.endswith("```"):
        # #     text = text[:-len("```")].strip()
        # if "```" in text:
        #     idx = text.index("```")
        #     text = text[:idx]

        # response_json = json.loads(text)
        # print(response_json)
        return jsonify({'reply': response.output_text})
    
    except Exception as e:
        print(f"OpenAI API error: {e}")
        return jsonify({'reply': "Sorry, I couldn't reach the AI engine."}), 500

@app.route('/reset-data')
def reset_data2():
    '''
    Load the original, template dataset with nothing joined
    '''
    global current_data
    if DATASET == "counties":
        current_data = pd.read_csv("data/static/COUNTIES_TEMPLATE_FINAL_v2.csv", dtype={"FIPS": str})
    else:
        current_data = pd.read_csv("data/static/AIRPORTS_TEMPLATE_FINAL.csv", dtype={"IATA": str})
        # current_data = pd.read_csv("data/static/AIRPORTS_TEMPLATE_FINAL.csv", dtype={"IATA": str})[['IATA']]
    return jsonify({})

@app.route('/get-test-files')
def get_test_files():
    '''
    List the CSV data files from directory backend/data/TEST
    '''
    test_files_dicts = []
    test_files = [file for file in os.listdir("data/TEST") if file.endswith(".csv")]
    for file in test_files:
        test_files_dicts.append({"source": "test", "path": os.path.join("data/TEST", file), "name": file,
                                 "topic": "life expectancy in U.S. "+DATASET if file.startswith("analytic") and DATASET == "counties" else ""})
    return jsonify({'test_files': test_files_dicts})

@app.route('/get-df1-template-data')
def get_df1_template_data():
    '''
    For join demonstration purposes (i.e., on the history tabs),
    load only the key columns from the original dataset
    '''
    # df1_template_rows = template_data.fillna("").head(15).to_dict(orient="split")
    df1_template_rows = template_data.fillna("").to_dict(orient="split")
    return jsonify({"df1": df1_template_rows})

@app.route('/get-current-data')
def get_current_data():
    '''
    Return the current state of the dataset, to be displayed
    at the top of the interface in the Data Table
    '''
    # Example DataFrame
    # df = pd.DataFrame({
    #     'Name': ['Alice', 'Bob', 'Charlie'],
    #     'Age': [25, 30, 35],
    #     'Department': ['HR', 'Engineering', 'Finance']
    # })
    df = current_data.copy().fillna(value="")#.head()
    # df = current_data.head()
    return_obj = {'columns': df.columns.tolist(),
                  'rows': df.to_dict(orient='records')}
    # print(return_obj)
    return jsonify(return_obj)

@app.route('/get-sources')
def get_sources():
    '''
    Ask GPT-4.1 to ideate a list of reputable web sources
    from which to potentially download data
    '''
    attr_of_interest = request.args.get('attr_query')
    sources_response = get_source_list(attr_of_interest)
    return jsonify(sources_response)

@app.route('/get-data-from-source', methods=['POST'])
def get_data_from_web_source():
    '''
    Given an organization name and URL from GPT-4.1,
    try to find a downloadable Web dataset from that organization
    '''
    params = request.get_json()
    attr_of_interest = params['attr_query']
    source_dict = params['source']
    source = source_dict['organization'] + "(" + source_dict['url'] + ")"
    source_response = get_data_from_source(attr_of_interest, source)
    return jsonify(source_response)

@app.route('/get-csv-from-page', methods=['POST'])
def get_csv_from_page():
    '''
    Scrape all CSV file download links from a webpage,
    then (if necessary) identify the most appropriate one
    '''
    params = request.get_json()
    source_dict = params['source']
    all_links = get_all_links(source_dict['url'])
    # print("ALL LINKS:", all_links)
    if len(all_links) > 0:
        best_link_json = choose_best_link(source_dict['text_to_click'] + " " +source_dict['explanation'], all_links)
        # print(best_link_json)
        return jsonify(best_link_json)
    else:
        # print("NO DATA LINKS FOUND")
        return jsonify({})

@app.route('/test-load-file')
def test_load_file():
    '''
    Determine if a dataset can be successfully loaded
    by doing a dry-run of loading the file;
    for Web datasets, attempt a file download
    if the data cannot be loaded directly into Pandas
    '''
    file_str = request.args.get('file')
    attr_query = request.args.get('attr_query')
    file_size = get_remote_file_size(file_str)
    # print("\n", file_size, file_str, "\n")
    if file_size is not None: 
        # print("\n", file_str, file_size / (1000*1000), "\n")
        if file_size / (1000*1000) > 200: ## 200 MB
            return jsonify({"path": "", "url": file_str})
    try:
        df = pd.read_csv(file_str, encoding='latin-1')
        if len(df) > 0:
            path = file_str
        else:
            path = ""
    except urllib.error.HTTPError as e:
        print("*****")
        print(e)
        if e.code == 403:
            response = requests.get(file_str)
            if response.status_code == 200:
                # Write the content to a local file
                filename = file_str.split("/")[-1]
                new_file_str = os.path.join("data", filename)
                with open(new_file_str, "wb") as file:
                    file.write(response.content)
                df = pd.read_csv(new_file_str, encoding='latin-1')
                if len(df) > 0:
                    path = new_file_str
            else:
                path = ""
        else:
            path = ""
    except Exception as e:
        print("***** UNCAUGHT EXCEPTION *****")
        print(e)
        df = pd.DataFrame()
        path = ""
    finally:
        if path != "":
            df_head = pd.read_csv(path, nrows=5)
            decision_resp = check_for_relevant_data(df_head, attr_query)
            # print("\n", decision_resp, "\n")
            decision_bool = decision_resp['relevance_decision']
            # decision_expl = decision_resp['explanation']
            if not decision_bool:
                path = ""
        return jsonify({"path": path, "url": file_str})

@app.route('/kaggle-dataset-search')
def k_search_for_dataset():
    '''
    Use keyword search to find datasets from the Kaggle API,
    and then use GPT to filter out nonsense results
    '''
    keyword = request.args.get('keyword')
    startup_mode = request.args.get('startup_mode') == "true"
    datasets = k_api.dataset_list(search=keyword, page=1, file_type='csv', max_size=50000000)
    dataset_dicts = [d.to_dict() for d in datasets]
    for d in dataset_dicts:
        d['source'] = 'kaggle'
    if startup_mode:
        return jsonify(dataset_dicts)
    else:
        # print("\nHERE\n")
        reasonable_datasets = k_check_reasonability(dataset_dicts[0:5], topic=keyword)
        return jsonify(reasonable_datasets)

@app.route('/kaggle-dataset-download')
def k_download_dataset():
    '''
    Download a dataset from the Kaggle API;
    if necessary, disambiguate which individual file
    in the dataset is the one we want
    '''
    dataset_ref = request.args.get('dataset_ref')
    dataset_title = request.args.get('dataset_title')
    search_keyword = request.args.get('search_keyword')
    startup_mode = request.args.get('startup_mode') == "true"
    # Get files
    files = k_api.dataset_list_files(dataset_ref)
    if len(files.error_message) > 0:
        return {"filepath": ""}
    csv_files = [file for file in files.files if file.name.endswith(".csv")]
    # Get the file or disambiguate
    if len(csv_files) == 1:
        filename = csv_files[0].name
        k_api.dataset_download_files(dataset_ref, path='data', unzip=True)
        return {"filepath": os.path.join('data', filename)}
    ### MORE THAN ONE FILE
    csv_filenames = [file.name for file in csv_files]
    k_api.dataset_download_files(dataset_ref, path='data', unzip=True)
    if startup_mode:
        filename_resp = k_choose_best_file(search_keyword + " " + dataset_title, csv_filenames)
        # filename = json.loads(filename_resp)['file_name']
        filename = filename_resp['file_name']
        explanation = filename_resp['explanation']
        return {"filepath": os.path.join('data', filename), "file_choice_explanation": explanation}
    ### NOT STARTUP MODE
    possible_matches = []
    explanations = {}
    for file in csv_filenames:
        filepath = os.path.join("data", file)
        df_head = pd.read_csv(filepath, nrows=5)
        decision_resp = check_for_relevant_data(df_head, search_keyword)
        decision_bool = decision_resp['relevance_decision']
        explanations[filepath] = decision_resp['explanation']
        if decision_bool:
            possible_matches.append({filepath: df_head.to_csv(index=False)})
    if len(possible_matches) == 1:
        filepath = possible_matches.keys()[0]
        return {"filepath": filepath, "file_choice_explanation": explanations[filepath]}
    elif len(possible_matches) > 1:
        best_file_from_df_resp = k_choose_best_file_from_df(possible_matches, search_keyword)
        filepath = best_file_from_df_resp['filepath']
        return {"filepath": filepath, "file_choice_explanation": explanations[filepath]}
    return {"filepath": ""}

@app.route('/wikidata-get-properties')
def wikidata_get_properties():
    '''
    Get list of Wikidata properties; cached in static files,
    so we don't dynamically get the properties each time
    '''
    if DATASET == "counties":
        properties_list = wikidata_get_properties_counties()
    elif DATASET == "airports":
        properties_list = wikidata_get_properties_airports()
    else:
        properties_list = []
    return jsonify({"properties": properties_list})

@app.route('/wikidata-join-property')
def wikidata_join_property():
    '''
    Join a property from Wikidata to the current dataset
    '''
    global current_data
    property_id = request.args.get('property_id')
    property_label = request.args.get('property_label')
    df2_history[property_id] = dict()
    # property_id = "P1082"
    if DATASET == "counties":
        property_df, query = fetch_county_data_flexibly(property_id, property_label=property_label)
        property_df = property_df[~property_df['FIPS'].str.startswith('00')]
        join_key = "FIPS"
    elif DATASET == "airports":
        property_df, query = fetch_airport_data_flexibly(property_id, property_label=property_label)
        join_key = "IATA"
    else:
        return jsonify({})
    df2_history[property_id]['final'] = property_df.copy().sort_values(by=join_key).fillna("").to_dict(orient="split")
    df2_history[property_id]['query'] = query
    current_data = pd.merge(current_data, property_df, how="left", on=join_key)
    # Check nulls
    new_attr = property_df.columns.to_list()[-1]
    num_nulls = int(current_data[new_attr].isnull().sum())
    pct_null = num_nulls / len(current_data)
    null_rows_df = current_data[current_data[new_attr].isnull()]
    null_rows = prepareNullRows(null_rows_df[RELEVANT_COLS.copy() + [new_attr]])
    warnings_dict = {"status": {"num_null_rows": num_nulls, "pct_missing": pct_null, "null_rows": null_rows}}
    return jsonify({"message": "Joined property " + property_id, "history": df2_history[property_id],
                    "warnings": warnings_dict})

@app.route('/datacommons-get-properties')
def datacommons_get_properties():
    '''
    Get list of DataCommons properties; cached in static files,
    so we don't dynamically get the properties each time
    '''
    county_properties = pd.read_csv("data/static/DATACOMMONS_STAT_VARS_v2.csv")
    cp_clean = county_properties.fillna(value="")
    cp_clean['source'] = "datacommons"
    cp_list = cp_clean.to_dict(orient='records')
    return jsonify({"properties": cp_list})

@app.route('/datacommons-join-property')
def datacommons_join_property():
    '''
    Join a property from DataCommons to the current dataset
    '''
    global current_data
    property_id = request.args.get('property_id')
    df2_history[property_id] = dict()
    property_label = request.args.get('property_label')
    # property_id = "Count_Farm"
    # property_label = "Farms"
    property_df = fetch_county_stats(property_id, property_label)
    df2_history[property_id]['final'] = property_df.sort_values(by="FIPS").fillna("").to_dict(orient="split")
    # print(property_df.head())
    current_data = pd.merge(current_data, property_df, how="left", on="FIPS")
    # Check nulls
    new_attr = property_df.columns.to_list()[-1]
    num_nulls = int(current_data[new_attr].isnull().sum())
    pct_null = num_nulls / len(current_data)
    null_rows_df = current_data[current_data[new_attr].isnull()]
    null_rows = prepareNullRows(null_rows_df[RELEVANT_COLS.copy() + [new_attr]])
    warnings_dict = {"status": {"num_null_rows": num_nulls, "pct_missing": pct_null, "null_rows": null_rows}}
    return jsonify({"message": "Joined property " + property_id, "history": df2_history[property_id],
                    "warnings": warnings_dict})

@app.route('/search-knowledge-graphs')
def search_knowledge_graphs():
    '''
    Search a pre-computed index of KG attributes using word embeddings
    '''
    query = request.args.get('query')
    search_results = search_kg_attributes(dc_index, dc_metadata, query, top_k = 5)
    return jsonify({"all_results": search_results})

@app.route('/load-table')
def load_table():
    '''
    Load a data table from a file or web URL
    and log/fix data loading issues
    '''
    global df2, df2_history
    ### TO CHANGE LATER
    file_str = request.args.get('file')
    df2_history[file_str] = dict()
    ###
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        df2 = pd.read_csv(file_str, encoding='latin-1')
        # df2_history[file_str]['initial'] = df2.fillna("").head(15).to_dict(orient="split")
        df2_initial = cleanColumns(df2.copy())
        df2_history[file_str]['initial'] = df2_initial.fillna("").to_dict(orient="split")
        print("DATA LOADING WARNINGS:", [(warning.category) for warning in w])  ## warning.message
        if any(issubclass(w.category, DtypeWarning) for w in w):
            df2, response = check_dtype_warning(client, df2)
            return jsonify({'response': response, 'warnings': [str(warning.category) for warning in w]})
        else:
            return jsonify({'warnings': [(warning.category) for warning in w]})

@app.route('/check-columns')
def check_columns():
    '''
    Check the loaded data table's columns for quality
    and (if necessary due to large number of columns) relevance
    '''
    global df2
    response = {}
    file_str = request.args.get('file')
    topic_of_interest = request.args.get('topic')
    # print("\n***")
    # print(topic_of_interest)
    # print("***\n")
    if len(df2.columns.to_list()) > 30:
        # df2, response = subset_columns(client, df2, "life expectancy")
        df2, response = subset_columns(client, df2, topic_of_interest)
    ## SOME MANUAL QUALITY CHECKS
    df2 = cleanColumns(df2)
    ## RETURN
    df2 = pd.DataFrame(df2)
    # df2_history[file_str]['initial'] = df2.fillna("").to_dict(orient="split")
    if len(response) > 0:
        return jsonify({"response": response})
    else:
        return jsonify({"message": "No need to subset columns"})

@app.route('/check-aggregation')
def check_aggregation():
    '''
    Check if the loaded dataset needs to be aggregated
    in order to be joined to the current data
    (e.g., the loaded dataset is for Census tracts instead of counties)
    '''
    global df2
    df2_copy = df2.copy()
    row_ratio = len(df2) / len(current_data)
    if row_ratio > 4.5:
        df2, response = check_and_aggregate(client, current_data, df2, model="o4-mini")
        if len(df2) / len(current_data) > 4.5:
            issue = "Potentially bad aggregation detected."
            issue += " There were still way too many rows in df2 for df1 after attempted aggregation."
            issue += " It's likely that the aggregation grouping was incorrect, perhaps over-specified."
            df2, response = check_and_aggregate(client, current_data, df2_copy, 
                                                old_cols = response['columns'], old_issue=issue,
                                                model="o4-mini")
        elif len(df2) / len(current_data) < 0.65:
            issue = "Potentially bad aggregation detected."
            issue += " There were way too few rows in df2 for df1 after attempted aggregation."
            issue += " It's likely that the aggregation grouping was incorrect, perhaps under-specified."
            df2, response = check_and_aggregate(client, current_data, df2_copy, 
                                                old_cols = response['columns'], old_issue=issue,
                                                model="o4-mini")
        return jsonify({"response": response})
    else:
        return jsonify({"message": "No need to aggregate"})

@app.route('/join-table')
def join_table():
    '''
    With help from GPT, write and run a pd.merge() command 
    to join the loaded dataset into the current data
    '''
    global current_data#, client
    file_str = request.args.get('file')
    ## MAKE COPIES FOR POTENTIAL RECOVERY
    current_data_copy = current_data.copy()
    df2_copy = df2.copy()
    df2_only_columns = df2_copy.columns.difference(current_data_copy.columns, sort=False)
    ## MERGE THE DATAFRAMES
    df2_history[file_str]['final'] = df2.fillna("").to_dict(orient="split")
    merged, response = join_dataframes(client, current_data, df2, 
                                       template_cols=template_data.columns, model="o4-mini") ## gpt-4.1 OR o4-mini

    if "exception" in response:
        merged, response = join_dataframes(client, current_data_copy, df2_copy,
                                           response['code'], "EXCEPTION: " + response['exception'],
                                           template_cols=template_data.columns,
                                           model="o4-mini") ## gpt-4.1 OR o4-mini

    ## CHECK JOIN QUALITY AND RECOVER IF NECESSARY
    warnings_dict = check_join_quality(current_data, df2, merged, RELEVANT_COLS.copy(),
                                       df2_only_columns=df2_only_columns)
    if warnings_dict['status']['pct_missing'] > 0.3:
        warning_message = "Potentially bad join detected. "
        warning_message += str(warnings_dict['status']['pct_missing'] * 100)
        warning_message += " percent of merged rows have null values for df2 columns."
        warning_message += " Join key columns likely do not match."
        merged, response = join_dataframes(client, current_data_copy, df2_copy,
                                           response['code'], warning_message,
                                           template_cols=template_data.columns,
                                           model="o4-mini") ## gpt-4.1 OR o4-mini
        warnings_dict = check_join_quality(current_data, df2, merged, RELEVANT_COLS.copy(),
                                           df2_only_columns=df2_only_columns)

    if "exception" not in response:
        print(merged.head())
        ## Re-assign
        current_data = merged.copy()
        ## Check
        current_data.rename(columns={col: col[:-2] for col in current_data.columns if col.endswith('_x')},
                            inplace=True)
        current_data.drop(columns=[col for col in current_data.columns if col.endswith('_y')],
                          inplace=True)
        ## Return
        merged.to_csv("data/MERGED.csv")
        return jsonify({'response': response, 'history': df2_history[file_str],
                        'warnings': warnings_dict})
    else:
        return jsonify({'response': response, 'exception': True})


if __name__ == '__main__':
    app.run(debug=True)
