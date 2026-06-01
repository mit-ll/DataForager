# Copyright (c) 2026 Massachusetts Institute of Technology
# SPDX-License-Identifier: MIT

import requests, os, json, warnings
from dotenv import load_dotenv
from openai import OpenAI
import pandas as pd
from pandas.errors import DtypeWarning
import numpy as np
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from kaggle.api.kaggle_api_extended import KaggleApi

load_dotenv(dotenv_path='.env.local')
my_api_key = os.getenv("API_KEY")

client = OpenAI(api_key=my_api_key)


def k_choose_best_file(search_term, file_list, model="gpt-4.1-mini"):
    '''
    A kaggle dataset may contain many files.
    This function uses GPT to find which file we want,
    based only on the search result names of datasets.
    '''
    prompt = (
        "Help me choose one of the candidate file names for a data file matching this desired search:"
        f"{search_term}\n\n"
        "Here is a list of candidate URLs:\n\n"
        + "\n".join(file_list) +
        "\n\nPlease return the most relevant URL from the list that matches the description, or 'None' if no match is found." +
        "\n Respond in Python-readable JSON format with one attribute for the 'file_name' and another attribute for any 'explanation'."
    )
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0
    )
    text = response.choices[0].message.content
    print(text)
    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    if text.endswith("```"):
        text = text[:-len("```")].strip()
    return json.loads(text)

def k_check_reasonability(dataset_dicts, topic, model="gpt-4.1-nano"):
    '''
    This function helps eliminate search results from the Kaggle API
    when those results are not actually relevant
    (e.g., I search "life expectancy in US counties" 
    and get "climate change in Romania")
    '''
    tup_strings = [d['ref'] + ": " + d['title'] for d in dataset_dicts]
    prompt = '''
    I am looking for data on {}.
    I have some candidate files, but several of them are probably not relevant.
    Quickly help me eliminate the files that are not very good matches and
    are unlikely to have the data I want. I will give you IDs and names of datasets.

    datasets=
    ```
    {}
    ```

    Return your answer as a Python-readable JSON object with one list of relevant data IDs and one explanation, and nothing but the JSON:
    {{"relevant_ids": ["id/id1", "id/id2"],
      "explanation": "These datasets are likely..."}}
    '''.format(topic, tup_strings)

    response = client.responses.create(
        model=model,
        temperature=0.0 if model!="o4-mini" else None,
        input=prompt,
        # model="o4-mini",
    )

    text = response.output_text
    # print(text)
    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    # if text.endswith("```"):
    #     text = text[:-len("```")].strip()
    if "```" in text:
        idx = text.index("```")
        text = text[:idx]

    response_json = json.loads(text)
    # print(response_json)
    relevant_dataset_dicts = [d for d in dataset_dicts if d['ref'] in response_json['relevant_ids']]
    return relevant_dataset_dicts

def check_for_relevant_data(df_head, query, model="gpt-4.1-nano"):
    '''
    Given a data file from a Kaggle or Web dataset,
    determine if it is relevant to what the user searched for
    and if it could reasonably be joined into another dataset.
    '''
    prompt = '''
    I am looking for data on "{}".
    I have some candidate files, but I am not sure if they contain the data I want.
    Let me know if you are pretty confident that this file contains the data I want,
    meaning that there is a column at least appearing to directly correspond to what I want
    (not just similar, and not requiring additional derivation),
    and it could be joined in to another dataset appropriately (perhaps after a simple row aggregation).
    There should be a column in the data that seems at least somewhat likely to match what I want.

    df1=
    ```
    {}
    ```

    Return your answer as a Python-readable JSON object with one relevance decision and one explanation, and nothing but the JSON:
    {{"relevance_decision": true,
      "explanation": "This file does contain..."}}
    '''.format(query, df_head.to_csv(index=False))

    response = client.responses.create(
        model=model,
        temperature=0.0 if model!="o4-mini" else None,
        input=prompt,
        # model="o4-mini",
    )

    text = response.output_text
    # print(text)
    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    # if text.endswith("```"):
    #     text = text[:-len("```")].strip()
    if "```" in text:
        idx = text.index("```")
        text = text[:idx]

    try:
        response_json = json.loads(text)
    except:
        response_json = {"relevance_decision": 'false', 'explanation': 'ERROR'}
    # print(response_json)
    return response_json

