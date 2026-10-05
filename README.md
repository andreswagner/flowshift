# Pentaho to DataStage migration workspace

A web UI for migrating Pentaho flows to IBM DataStage. A user uploads Pentaho transformations (`.ktr`), jobs (`.kjb`) and a functional document. The backend translates them into a single DataStage `.dsx` export, and the user downloads it.

The browser never talks to the backend directly. It talks to a small **Flask gateway**, which forwards calls to your migration API. The upstream URL, authentication, endpoint paths and response field names are all configurable from the UI, with no code changes.

```
Browser (migration-app/)  ──►  Flask gateway (server/app.py)  ──►  Migration API (server/openapi.yaml)
   stable /api/... routes        holds secrets, maps requests          implemented by the backend team
                                 and responses using config.json
```

## Quick start

Requires Python 3.9 or later.

```bash
cd server
pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000>. The gateway starts in **mock mode**, which simulates the backend, so the whole flow works before any real API exists.

## Connect to the real API

1. Open **Gateway settings** (gear icon in the header).
2. Turn off **Mock mode**.
3. Set the **Base URL** and **Authentication** (none, bearer token, API key header or basic).
4. Check the **Endpoints** and **Response mapping** sections. The defaults already match [`server/openapi.yaml`](server/openapi.yaml), so a backend that implements that contract needs no changes.
5. Choose **Save and test connection**.

Settings are saved to `server/config.json`. Defaults live in `server/config.default.json`. Tokens and passwords stay on the server and are never sent back to the browser.

### Matching an existing API

If your API already exists and differs from the contract, adjust it in the dialog:

- **Paths and methods:** use `{id}` for the migration id and `{fileId}` for a file id.
- **Response fields:** use dotted paths into the JSON, for example `data.job.status` or `items.0.name`.
- **Status words:** map your API's values to the UI's five states: queued, running, complete, failed, cancelled.
- **Progress:** if your API returns a percentage rather than a step count, tick the percentage option.

## Project layout

| Path | Purpose |
|---|---|
| `migration-app/` | The UI: plain JavaScript modules and CSS, no build step. Styled with IBM Carbon. |
| `migration-app/api.js` | The only file in the UI that calls the backend (via the gateway). |
| `migration-app/settings.js` | The Gateway settings dialog. |
| `migration-app/config.js` | Gateway URL and polling interval for the UI. |
| `server/app.py` | The Flask gateway: public `/api/...` routes, `/admin/...` settings routes, mock mode. |
| `server/openapi.yaml` | The upstream API contract (OpenAPI 3.1) for the backend team. |
| `server/config.default.json` | Default gateway settings. |
| `canvas/` | The original design mockup, kept for reference. |

## How a migration runs

1. The user adds files. Each is uploaded straight away and validated (extension, not empty), so errors show per file.
2. **Start translation** is enabled once all three inputs are valid.
3. The UI starts the migration and polls its status. Progress and steps update as the backend works.
4. When the status is `succeeded`, the UI shows the results table and a **Download .dsx** button.
5. **Cancel** stops the work and returns the migration to `draft`, so the user can start it again.

Lifecycle: `draft` → `queued` → `running` → `succeeded` | `failed` | `cancelled`.

## Gateway routes

The UI calls these. They are stable even when the upstream API changes.

| Route | Purpose |
|---|---|
| `POST /api/migrations` | Create a migration |
| `POST /api/migrations/{id}/files` | Upload one file (`kind` = `ktr`, `kjb` or `doc`) |
| `DELETE /api/migrations/{id}/files/{fileId}` | Remove a file |
| `POST /api/migrations/{id}/start` | Start, with the settings in the body |
| `POST /api/migrations/{id}/cancel` | Cancel |
| `GET /api/migrations/{id}` | Status, shaped as `{status, step, error?, output?, mappings?}` |
| `GET /api/migrations/{id}/download` | Stream the `.dsx` file |
| `GET`/`PUT /admin/config`, `POST /admin/test` | Read, save and test the gateway settings |

## Configuration

Environment variables for `server/app.py`:

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` | Interface to bind. Keep the default unless the server is behind authentication. |
| `PORT` | `5000` | Port. |
| `CONFIG_PATH` | `server/config.json` | Where settings are stored. |
| `ADMIN_TOKEN` | unset | If set, `/admin/*` requires the header `X-Admin-Token`. The UI asks for it when needed. |

## Security notes

- `/admin/*` can change which server the gateway calls and which credentials it sends. Do not expose it to untrusted users. Set `ADMIN_TOKEN` and put the app behind your normal login before sharing it beyond your machine.
- `server/config.json` contains secrets in plain text. Keep it out of version control and restrict file permissions.
- The Flask built-in server is for development. For production, run behind a WSGI server such as gunicorn and terminate TLS in front of it.

## For the backend team

Implement [`server/openapi.yaml`](server/openapi.yaml). You can render it with any OpenAPI 3.1 viewer, such as Swagger UI or Redoc. Points that matter most:

- Errors use `application/problem+json`. The `detail` text is shown to users as written.
- Files can be added, removed or re-configured only in `draft`.
- `GET /migrations/{id}` returns `result` only when `status` is `succeeded`, and `error` only when it is `failed`.
- Support `Idempotency-Key` on create and start, and `ETag` or `Retry-After` on status.

## Status

Tested: the gateway in mock mode, config saving and validation, and the response mapping against the contract. Not yet tested: the UI in a browser, and the gateway against a real upstream API.
