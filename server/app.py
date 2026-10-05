"""Flask gateway between the migration UI and the real backend APIs.

The browser always talks to the stable /api/... routes below. This server forwards
each call to the upstream service described in config.json, which is editable from
the UI (Settings) via /admin/config. Secrets stay on the server and are never sent
back to the browser.

Run:  pip install -r requirements.txt && python app.py   ->  http://127.0.0.1:5000
Env:  ADMIN_TOKEN  if set, /admin/* requires header  X-Admin-Token: <value>
      CONFIG_PATH  where the live config is stored (default: ./config.json)
"""
import copy
import json
import os
import threading
import time
import uuid
from pathlib import Path

import requests
from flask import Flask, Response, jsonify, request, send_from_directory

HERE = Path(__file__).parent
STATIC_DIR = (HERE.parent / "migration-app").resolve()
CONFIG_PATH = Path(os.environ.get("CONFIG_PATH", HERE / "config.json"))
DEFAULT_PATH = HERE / "config.default.json"
MASK = "••••••••"
SECRET_FIELDS = ("token", "password")
ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}

app = Flask(__name__, static_folder=None)
_lock = threading.Lock()


# ---------------------------------------------------------------- config store
def load_config():
    with _lock:
        path = CONFIG_PATH if CONFIG_PATH.exists() else DEFAULT_PATH
        return json.loads(path.read_text())


def save_config(cfg):
    with _lock:
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2))


def deep_merge(base, over):
    out = copy.deepcopy(base)
    for k, v in over.items():
        out[k] = deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def masked(cfg):
    c = copy.deepcopy(cfg)
    for f in SECRET_FIELDS:
        if c["upstream"]["auth"].get(f):
            c["upstream"]["auth"][f] = MASK
    return c


def validate(cfg):
    errs = []
    base = cfg["upstream"].get("baseUrl", "")
    if not cfg.get("mock") and not base.startswith(("http://", "https://")):
        errs.append("Base URL must start with http:// or https://")
    for name, ep in cfg["endpoints"].items():
        if ep.get("method", "").upper() not in ALLOWED_METHODS:
            errs.append(f"{name}: unsupported HTTP method")
        if not ep.get("path", "").startswith("/"):
            errs.append(f"{name}: path must start with /")
    if cfg["upstream"]["auth"]["type"] not in ("none", "bearer", "header", "basic"):
        errs.append("Unknown auth type")
    return errs


# ---------------------------------------------------------------- admin routes
def admin_guard():
    token = os.environ.get("ADMIN_TOKEN")
    if token and request.headers.get("X-Admin-Token") != token:
        return jsonify(message="Admin token required"), 401
    return None


@app.get("/admin/config")
def get_config():
    return admin_guard() or jsonify(masked(load_config()))


@app.put("/admin/config")
def put_config():
    denied = admin_guard()
    if denied:
        return denied
    incoming = request.get_json(force=True)
    current = load_config()
    # a masked secret means "unchanged"
    for f in SECRET_FIELDS:
        if incoming.get("upstream", {}).get("auth", {}).get(f) == MASK:
            incoming["upstream"]["auth"][f] = current["upstream"]["auth"].get(f, "")
    merged = deep_merge(json.loads(DEFAULT_PATH.read_text()), incoming)
    errs = validate(merged)
    if errs:
        return jsonify(message="; ".join(errs), errors=errs), 422
    save_config(merged)
    return jsonify(masked(merged))


@app.post("/admin/test")
def test_connection():
    denied = admin_guard()
    if denied:
        return denied
    cfg = load_config()
    if cfg["mock"]:
        return jsonify(ok=True, message="Mock mode is on. No upstream call was made.")
    path = cfg["upstream"].get("healthPath") or ""
    t0 = time.time()
    try:
        r = upstream("GET", path, cfg=cfg, timeout=10)
        ms = int((time.time() - t0) * 1000)
        return jsonify(ok=r.status_code < 500, status=r.status_code, message=f"HTTP {r.status_code} in {ms} ms")
    except requests.RequestException as e:
        return jsonify(ok=False, message=str(e)), 200


# ---------------------------------------------------------------- upstream helpers
def auth_headers(cfg):
    a = cfg["upstream"]["auth"]
    h = dict(cfg["upstream"].get("extraHeaders") or {})
    if a["type"] == "bearer":
        h["Authorization"] = f"Bearer {a['token']}"
    elif a["type"] == "header":
        h[a["headerName"]] = a["token"]
    return h