def k_choose_best_file_from_df(possible_matches, query, model="gpt-4.1-mini"):
    '''
    When there are multiple relevant data files in a Kaggle dataset,
    this function is used to ask GPT which is the best data file
    corresponding to the user's intent.
    '''
    prompt = '''
    I am looking for data on "{}". I have some candidate files.
    Choose the candidate file that is the most likely one to contain the data I want,
    meaning that there is a column at least appearing to directly correspond to what I want
    (not just similar, and not requiring additional derivation),
    and it could be joined in to another dataset appropriately (perhaps after a simple row aggregation).
    There should be a column in the data that seems at least somewhat likely to match what I want.

    datasets=
    ```
    {}
    ```

    Return your answer as a Python-readable JSON object with one relevance decision and one explanation, and nothing but the JSON:
    {{"filepath": "data/file.csv",
      "explanation": "This file is the most likely one contain..."}}
    '''.format(json.dumps(possible_matches, indent=2), query)

    response = client.responses.create(
        model=model,
        temperature=0.0 if model!="o4-mini" else None,
        input=prompt,
        # model="o4-mini",
    )

    text = response.output_text
    # print(text)
    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    # if text.endswith("```"):
    #     text = text[:-len("```")].strip()
    if "```" in text:
        idx = text.index("```")
        text = text[:idx]

    try:
        response_json = json.loads(text)
    except:
        response_json = {"relevance_decision": 'false', 'explanation': 'ERROR'}
    # print(response_json)
    return response_json

def get_all_links(url, csv_only=True):
    '''
    Scrape all links from a Web page,
    in service of finding dataset download links.
    '''
    response = requests.get(url)
    if response.status_code != 200:
        print(f"Failed to retrieve page. Status code: {response.status_code}")
        return []
    soup = BeautifulSoup(response.text, 'html.parser')
    links = []
    for a_tag in soup.find_all('a', href=True):
        absolute_url = urljoin(url, a_tag['href'])  # Convert relative URLs to absolute
        link_text = a_tag.get_text(strip=True)      # Clean and get visible text
        links.append({
            "url": absolute_url.lower(),
            "text": link_text
        })
    # links_final = list(set(links))
    # print("***")
    # print(links_final)
    # print("***")
    if csv_only:
        link_set_new = [link for link in links if ".csv" in link['url']]
        # link_set_new = [link for link in links_final if ".csv" in link]
        links_final = link_set_new
    return links_final  # Remove duplicates


def choose_best_link(description, url_list, model="gpt-4.1-mini"):
    '''
    Given a list of links all scraped from the same Web page,
    use GPT to determine the best link corresponding to the
    data file that the user wants
    '''
    prompt = '''
        Help me choose one of the candidate URLs for a data file that best matches this description:
        {}
        Here is a list of candidate URLs and associated text (note that the text may be missing, then rely just on the URL):
        {}
        Please return the most relevant URL from the list that best matches the description, or 'None' if no match is found.
        Respond in Python-readable JSON format with one attribute for the URL and another attribute for any explanation:
        {{"url": "https://link-to-data.com/[...]/[...].csv[...]", 
          "explanation": "This file best matches the description because..."
        }}
    '''.format(description, json.dumps(url_list, indent=2))# "\n".join(url_list))
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0
    )
    # text = response.output_text
    text = response.choices[0].message.content
    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    if text.endswith("```"):
        text = text[:-len("```")].strip()
    return json.loads(text)


