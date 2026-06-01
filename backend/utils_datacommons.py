# Copyright (c) 2026 Massachusetts Institute of Technology
# SPDX-License-Identifier: MIT

import requests, os, time
import pandas as pd
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env.local')
API_KEY = os.getenv("DC_API_KEY")

best_facets = {"PrecipitationRate": 2}

def get_facet(attr):
    '''
    Sometimes DataCommons has multiple data sources ("facets")
    for a given statistical attribute. For example, there may be
    multiple govt organizations that track, e.g., precipitation.
    This function quickly finds the most recent "facet" for Loving County, TX
    (so we can just run the full, all-counties query w/ this single facet).
    '''
    url = "https://api.datacommons.org/v2/observation"
    params = {
        "date": "LATEST",
        "variable.dcids": attr,
        "entity.dcids": "geoId/48301",  ## Loving County, TX
        "select": ["entity", "variable",
                   "value", "date"],
        "key": API_KEY  # Pass your API key here
    }
    response = requests.get(url, params=params)
    if response.status_code != 200:
        raise Exception(f"Error: {response.status_code} - {response.text}")
    results = response.json()
    if attr in best_facets:
        idx = best_facets[attr]
        return results['byVariable'][attr]['byEntity']['geoId/48301']['orderedFacets'][idx]['facetId']
    else:
        # print(results['byVariable'][attr]['byEntity']['geoId/48301']['orderedFacets'])
        return results['byVariable'][attr]['byEntity']['geoId/48301']['orderedFacets'][0]['facetId']

def fetch_county_stats(stat_var="Count_Person", var_label="Total Population", get_facet_first=True):
    '''
    Query DataCommons to get a certain statistical variable's values
    for every county in the U.S., and then re-format this data
    into a Pandas dataframe.
    (I'm honestly not sure if the var_label param does anything...)
    '''
    url = "https://api.datacommons.org/v2/observation"
    params = {
        "date": "LATEST",
        "variable.dcids": stat_var,
        "entity.expression": r"country/USA<-containedInPlace+{typeOf:County}",
        "select": ["entity", "variable",
                   "value", "date"],
        # "filter.facet_ids": ["2549898984"],
        # "select": "entity",
        # "select": "value",
        # "select": "variable",
        "key": API_KEY  # Pass your API key here
    }
    if get_facet_first:
        params["filter.facet_ids"] = [get_facet(stat_var)]
    response = requests.get(url, params=params)
    if response.status_code != 200:
        raise Exception(f"Error: {response.status_code} - {response.text}")
    results = response.json()
    # print(results)
    rows = []
    for key, val in results['byVariable'][stat_var]['byEntity'].items():
        d = {
            "FIPS": key.split("/")[-1],
            var_label: val['orderedFacets'][0]['observations'][0]['value']
        }
        rows.append(d)
    # print(results_list[0:5])
    # print(len(results_list))
    df = pd.DataFrame(rows)
    df["FIPS"] = df["FIPS"].astype(str).str.zfill(5)
    return df
