# tests/gateway/

Gateway-layer tests run with `pytest` against the Flask test client.
No real network or upstream API required — the gateway's built-in mock mode
is used throughout.

## What is tested

| File | Coverage |
|---|---|
| `test_config.py` | `deep_merge`, `validate`, `masked`, `dig`, `normalize_status` |
| `test_mock.py` | Full request/response cycle in mock mode via the test client |

## Running

```bash
# From the repo root
pip install pytest flask requests
pytest tests/gateway/ -v
```