def upstream(method, path, cfg=None, timeout=None, **kw):
    cfg = cfg or load_config()
    u = cfg["upstream"]
    auth = (u["auth"]["username"], u["auth"]["password"]) if u["auth"]["type"] == "basic" else None
    headers = {**auth_headers(cfg), **kw.pop("headers", {})}
    return requests.request(
        method, u["baseUrl"].rstrip("/") + path, headers=headers, auth=auth,
        timeout=timeout or u["timeoutSec"], verify=u["verifyTls"], **kw)


def call(cfg, name, **params):
    ep = cfg["endpoints"][name]
    path = ep["path"].format(**params)
    return ep, path


def dig(obj, path):
    """Read a dotted path ('data.job.status', 'items.0.name') from parsed JSON."""
    if not path:
        return obj
    for part in path.split("."):
        if isinstance(obj, list):
            try:
                obj = obj[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(obj, dict):
            obj = obj.get(part)
        else:
            return None
    return obj


def fail_from(r, cfg):
    """Turn an upstream error into the {code, message} shape the UI expects."""
    rm = cfg["responseMap"]
    msg = f"Upstream returned HTTP {r.status_code}"
    try:
        body = r.json()
        msg = dig(body, rm["errorMessage"]) or dig(body, rm["error"]) or msg
    except ValueError:
        if r.text:
            msg = r.text[:300]
    return jsonify(message=str(msg), code=f"UPSTREAM_{r.status_code}"), (r.status_code if 400 <= r.status_code < 500 else 502)


def gateway_error(e):
    return jsonify(message=f"Could not reach the upstream API: {e}", code="UPSTREAM_UNREACHABLE"), 502


# ---------------------------------------------------------------- mock backend
MOCK = {}


def mock_status(m):
    if m["cancelled"]:
        return {"status": "cancelled", "step": 0}
    step = min(5, int((time.time() - m["t0"]) / 1.2)) if m["t0"] else 0
    if step < 5:
        return {"status": "running", "step": step}
    stem = lambda n: n.rsplit(".", 1)[0]
    kjb = [f for f in m["files"].values() if f["kind"] == "kjb"]
    ktr = [f for f in m["files"].values() if f["kind"] == "ktr"]
    return {
        "status": "complete", "step": 5,
        "output": {"fileName": (stem(kjb[0]["name"]) if len(kjb) == 1 else "pentaho_migration") + ".dsx",
                   "sequenceJobs": len(kjb), "parallelJobs": len(ktr)},
        "mappings": [{"source": f["name"], "pentahoType": "Job", "dsName": stem(f["name"]), "dsType": "Sequence job", "status": "Ready for review"} for f in kjb]
                  + [{"source": f["name"], "pentahoType": "Transformation", "dsName": stem(f["name"]), "dsType": "Parallel job", "status": "Ready for review"} for f in ktr],
    }


def mock_api(op, id=None, file_id=None):
    if op == "create":
        mid = "mock-" + uuid.uuid4().hex[:8]
        MOCK[mid] = {"files": {}, "t0": 0, "cancelled": False}
        return jsonify(id=mid)
    m = MOCK.get(id)
    if m is None:
        return jsonify(message="Unknown migration", code="NOT_FOUND"), 404
    if op == "upload":
        f = request.files.get("file")
        if not f or not f.read(1):
            return jsonify(message="This file has no content. Export it again from Pentaho.", code="EMPTY_FILE"), 422
        fid = "f" + uuid.uuid4().hex[:6]
        m["files"][fid] = {"kind": request.form.get("kind"), "name": f.filename}
        return jsonify(fileId=fid)
    if op == "removeFile":
        m["files"].pop(file_id, None)
        return "", 204
    if op == "start":
        m.update(t0=time.time(), cancelled=False)
        return "", 202
    if op == "cancel":
        m["cancelled"] = True
        return "", 204
    if op == "status":
        return jsonify(mock_status(m))
    if op == "download":
        return Response("// mock .dsx export\n", mimetype="application/octet-stream")


# ---------------------------------------------------------------- public API (stable contract for the UI)
@app.post("/api/migrations")
def create_migration():
    cfg = load_config()
    if cfg["mock"]:
        return mock_api("create")
    ep, path = call(cfg, "create")
    try:
        r = upstream(ep["method"], path, cfg=cfg)
    except requests.RequestException as e:
        return gateway_error(e)
    if not r.ok:
        return fail_from(r, cfg)
    mid = dig(r.json(), cfg["responseMap"]["id"])
    return jsonify(id=str(mid)) if mid is not None else (jsonify(message="Upstream response has no id at '%s'" % cfg["responseMap"]["id"]), 502)


@app.post("/api/migrations/<mid>/files")
def upload(mid):
    cfg = load_config()
    if cfg["mock"]:
        return mock_api("upload", mid)
    ep, path = call(cfg, "upload", id=mid)
    f = request.files.get("file")
    if f is None:
        return jsonify(message="No file in request", code="NO_FILE"), 400
    try:
        r = upstream(ep["method"], path, cfg=cfg,
                     files={ep.get("fileField", "file"): (f.filename, f.stream, f.mimetype)},
                     data={ep.get("kindField", "kind"): request.form.get("kind", "")} if ep.get("kindField") else {})
    except requests.RequestException as e:
        return gateway_error(e)
    if not r.ok:
        return fail_from(r, cfg)
    try:
        fid = dig(r.json(), cfg["responseMap"]["fileId"])
    except ValueError:
        fid = None
    return jsonify(fileId=str(fid if fid is not None else f.filename))


@app.delete("/api/migrations/<mid>/files/<fid>")
def remove_file(mid, fid):
    cfg = load_config()
    if cfg["mock"]:
        return mock_api("removeFile", mid, fid)
    ep, path = call(cfg, "removeFile", id=mid, fileId=fid)
    try:
        r = upstream(ep["method"], path, cfg=cfg)
    except requests.RequestException as e:
        return gateway_error(e)
    return ("", 204) if r.ok else fail_from(r, cfg)


@app.post("/api/migrations/<mid>/start")
def start(mid):
    cfg = load_config()
    if cfg["mock"]:
        return mock_api("start", mid)
    ep, path = call(cfg, "start", id=mid)
    try:
        r = upstream(ep["method"], path, cfg=cfg, json=request.get_json(silent=True) or {})
    except requests.RequestException as e:
        return gateway_error(e)
    return ("", 202) if r.ok else fail_from(r, cfg)


@app.post("/api/migrations/<mid>/cancel")
def cancel(mid):
    cfg = load_config()
    if cfg["mock"]:
        return mock_api("cancel", mid)
    ep, path = call(cfg, "cancel", id=mid)
    try:
        r = upstream(ep["method"], path, cfg=cfg)
    except requests.RequestException as e:
        return gateway_error(e)
    return ("", 204) if r.ok else fail_from(r, cfg)


@app.get("/api/migrations/<mid>")
def status(mid):
    cfg = load_config()
    if cfg["mock"]:
        return mock_api("status", mid)
    ep, path = call(cfg, "status", id=mid)
    try:
        r = upstream(ep["method"], path, cfg=cfg)
    except requests.RequestException as e:
        return gateway_error(e)
    if not r.ok:
        return fail_from(r, cfg)
    return jsonify(normalize_status(r.json(), cfg["responseMap"]))


def normalize_status(body, rm):
    """Map the upstream payload onto the MigrationStatus shape the UI reads."""
    raw = dig(body, rm["status"])
    inverse = {str(v).lower(): k for k, v in rm["statusValues"].items()}
    st = inverse.get(str(raw).lower(), "running")
    step = dig(body, rm["step"])
    try:
        step = float(step or 0)
    except (TypeError, ValueError):
        step = 0
    step = int(round(step / 100 * 5)) if rm.get("stepIsPercent") else int(step)
    out = {"status": st, "step": max(0, min(5, step))}
    if st == "failed":
        out["error"] = dig(body, rm["error"]) or "The translation failed."
    if st == "complete":
        o = rm["output"]
        src = dig(body, o["path"]) or {}
        out["output"] = {k: dig(src, o[k]) for k in ("fileName", "sequenceJobs", "parallelJobs")}
        m = rm["mappings"]
        out["mappings"] = [{k: dig(item, m[k]) for k in ("source", "pentahoType", "dsName", "dsType", "status")}
                           for item in (dig(body, m["path"]) or [])]
    return out


@app.get("/api/migrations/<mid>/download")
def download(mid):
    cfg = load_config()
    if cfg["mock"]:
        return mock_api("download", mid)
    ep, path = call(cfg, "download", id=mid)
    try:
        r = upstream(ep["method"], path, cfg=cfg, stream=True)
    except requests.RequestException as e:
        return gateway_error(e)
    if not r.ok:
        return fail_from(r, cfg)
    return Response(r.iter_content(65536), mimetype=r.headers.get("Content-Type", "application/octet-stream"))


# ---------------------------------------------------------------- static UI
@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/<path:p>")
def static_files(p):
    return send_from_directory(STATIC_DIR, p)


if __name__ == "__main__":
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", 5000)), debug=False)
