# tests/contract/

Contract tests use [Schemathesis](https://schemathesis.readthedocs.io/) to
generate and run hundreds of test cases from `server/openapi.yaml` against
the live gateway.

## What is tested

Every endpoint, HTTP method and response status code defined in
`openapi.yaml` is exercised.  The test fails if:

- the gateway returns an undocumented status code, or
- a response body does not match its declared JSON schema.

This automatically catches drift between the OpenAPI contract and the
`normalize_status()` response-shaping logic in `server/app.py`.

## Running

Start the gateway first (mock mode is the default):

```bash
python server/app.py
```

Then in a separate terminal:

```bash
pip install schemathesis pytest
pytest tests/contract/ -v
```

The `base_url` in `test_openapi.py` points to `http://127.0.0.1:5000/api`.
Change it if you run the gateway on a different port.
