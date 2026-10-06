"""Integration tests for the Flask gateway running in mock mode.

Uses Flask's built-in test client — no real network, no upstream API needed.

Run:  pytest tests/gateway/ -v
"""
import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[2]))

# Import the Flask app object.  server/app.py creates it at module level.
from server.app import app as flask_app


@pytest.fixture()
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c


def _json(response):
    return json.loads(response.data)


# ---------------------------------------------------------------------------
# Mock mode must be on before every test (the default config ships with mock=True).
# If a previous test saved a real config.json, force mock=True here.
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def force_mock(client):
    """Ensure gateway is in mock mode regardless of any saved config.json."""
    from server.app import load_config, save_config
    cfg = load_config()
    cfg["mock"] = True
    save_config(cfg)
    yield
    # Restore to mock after the test as well.
    cfg = load_config()
    cfg["mock"] = True
    save_config(cfg)


# ---------------------------------------------------------------------------
# Create migration
# ---------------------------------------------------------------------------

class TestCreateMigration:
    def test_returns_id(self, client):
        r = client.post("/api/migrations")
        assert r.status_code == 200
        body = _json(r)
        assert "id" in body
        assert body["id"].startswith("mock-")


# ---------------------------------------------------------------------------
# Upload file
# ---------------------------------------------------------------------------

class TestUploadFile:
    def _mid(self, client):
        return _json(client.post("/api/migrations"))["id"]

    def test_valid_ktr_accepted(self, client):
        mid = self._mid(client)
        data = {"kind": "ktr", "file": (io.BytesIO(b"<transformation/>"), "flow.ktr")}
        r = client.post(f"/api/migrations/{mid}/files", data=data,
                        content_type="multipart/form-data")
        assert r.status_code == 200
        assert "fileId" in _json(r)

    def test_empty_file_rejected(self, client):
        mid = self._mid(client)
        data = {"kind": "ktr", "file": (io.BytesIO(b""), "empty.ktr")}
        r = client.post(f"/api/migrations/{mid}/files", data=data,
                        content_type="multipart/form-data")
        assert r.status_code == 422

    def test_unknown_migration_returns_404(self, client):
        data = {"kind": "ktr", "file": (io.BytesIO(b"<x/>"), "f.ktr")}
        r = client.post("/api/migrations/nonexistent/files", data=data,
                        content_type="multipart/form-data")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Happy path: create → upload × 3 → start → status → download
# ---------------------------------------------------------------------------

class TestHappyPath:
    def _setup(self, client):
        mid = _json(client.post("/api/migrations"))["id"]
        for kind, name, content in [
            ("ktr", "load.ktr", b"<transformation/>"),
            ("kjb", "run.kjb", b"<job/>"),
            ("doc", "spec.pdf", b"%PDF-1.4"),
        ]:
            r = client.post(f"/api/migrations/{mid}/files",
                            data={"kind": kind, "file": (io.BytesIO(content), name)},
                            content_type="multipart/form-data")
            assert r.status_code == 200
        return mid

    def test_start_returns_202(self, client):
        mid = self._setup(client)
        r = client.post(f"/api/migrations/{mid}/start")
        assert r.status_code == 202

    def test_status_returns_json(self, client):
        mid = self._setup(client)
        client.post(f"/api/migrations/{mid}/start")
        r = client.get(f"/api/migrations/{mid}")
        assert r.status_code == 200
        body = _json(r)
        assert body["status"] in ("running", "complete", "queued")

    def test_download_returns_bytes(self, client):
        mid = self._setup(client)
        client.post(f"/api/migrations/{mid}/start")
        r = client.get(f"/api/migrations/{mid}/download")
        assert r.status_code == 200

    def test_cancel_returns_204(self, client):
        mid = self._setup(client)
        client.post(f"/api/migrations/{mid}/start")
        r = client.post(f"/api/migrations/{mid}/cancel")
        assert r.status_code == 204