def get_source_list(desired_attribute):
    '''
    Ask GPT-4.1 to ideate sources on the Web
    from which a relevant dataset could be downloaded
    '''
    prompt = '''
    Do any organizations collect and publicly release for download (with no sign-up requred) data about: {}?
    Provide a concise but diverse set of 4-5 reputable sources. Ensure sources are non-redundant (all URLs should have different base domains).
    Provide your output as a Python-readable JSON object with an "answer" and a "source list", each source having the title of the "organization" and a relevant "url".
    {{"source_list": [{{"organization": "Government Department", "url": "https://department.gov/[...]"}}, {{"organization": "Data Consortium", "url": "https://dataconsortium.org/[...]"}}],
      "answer": "Yes, multiple organizations do this..."
    }}
    '''.format(desired_attribute)
    response = client.responses.create(
        model="gpt-4.1",
        input=prompt,
        temperature=0.0
    )
    # text = response.choices[0].message.content
    text = response.output_text
    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    if text.endswith("```"):
        text = text[:-len("```")].strip()
    try:
        return_obj = json.loads(text)
    except Exception as e:
        print("*****")
        print("Something went wrong...")
        print(e)
        print(response)
        print("*****")
        return_obj = {}
    finally:
        return return_obj


def get_data_from_source(desired_attribute, source="a reputable source"):
    '''
    Given an organization name and URL from GPT-4.1,
    try to find a downloadable Web dataset from that organization
    '''
    prompt='''
    Find me where I can download a CSV format dataset from {} about {}.
    Provide the exact link to the page where I can click to start downloading the CSV, not to the CSV itself.
    Find a page such that clicking the link should immediately yield the CSV file, not another data download page.
    Ensure the text to click is for the correct CSV file.
        {{"url": "https://link-to-data.com/...", 
          "text_to_click": "Data I Want [1 MB]...", 
          "explanation": "This dataset provides... The source is..."
        }}
    Provide your entire response within the Python-readable JSON format.
    '''.format(source, desired_attribute)
    response = client.responses.create(
        model="gpt-4.1",
        temperature=0.8,  ## Not sure what's best here... was 0.8 for a while, but that wasn't always good
        tool_choice={"type": "web_search_preview"},
        tools=[{"type": "web_search_preview",
                "search_context_size": "high"}],
        input=prompt,
    )
    # # Get the message output object (2nd item in response.output)
    # message = response.output[1]
    # # Get the ResponseOutputText object
    # text_output = message.content[0]
    # # Access the actual message string
    # text = text_output.text
    # print(text)
    text = response.output_text
    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    # if text.endswith("```"):
    #     text = text[:-len("```")].strip()
    if "```" in text:
        idx = text.index("```")
        text = text[:idx]
    try:
        return_obj = json.loads(text)
    except Exception as e:
        print("*****")
        print("Something went wrong...")
        print(e)
        print(response)
        print("*****")
        return_obj = {"source_list": []}
    finally:
        return return_obj

def get_remote_file_size(url):
    '''
    Try to determine the file size of a Web dataset,
    so we can avoid downloading really huge files
    '''
    try:
        response = requests.head(url, allow_redirects=True)
        if response.status_code == 200 and 'Content-Length' in response.headers:
            size_bytes = int(response.headers['Content-Length'])
            return size_bytes
    except Exception as e:
        print(e)
    return None

