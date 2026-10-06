"""OpenAPI contract test using Schemathesis.

Generates and executes test cases from server/openapi.yaml against the
gateway running in mock mode.  Catches shape regressions between the
OpenAPI contract and normalize_status() automatically.

Prerequisites
-------------
    pip install schemathesis pytest
    # In a separate terminal:
    python server/app.py        # starts on http://127.0.0.1:5000

Run
---
    pytest tests/contract/ -v
"""
import schemathesis
from pathlib import Path

SCHEMA_PATH = Path(__file__).parents[2] / "server" / "openapi.yaml"

# Point Schemathesis at the local file; override the servers[0].url so all
# generated requests hit the running gateway instead of migrations.example.com.
schema = schemathesis.from_path(
    str(SCHEMA_PATH),
    base_url="http://127.0.0.1:5000/api",
)


@schema.parametrize()
def test_api_contract(case):
    """Every endpoint + status-code combination defined in openapi.yaml must
    either succeed or return a documented error shape — never a 500."""
    response = case.call()
    case.validate_response(response)
