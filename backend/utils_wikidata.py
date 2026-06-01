# Copyright (c) 2026 Massachusetts Institute of Technology
# SPDX-License-Identifier: MIT

import requests, os
import pandas as pd
from collections import defaultdict


def get_county_properties():
    '''
    From Wikidata, get a list of all county properties,
    including a readable label, description, and data type.
    Format this nicely and return it as a Pandas dataframe.
    '''
    query = '''
    SELECT DISTINCT ?property ?propertyLabel ?propertyDescription ?datatypeLabel WHERE {
    ?item wdt:P882 ?fips.      # Entities with FIPS code
    ?item ?p ?value.
    ?property wikibase:directClaim ?p.
    ?property wikibase:propertyType ?datatype.

    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY ?propertyLabel
    '''

    url = "https://query.wikidata.org/sparql"
    headers = {"Accept": "application/sparql-results+json"}
    response = requests.get(url, params={"query": query}, headers=headers)
    response_json = response.json()
    # print(data['results'])
    data = []
    for item in response_json['results']['bindings']:
        prop_id = item['property']['value'].split('/')[-1]
        label = item['propertyLabel']['value']
        description = item.get('propertyDescription', {}).get('value', '')
        dtype = item['datatypeLabel']['value']
        data.append({
            "Property_ID": prop_id,
            "Label": label,
            "Description": description,
            "Data_Type": dtype
        })

    df = pd.DataFrame(data)
    # df.to_csv("data/static/wikidata_county_properties.csv", index=False)
    # print(df.head())
    return df

def get_county_property_counts():
    '''
    Get the number of occurrences for each county property.
    In other words, count how many counties have each property.
    Return a Pandas dataframe.
    '''
    query = '''
    SELECT ?property (COUNT(DISTINCT ?item) AS ?count) WHERE {
    ?item wdt:P882 ?fips.
    ?item ?p ?value.
    ?property wikibase:directClaim ?p.
    }
    GROUP BY ?property
    ORDER BY DESC(?count)
    '''
    url = "https://query.wikidata.org/sparql"
    headers = {"Accept": "application/sparql-results+json"}
    response = requests.get(url, params={"query": query}, headers=headers)
    print(response)
    data = response.json()
    # print(data['results'])
    data_rows = []
    for item in data['results']['bindings']:
        property_id = item['property']['value'].split('/')[-1]
        count = int(item['count']['value'])
        # print(f"{property_id} ({count})")
        data_rows.append({
            "Property_ID": property_id,
            # "Label": property_label,
            "Usage_Count": count
        })
    # Load into DataFrame
    df = pd.DataFrame(data_rows)
    # df.to_csv("data/static/wikidata_county_property_counts.csv", index=False)
    # print(df.head())
    return df

def get_property_metadata(property_id, language="en"):
    '''
    CURRENTLY UNUSED
    Fetch label and datatype for a Wikidata property
    '''
    url = "https://www.wikidata.org/w/api.php"
    params = {
        "action": "wbgetentities",
        "format": "json",
        "ids": property_id,
        "props": "labels|datatype",
        "languages": language
    }
    res = requests.get(url, params=params)
    # print(res)
    if res.status_code != 200:
        return property_id, ""
    data_raw = res.json()
    # print(data_raw)
    data = data_raw["entities"][property_id]
    if language in data["labels"]:
        label = data["labels"][language]["value"]
    else:
        label = property_id
    datatype = data["datatype"]
    return label, datatype