def join_dataframes(client, df1, df2, old_code=None, old_issue=None, template_cols=None, model="gpt-4.1"):
    '''
    Ask GPT to write a pd.merge() command to join two data tables;
    GPT will also include any column transformations necessary
    before writing the merge
    '''
    if template_cols is not None:
        df1_p = df1[template_cols]
    else:
        df1_p = df1
    
    prompt = '''
    Given two Pandas Dataframes, suggest what `pd.merge` parameters to use to join the dataframes.

    df1=
    ```
    {}
    ```

    df1's column data types are:
    {}

    df2=
    ```
    {}
    ```

    df2's column data types are:
    {}

    Complete the correct Pandas merge command. `pd.merge(df1, df2, how='left', left_on=

    If the two dataframes cannot yet be merged, output Pandas column transformations to get make them mergeable.
    Do not overwrite the original columns in df1, and avoid any unnecessary transformation steps.
    The code itself does not need to have comments but *must* be valid to run as-is.
    Return your answer as a Python-readable JSON object with one code solution and one explanation, and nothing but the JSON:
    {{"code": "[Any necessary transformations] merged=pd.merge(...)",
      "explanation": "Here's how you can join..."}}
    '''.format(pd.concat([df1_p.head(), df1_p.iloc[5:].sample(n=2, random_state=0)]).to_csv(index=False),
               {col : str(df1_p.dtypes[col]) for col in df1_p.columns},
               pd.concat([df2.head(), df2.iloc[5:].sample(n=2, random_state=0)]).to_csv(index=False),
               {col : str(df2.dtypes[col]) for col in df2.columns})

    if old_code is not None and old_issue is not None:
        print("** INITIATING JOIN RECOVERY **")
        prompt += "\n\nThe following code already didn't work: {}".format(old_code)
        prompt += "\n\nThe following was the issue: '{}'".format(old_issue)
        prompt += "\n\nYour response should write the transformation and merge code from scratch, assuming the old code was never run."

    response = client.responses.create(
        model=model,
        temperature=0.0 if model=="gpt-4.1" else None,
        input=prompt,
        # model="o4-mini",
    )

    text = response.output_text
    # print(text)
    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    # if text.endswith("```"):
    #     text = text[:-len("```")].strip()
    if "```" in text:
        idx = text.index("```")
        text = text[:idx]

    response_json = json.loads(text)

    exec_env = {"df1": df1, "df2": df2, "pd": pd}
    try:
        exec(response_json['code'], exec_env)
        return exec_env['merged'], response_json
    except Exception as e:
        print(e)
        response_json['exception'] = str(e)
        return df1, response_json


def subset_columns(client, df, attribute_of_interest, model="gpt-4.1"):
    '''
    Ask GPT to choose a relevant subset of columns
    from a dataset with a huge number of columns,
    based on the user's intent
    '''
    prompt = '''
    Here are some column names from a pandas dataframe. Please select: (1) the most basic or essential columns,
    that I would need in order to join this dataset to another dataset.
    (2) columns related to {}. (3) 2-3 other columns also relevant to {}.
    Return me a list of those essential columns such that I could subset the dataframe in pandas.
    Column names: {}
    The output should be like this, in Python-readable JSON format with nothing else returned:
    {{"col_list": ["col_1", "col_2", ...]
      "explanation": "These columns..."}}
    '''.format(attribute_of_interest, attribute_of_interest, list(df.columns))

    response = client.responses.create(
        model=model,
        temperature=0.0 if model=="gpt-4.1" else None,
        input=prompt,
        # model="o4-mini",
    )

    text = response.output_text
    # print(text)
    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    # if text.endswith("```"):
    #     text = text[:-len("```")].strip()
    if "```" in text:
        idx = text.index("```")
        text = text[:idx]

    response_json = json.loads(text)

    df = df[response_json['col_list']]
    return df, response_json


def check_and_aggregate(client, df1, df2, old_cols=None, old_issue=None, model="gpt-4.1"):
    '''
    Determine if a potential dataframe to join has to be aggregated
    before joining it to the current dataset, using GPT;
    if yes, determine the aggregation columns/keys and then aggregate
    '''
    prompt = '''
    Determine if df2 has multiple entries for each entity in df1 based on their first few rows.
    (Make sure df2 does not contain repeated measues or subdivisions for df1 entities.)
    If it does, then write a python list of column names that serve as grouping keys, 
    which I could use in a groupy operation to aggregate down to one row per entity.
    Be careful to select a sufficiently unique grouping key of one or more columns,
    to avoid similarly-named but distinct rows from being grouped together.
    If not, simply return an empty python list.
    Use no libraries besides pandas as pd numpy as np

    df1=
    ```
    {}
    ```

    df2=
    ```
    {}
    ```

    The output should be like this, in Python-readable JSON format with nothing else returned:
    {{"columns": ["col_1", "col_2"]
      "explanation": "There are..."}}
    '''.format(df1.head().to_csv(index=False), df2.head(10).to_csv(index=False))

    if old_cols is not None and old_issue is not None:
        print("** INITIATING AGGREGATION RECOVERY **")
        old_cols_str = ", ".join(old_cols)
        prompt += "\n\nThe following columns already didn't work for grouping: [{}]".format(old_cols_str)
        prompt += "\n\nThe following was the issue: '{}'".format(old_issue)

    response = client.responses.create(
        model=model,
        temperature=0.0 if model=="gpt-4.1" else None,
        input=prompt,
        # model="o4-mini",
    )

    text = response.output_text
    # print(text)
    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    # if text.endswith("```"):
    #     text = text[:-len("```")].strip()
    if "```" in text:
        idx = text.index("```")
        text = text[:idx]

    response_json = json.loads(text)

    group_cols = response_json['columns']
    if len(group_cols) == 0:
        return df2
    numeric_cols = df2.select_dtypes(include=[np.number]).columns.tolist()
    string_cols = [c for c in df2.columns if c not in numeric_cols + group_cols]
    agg_dict = {c: 'median' for c in numeric_cols}
    for c in string_cols:
        agg_dict[c] = lambda s: s.dropna().mode().iat[0] if not s.dropna().mode().empty else ""
    # print(df2.columns)
    # print(group_cols)
    df2 = df2.groupby(group_cols, as_index=False).agg(agg_dict)
    return df2, response_json


