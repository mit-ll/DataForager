# Copyright (c) 2026 Massachusetts Institute of Technology
# SPDX-License-Identifier: MIT

import pandas as pd
from openai import OpenAI
import faiss
from dotenv import load_dotenv
import numpy as np
import json
import os

# Your OpenAI API key
load_dotenv(dotenv_path='.env.local')
my_api_key = os.getenv("API_KEY")

client = OpenAI(api_key=my_api_key)

def load_index(index_filepath, metadata_filepath):
    '''
    Load a saved embedding index file
    '''
    index = faiss.read_index(index_filepath)
    with open(metadata_filepath) as f:
        metadata = json.load(f)
    return index, metadata

def get_embeddings(texts, model="text-embedding-3-small"):
    '''
    Use the OpenAI API to get embeddings for text input
    '''
    response = client.embeddings.create(
        input=texts,
        model=model
    )
    # print([r.embedding for r in response.data])
    return [r.embedding for r in response.data]

def search_kg_attributes(index, metadata, query, top_k=5):
    '''
    Get the top KG attribute matches based on embedding similarity
    '''
    query = '"' + query.strip("'").strip('"') + '"'
    query_vec = get_embeddings([query])[0]
    D, I = index.search(np.array([query_vec], dtype="float32"), top_k)
    return [{
        "Property_ID": metadata[i]["id"],
        "Label": metadata[i]["name"].capitalize() if metadata[i]["source"] else metadata[i]["name"],
        "source": metadata[i]["source"],
        "distance": float(D[0][j]),
        "search_result": True
    } for j, i in enumerate(I[0])]