def wikidata_get_properties_counties():
    '''
    This function just retrieves the list of cached county properties,
    or calls the above functions to retrieve the properties from Wikidata again.
    '''
    if "COUNTIES_WIKIDATA_PROPERTIES.csv" in os.listdir("data/static"):
        county_properties = pd.read_csv("data/static/COUNTIES_WIKIDATA_PROPERTIES.csv")
    else:
        county_properties_0 = get_county_properties()
        property_counts = get_county_property_counts()
        county_properties = pd.merge(county_properties_0, property_counts, on="Property_ID")
        county_properties.to_csv("data/static/COUNTIES_WIKIDATA_PROPERTIES.csv", index=False)
    county_properties_clean = county_properties.fillna(value="")
    # Quality control
    county_properties_clean['Label'] = county_properties_clean['Label'].apply(lambda x: x.capitalize())
    cp_small = county_properties_clean[county_properties_clean['Data_Type'] != "http://wikiba.se/ontology#ExternalId"]
    cp_small = cp_small[cp_small['Data_Type'] != "http://wikiba.se/ontology#CommonsMedia"]
    cp_small = cp_small[~cp_small['Label'].str.contains("category")]
    cp_small = cp_small.sort_values('Usage_Count', ascending=False)
    first_three_rows = cp_small.iloc[:3]
    remaining_rows = cp_small.iloc[3:]
    cp_small = pd.concat([remaining_rows, first_three_rows])
    cp_small['source'] = "wikidata"
    # Return
    county_properties_list = cp_small.to_dict(orient='records')
    return county_properties_list

def fetch_county_data_flexibly_OLD(attribute_pid, property_label=None, limit=10000, collapse=True):
    '''
    NOT USED; SEE fetch_county_data_flexibly() BELOW
    '''
    attr_label, attr_datatype = get_property_metadata(attribute_pid)

    if attr_label == attribute_pid and property_label is not None:
        attr_label = property_label
    # Build SPARQL query with optional valueLabel if needed
    use_label = attr_datatype == "wikibase-item"
    select_fields = "?county ?fips ?value"
    if use_label:
        select_fields += " ?valueLabel"

    query = f"""
SELECT {select_fields} WHERE {{
    ?county wdt:P882 ?fips.
    OPTIONAL {{ ?county wdt:{attribute_pid} ?value. }}
    {'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }' if use_label else ''}
}}
LIMIT {limit}
    """

    url = "https://query.wikidata.org/sparql"
    headers = {"Accept": "application/sparql-results+json"}
    response = requests.get(url, headers=headers, params={"query": query})
    response.raise_for_status()
    results = response.json()["results"]["bindings"]

    # Parse each result row
    # Collect multiple values per FIPS
    grouped_data = defaultdict(list)

    for item in results:
        fips = item["fips"]["value"].zfill(5)
        raw_value = item.get("value", {}).get("value", None)

        if attr_datatype == "wikibase-item":
            value = item.get("valueLabel", {}).get("value", raw_value)
        elif attr_datatype == "quantity":
            try:
                value = float(raw_value) if raw_value else None
            except:
                value = None
        else:
            value = raw_value

        if value is not None:
            grouped_data[fips].append(value)

    # Aggregate into rows: 1 per FIPS, values as list or scalar
    rows = []
    for fips, values in grouped_data.items():
        if collapse:
            final_value = values[0]
        else:
            final_value = values[0] if len(values) == 1 else values
        rows.append({
            "FIPS": fips,
            attr_label.capitalize(): final_value
        })

    df = pd.DataFrame(rows)
    df["FIPS"] = df["FIPS"].astype(str).str.zfill(5)
    return df, query