def check_dtype_warning(client, df, model="gpt-4.1"):
    '''
    Using GPT, check if a dataframe has an extra header column,
    since we detected a datatype warning on load
    '''
    prompt = '''
    I want to join two pandas dataframes.
    However, I suspect that the df has multiple, redundant header rows at the top.
    In other words, in the body data rows, there may be one or more extra headers at the top.
    Determine how many *extra* rows at the top there are that should be removed,
    not counting the top-level normal variable names.
    Return the number of extra rows to remove from the top (0 or more) and an explanation in JSON.
    Even if there are no extra rows, still return similar output with the number 0.

    df=
    ```
    {}
    ```

    The output should be like this, in Python-readable JSON format with nothing else returned:
    {{"num_extra_rows": 1
      "explanation": "There are..."}}
    '''.format(df.head(10).to_csv(index=False))

    response = client.responses.create(
        model=model,
        temperature=0.0 if model=="gpt-4.1" else None,
        input=prompt,
        # model="o4-mini",
    )

    text = response.output_text
    # print(text)

    if text.startswith("```json"):
        text = text[len("```json"):].strip()
    # if text.endswith("```"):
    #     text = text[:-len("```")].strip()
    if "```" in text:
        idx = text.index("```")
        text = text[:idx]

    response_json = json.loads(text)
    # print(response_json)

    num_extra_rows = response_json['num_extra_rows']
    df = df.iloc[num_extra_rows:]
    return df, response_json


