# DataForager

## Packages

Python version is 3.9.6

Make a `.venv` (mine is in the root directory): `python3 -m venv .venv`

Make sure you start the virtual environment: `source .venv/bin/activate`

Install packages from `requirements.txt`: `pip install -r requirements.txt`

The required NPM/React packages are in `frontend/package.json`. Assuming you have `npm`, they can be installed with: `npm install`

## API Keys

In the root directory, make a `.env.local` file with two variables: `API_KEY` for your OpenAI API Key, and `DC_API_KEY` for your DataCommons API Key.

With no `API_KEY`, you will probably not be able to start the backend.

With no `DC_API_KEY`, you can run the app, but don't try to add any DataCommons attributes.

Additionally, for the Kaggle API, you should follow the instructions [here](https://www.kaggle.com/docs/api) under the "Authentication" header. Note that your Kaggle API credentials will go in your home directory, not this project directory.

## Running the App

If you're on LL network/VPN, you may need to (1) set the proxy appropriately, and (2) uncoach the OpenAI API. Then...

Make sure your `.venv` is active (`source .venv/bin/activate`)

`cd backend` and then `python app.py`

`cd frontend` and then `npm start`

## Directories

`backend` has the Python code.

`frontend` has the JavaScript code.

`Sandbox` is not part of the system; it's largely testing code that I used during development. Some data files in the main app were generated from Python files in the Sanbox (see below).

### Where did the data files come from?

The Wikidata properties in `backend/data/static` were collected using `get_X_properties()` and `get_X_property_counts()` in `backend/utils_wikidata.py`. You can check `Sandbox/WIKIDATA_API_AIRPORTS.py` as well. (For counties, you can check `Sandbox/test_wikidata_api.py`, though that file is a mess and has a bunch of extra stuff, so the airports one.)

The DataCommons properties in `backend/data/static` were collected using code in `Sandbox/DATACOMMONS_API.py`.

The `faiss_X.index` and `metadata_X.json` files, used for embedding and search, were generated using `Sandbox/EMBEDDINGS_SETUP.py`.

Stuff in `backend/data/TEST` was saved from Kaggle or Web search as good example files, so those aren't super valuable.


## Disclosure
DISTRIBUTION STATEMENT A. Approved for public release. Distribution is unlimited.

This material is based upon work supported by the Combatant Commands under Air Force Contract No. FA8702-15-D-0001 or FA8702-25-D-B002. Any opinions, findings, conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the Combatant Commands.

© 2026 Massachusetts Institute of Technology.

The software/firmware is provided to you on an As-Is basis

Delivered to the U.S. Government with Unlimited Rights, as defined in DFARS Part 252.227-7013 or 7014 (Feb 2014). Notwithstanding any copyright notice, U.S. Government rights in this work are defined by DFARS 252.227-7013 or DFARS 252.227-7014 as detailed above. Use of this work other than as specifically authorized by the U.S. Government may violate any copyrights that exist in this work.