def fetch_county_data_flexibly(attribute_pid, property_label=None, limit=10000, collapse=True):
    '''
    Query Wikidata to get a certain attribute's values
    for every county in the U.S., and then re-format this data
    into a Pandas dataframe.
    '''
    attr_df = pd.read_csv("data/static/COUNTIES_WIKIDATA_PROPERTIES.csv")
    row = attr_df[attr_df['Property_ID'] == attribute_pid]
    attr_label = row['Label'].item().capitalize()
    attr_datatype = row['Data_Type'].item()

    # Build SPARQL query with optional valueLabel if needed
    use_label = attr_datatype.endswith("WikibaseItem")
    select_fields = "?county ?fips ?value"
    if use_label:
        select_fields += " ?valueLabel"

    query = f"""
SELECT {select_fields} WHERE {{
    ?county wdt:P882 ?fips.
    OPTIONAL {{ ?county wdt:{attribute_pid} ?value. }}
    {'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }' if use_label else ''}
}}
LIMIT {limit}
    """

    url = "https://query.wikidata.org/sparql"
    headers = {"Accept": "application/sparql-results+json"}
    response = requests.get(url, headers=headers, params={"query": query})
    response.raise_for_status()
    results = response.json()["results"]["bindings"]

    # Parse each result row
    # Collect multiple values per FIPS
    grouped_data = defaultdict(list)

    for item in results:
        fips = item["fips"]["value"].zfill(5)
        raw_value = item.get("value", {}).get("value", None)

        if attr_datatype.endswith("WikibaseItem"):
            value = item.get("valueLabel", {}).get("value", raw_value)
        elif attr_datatype.endswith("Quantity"):
            try:
                value = float(raw_value) if raw_value else None
            except:
                value = None
        # elif attr_datatype.endswith("Time"):
        #     try:
        #         value = pd.to_datetime(raw_value)
        #     except:
        #         value = None
        else:
            value = raw_value

        if value is not None:
            grouped_data[fips].append(value)

    # Aggregate into rows: 1 per FIPS, values as list or scalar
    rows = []
    for fips, values in grouped_data.items():
        if collapse:
            final_value = values[0]
        else:
            final_value = values[0] if len(values) == 1 else values
        rows.append({
            "FIPS": fips,
            attr_label.capitalize(): final_value
        })

    df = pd.DataFrame(rows)
    df["FIPS"] = df["FIPS"].astype(str).str.zfill(5)
    return df, query


def get_airport_properties():
    '''
    From Wikidata, get a list of all airport properties,
    including a readable label, description, and data type.
    Format this nicely and return it as a Pandas dataframe.
    '''
    query = '''
    SELECT DISTINCT ?property ?propertyLabel ?propertyDescription ?datatypeLabel WHERE {
    ?item wdt:P238 ?iata.      # Entities with IATA code
    ?item wdt:P17 wd:Q30.          # Country is United States
    ?item ?p ?value.
    ?property wikibase:directClaim ?p.
    ?property wikibase:propertyType ?datatype.

    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY ?propertyLabel
    '''

    url = "https://query.wikidata.org/sparql"
    headers = {"Accept": "application/sparql-results+json"}
    response = requests.get(url, params={"query": query}, headers=headers)
    response_json = response.json()
    # print(data['results'])
    data = []
    for item in response_json['results']['bindings']:
        prop_id = item['property']['value'].split('/')[-1]
        label = item['propertyLabel']['value']
        description = item.get('propertyDescription', {}).get('value', '')
        dtype = item['datatypeLabel']['value']
        data.append({
            "Property_ID": prop_id,
            "Label": label,
            "Description": description,
            "Data Type": dtype
        })

    df = pd.DataFrame(data)
    # df.to_csv("data/static/wikidata_airport_properties.csv", index=False)
    # print(df.head())
    return df

def get_airport_property_counts():
    '''
    Get the number of occurrences for each airport property.
    In other words, count how many airports have each property.
    Return a Pandas dataframe.
    '''
    query = '''
    SELECT ?property (COUNT(DISTINCT ?item) AS ?count) WHERE {
    ?item wdt:P238 ?iata.      # Entities with IATA code
    ?item wdt:P17 wd:Q30.          # Country is United States
    ?item ?p ?value.
    ?property wikibase:directClaim ?p.
    }
    GROUP BY ?property
    ORDER BY DESC(?count)
    '''
    url = "https://query.wikidata.org/sparql"
    headers = {"Accept": "application/sparql-results+json"}
    response = requests.get(url, params={"query": query}, headers=headers)
    print(response)
    data = response.json()
    # print(data['results'])
    data_rows = []
    for item in data['results']['bindings']:
        property_id = item['property']['value'].split('/')[-1]
        count = int(item['count']['value'])
        # print(f"{property_id} ({count})")
        data_rows.append({
            "Property_ID": property_id,
            # "Label": property_label,
            "Usage_Count": count
        })
    # Load into DataFrame
    df = pd.DataFrame(data_rows)
    # df.to_csv("data/static/wikidata_airport_property_counts.csv", index=False)
    # print(df.head())
    return df