def check_join_quality(df1, df2, merged, RELEVANT_COLS, df2_only_columns=None):
    '''
    Check how well the table join code worked;
    compute how many rows went un-matched and now have nulls;
    save these null rows to present on the history tabs
    '''
    warnings_dict = dict()
    warnings_dict['warnings_list'] = []
    ## DETECT BAD JOINS RESULTING IN TOO MANY ROWS
    if (len(merged) - len(df1)) / len(df1) > 0.5:
        w = "TOO MANY OUTPUT ROWS -- POTENTIALLY INSUFFICIENT JOIN KEY OR POOR AGGREGATION"
        print(w)
        warnings_dict['warnings_list'].append(w)
    ## DETECT BAD JOINS RESULTING IN MANY NULL VALUES
    if df2_only_columns is None:
        df2_only_columns = df2.columns.difference(df1.columns, sort=False)
    rows_null_df2_cols = merged[df2_only_columns].isnull().sum(axis=1)
    max_missing_cols = max(rows_null_df2_cols)
    num_missing = len(rows_null_df2_cols[rows_null_df2_cols == max_missing_cols])
    pct_missing = num_missing / len(merged)
    if max_missing_cols >= 1 and len(df2_only_columns) - max_missing_cols <= min(2, len(df2_only_columns) - 1):
        m = str(num_missing) + " rows with " + str(max_missing_cols) + " null columns from df2"
    else:
        m = "No rows with null columns from df2"
        num_missing = 0
        pct_missing = 0
    warnings_dict['status'] = {"num_null_rows": num_missing, "pct_missing": pct_missing}
    warnings_dict['status']['message'] = m
    print(m)
    ## MORE SPECIFIC TESTS
    df1_null = df1.isna().sum().sum()
    df2_null = df2.isna().sum().sum()
    merged_null = merged.isna().sum().sum()
    # print(merged_null - df1_null - df2_null, len(merged) * len(df2.columns) // 2)
    df1_rows_na = df1.isnull().any(axis=1).sum()
    df2_rows_na = df2.isnull().any(axis=1).sum()
    merged_rows_na = merged.isnull().any(axis=1).sum()
    # print(df1_rows_na, df2_rows_na, merged_rows_na)
    if (merged_null - df1_null - df2_null) >= (len(merged) * len(df2.columns) // 2):
        w = "POTENTIALLY BAD JOIN DETECTED"
        print(w)
        warnings_dict['warnings_list'].append(w)
    elif (merged_rows_na > 2*(df1_rows_na+df2_rows_na)) and merged_rows_na > len(merged) / 10:
        w = "POTENTIAL MINOR JOIN ISSUE DETECTED"
        print(w)
        warnings_dict['warnings_list'].append(w)
    ## Save null rows
    if num_missing > 0:
        null_rows = merged[rows_null_df2_cols == max_missing_cols].copy()
        null_rows.rename(columns={col: col[:-2] for col in null_rows.columns if col.endswith('_x')},
                        inplace=True)
        null_rows.drop(columns=[col for col in null_rows.columns if col.endswith('_y')],
                    inplace=True)
        null_rows_fewcols = null_rows[RELEVANT_COLS + df2_only_columns.to_list()]
        warnings_dict['status']['null_rows'] = prepareNullRows(null_rows_fewcols)
    else:
        warnings_dict['status']['null_rows'] = pd.DataFrame().to_dict(orient="split")
    return warnings_dict

def prepareNullRows(df):
    '''
    Helper function to prepare null (unmatched) rows
    '''
    if len(df) <= 5:
        df_small = df
    else:
        df_small = df.sample(n=5, random_state=0)
    if "FIPS" in df_small.columns.to_list():
        df_small = df_small.sort_values(by="FIPS")
    return df_small.fillna("").to_dict(orient="split")

def cleanColumns(df2):
    '''
    Helper function for manual, rule-based
    cleaning of data columns
    '''
    df2.columns = df2.columns.str.strip("'") ## MANUALLY ADDED
    df2.rename(columns={df2.columns[0]: df2.columns[0].lstrip('\ufeff')}, inplace=True)
    df2.rename(columns={df2.columns[0]: df2.columns[0].replace("ï»¿", "")}, inplace=True)
    for col in df2.columns:
        if pd.api.types.is_string_dtype(df2[col]):
            # print(col, type(col))
            df2[col] = df2[col].apply(lambda val: val.strip("'")) ## MANUALLY ADDED
        if "code" in col.lower() or "fips" in col.lower() or "id" in col.lower():
            # print(col, "branch1")
            if "." not in str(df2[col].iloc[0]):
                df2[col] = df2[col].astype(str)
        else: 
            if pd.api.types.is_string_dtype(df2[col]) or (pd.api.types.is_object_dtype(df2[col]) and 
                                                          not pd.api.types.is_string_dtype(df2[col])):
                # print(col, "branch2")
                example_val = df2[col].iloc[0]
                # print(col, example_val, example_val.replace(".","").isdigit())
                if example_val.isdigit():
                    df2[col] = df2[col].astype(float)
                if "." in example_val and example_val.replace(".","").isdigit():
                    df2[col] = df2[col].astype(float)
        # if len(df2.columns) < 20:
        #     print(col, df2[col].dtype,
        #           pd.api.types.is_string_dtype(df2[col]),
        #           pd.api.types.is_object_dtype(df2[col]),
        #           pd.api.types.is_numeric_dtype(df2[col]))
    return df2
