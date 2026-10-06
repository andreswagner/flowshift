"""Unit tests for config helpers in server/app.py.

Run:  pytest tests/gateway/ -v
Requires:  pip install pytest
"""
import json
import sys
from pathlib import Path

# Allow importing server/app without Flask being installed in the test env.
import importlib
import types

# ---------------------------------------------------------------------------
# Bootstrap: make `server.app` importable with a minimal Flask stub so these
# tests can run with just `pytest` and no extra packages beyond the project's
# requirements.txt.
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).parents[2]))

import pytest

# We only need the pure-Python helpers, not the Flask routing layer.
# Import them directly to avoid triggering Flask's app-factory side effects.
from server.app import deep_merge, validate, masked, dig, normalize_status

DEFAULT_PATH = Path(__file__).parents[2] / "server" / "config.default.json"


@pytest.fixture()
def defaults():
    return json.loads(DEFAULT_PATH.read_text())


# ---------------------------------------------------------------------------
# deep_merge
# ---------------------------------------------------------------------------

class TestDeepMerge:
    def test_scalar_override(self):
        result = deep_merge({"a": 1, "b": 2}, {"b": 99})
        assert result == {"a": 1, "b": 99}

    def test_nested_merge(self):
        base = {"upstream": {"auth": {"type": "none", "token": "old"}}}
        over = {"upstream": {"auth": {"type": "bearer"}}}
        result = deep_merge(base, over)
        assert result["upstream"]["auth"]["type"] == "bearer"
        assert result["upstream"]["auth"]["token"] == "old"  # preserved

    def test_does_not_mutate_base(self):
        base = {"x": {"y": 1}}
        deep_merge(base, {"x": {"y": 2}})
        assert base["x"]["y"] == 1


# ---------------------------------------------------------------------------
# validate
# ---------------------------------------------------------------------------

class TestValidate:
    def test_valid_defaults_in_mock_mode(self, defaults):
        """Default config with mock=True must have no validation errors."""
        assert validate(defaults) == []

    def test_missing_base_url_outside_mock(self, defaults):
        defaults["mock"] = False
        defaults["upstream"]["baseUrl"] = ""
        errs = validate(defaults)
        assert any("Base URL" in e for e in errs)

    def test_invalid_auth_type(self, defaults):
        defaults["upstream"]["auth"]["type"] = "oauth2"
        errs = validate(defaults)
        assert any("auth" in e.lower() for e in errs)

    def test_bad_endpoint_method(self, defaults):
        defaults["endpoints"]["create"]["method"] = "CONNECT"
        errs = validate(defaults)
        assert any("create" in e for e in errs)

    def test_path_must_start_with_slash(self, defaults):
        defaults["endpoints"]["status"]["path"] = "migrations/{id}"
        errs = validate(defaults)
        assert any("status" in e for e in errs)


# ---------------------------------------------------------------------------
# masked
# ---------------------------------------------------------------------------

class TestMasked:
    def test_token_is_masked(self, defaults):
        defaults["upstream"]["auth"]["token"] = "super-secret"
        result = masked(defaults)
        assert result["upstream"]["auth"]["token"] == "••••••••"

    def test_password_is_masked(self, defaults):
        defaults["upstream"]["auth"]["password"] = "hunter2"
        result = masked(defaults)
        assert result["upstream"]["auth"]["password"] == "••••••••"

    def test_empty_secret_not_masked(self, defaults):
        defaults["upstream"]["auth"]["token"] = ""
        result = masked(defaults)
        assert result["upstream"]["auth"]["token"] == ""

    def test_original_not_mutated(self, defaults):
        defaults["upstream"]["auth"]["token"] = "real"
        masked(defaults)
        assert defaults["upstream"]["auth"]["token"] == "real"


# ---------------------------------------------------------------------------
# dig
# ---------------------------------------------------------------------------

class TestDig:
    def test_simple_key(self):
        assert dig({"status": "running"}, "status") == "running"

    def test_dotted_path(self):
        assert dig({"a": {"b": {"c": 42}}}, "a.b.c") == 42

    def test_list_index(self):
        assert dig({"items": ["x", "y"]}, "items.1") == "y"

    def test_missing_key_returns_none(self):
        assert dig({"a": 1}, "b.c") is None

    def test_empty_path_returns_object(self):
        obj = {"x": 1}
        assert dig(obj, "") is obj


# ---------------------------------------------------------------------------
# normalize_status
# ---------------------------------------------------------------------------

class TestNormalizeStatus:
    def _rm(self, defaults):
        return defaults["responseMap"]

    def test_running(self, defaults):
        body = {"status": "running", "progress": {"percent": 40}}
        out = normalize_status(body, self._rm(defaults))
        assert out["status"] == "running"
        assert out["step"] == 2  # 40% of 5 steps = 2

    def test_succeeded_maps_complete(self, defaults):
        body = {
            "status": "succeeded",
            "progress": {"percent": 100},
            "result": {
                "artifact": {"fileName": "out.dsx", "sizeBytes": 1000, "downloadUrl": "/dl"},
                "summary": {"sequenceJobs": 2, "parallelJobs": 3},
                "items": [
                    {"source": {"name": "job.kjb", "type": "Job"},
                     "target": {"name": "job", "type": "Sequence job"},
                     "status": "ready_for_review"},
                ],
            },
        }
        out = normalize_status(body, self._rm(defaults))
        assert out["status"] == "complete"
        assert out["output"]["fileName"] == "out.dsx"
        assert out["output"]["sequenceJobs"] == 2
        assert len(out["mappings"]) == 1

    def test_failed_includes_error(self, defaults):
        body = {
            "status": "failed",
            "progress": {"percent": 20},
            "error": {"type": "...", "title": "Translation failed",
                      "detail": "Step 'Table input' references unknown connection."},
        }
        out = normalize_status(body, self._rm(defaults))
        assert out["status"] == "failed"
        assert "Table input" in out["error"]

    def test_unknown_status_defaults_to_running(self, defaults):
        body = {"status": "initialising", "progress": {"percent": 0}}
        out = normalize_status(body, self._rm(defaults))
        assert out["status"] == "running"

    def test_step_clamped_to_0_5(self, defaults):
        body = {"status": "running", "progress": {"percent": 110}}
        out = normalize_status(body, self._rm(defaults))
        assert out["step"] == 5