def wikidata_get_properties_airports():
    '''
    This function just retrieves the list of cached airport properties,
    or calls the above functions to retrieve the properties from Wikidata again.
    '''
    if "AIRPORTS_WIKIDATA_PROPERTIES.csv" in os.listdir("data/static"):
        airport_properties = pd.read_csv("data/static/AIRPORTS_WIKIDATA_PROPERTIES.csv")
    else:
        airport_properties_0 = get_airport_properties()
        property_counts = get_airport_property_counts()
        airport_properties = pd.merge(airport_properties_0, property_counts, how='left', on="Property_ID")
        airport_properties.to_csv("data/static/AIRPORTS_WIKIDATA_PROPERTIES.csv", index=False)
    airport_properties_clean = airport_properties.fillna(value="")
    # Quality control
    airport_properties_clean['Label'] = airport_properties_clean['Label'].apply(lambda x: x.capitalize())
    ap_small = airport_properties_clean[airport_properties_clean['Data_Type'] != "http://wikiba.se/ontology#ExternalId"]
    ap_small = ap_small[ap_small['Data_Type'] != "http://wikiba.se/ontology#CommonsMedia"]
    ap_small = ap_small[~ap_small['Label'].str.contains("category")]
    ap_small = ap_small.sort_values('Usage_Count', ascending=False)
    numeric_properties = ap_small[ap_small['Data_Type'] == "http://wikiba.se/ontology#Quantity"]
    non_num_properties = ap_small[ap_small['Data_Type'] != "http://wikiba.se/ontology#Quantity"]
    # first_three_rows = ap_small.iloc[:3]
    # remaining_rows = ap_small.iloc[3:]
    ap_small = pd.concat([numeric_properties, non_num_properties])
    ap_small['source'] = "wikidata"
    # Return
    airport_properties_list = ap_small.to_dict(orient='records')
    return airport_properties_list

def fetch_airport_data_flexibly(attribute_pid, property_label=None, limit=10000, collapse=True):
    '''
    Query Wikidata to get a certain attribute's values
    for every airport in the U.S., and then re-format this data
    into a Pandas dataframe.
    '''
    attr_df = pd.read_csv("data/static/AIRPORTS_WIKIDATA_PROPERTIES.csv")
    row = attr_df[attr_df['Property_ID'] == attribute_pid]
    attr_label = row['Label'].item().capitalize()
    attr_datatype = row['Data_Type'].item()

    # Build SPARQL query with optional valueLabel if needed
    use_label = attr_datatype.endswith("WikibaseItem")
    select_fields = "?item ?iata ?value"
    if use_label:
        select_fields += " ?valueLabel"

    query = f"""
SELECT {select_fields} WHERE {{
    ?item wdt:P238 ?iata.
    ?item wdt:P17 wd:Q30          # Country is United States
    OPTIONAL {{ ?item wdt:{attribute_pid} ?value. }}
    {'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }' if use_label else ''}
}}
LIMIT {limit}
    """

    url = "https://query.wikidata.org/sparql"
    headers = {"Accept": "application/sparql-results+json"}
    response = requests.get(url, headers=headers, params={"query": query})
    response.raise_for_status()
    results = response.json()["results"]["bindings"]

    # Parse each result row
    # Collect multiple values per IATA
    grouped_data = defaultdict(list)

    for item in results:
        iata = item["iata"]["value"]#.zfill(5)
        raw_value = item.get("value", {}).get("value", None)

        if attr_datatype.endswith("WikibaseItem"):
            value = item.get("valueLabel", {}).get("value", raw_value)
        elif attr_datatype.endswith("Quantity"):
            try:
                value = float(raw_value) if raw_value else None
            except:
                value = None
        # elif attr_datatype.endswith("Time"):
        #     try:
        #         value = pd.to_datetime(raw_value)
        #     except:
        #         value = None
        else:
            value = raw_value

        if value is not None:
            grouped_data[iata].append(value)

    # Aggregate into rows: 1 per IATA, values as list or scalar
    rows = []
    for iata, values in grouped_data.items():
        if collapse:
            final_value = values[0]
        else:
            final_value = values[0] if len(values) == 1 else values
        rows.append({
            "IATA": iata,
            attr_label.capitalize(): final_value
        })

    df = pd.DataFrame(rows)
    return df, query
