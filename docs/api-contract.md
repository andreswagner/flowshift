# API contract guide (for the backend team)

The upstream migration API is defined in [`server/openapi.yaml`](../server/openapi.yaml).
Render it with any OpenAPI 3.1 viewer (Swagger UI, Redoc, or
`npx @redocly/cli preview-docs server/openapi.yaml`).

---

## What the gateway expects

The Flask gateway (`server/app.py`) calls your API and maps its responses
to the shape the browser UI reads.  The mapping is configurable from the
Settings dialog, so you do not have to match the contract exactly — but the
closer you are, the less configuration is needed.

### Default field mappings

| Gateway field | Default dotted path in your response |
|---|---|
| migration id | `id` |
| file id | `id` |
| status | `status` |
| progress | `progress.percent` (treated as 0–100%) |
| error text | `error.detail` |
| output object | `result` |
| output file name | `result.artifact.fileName` |
| sequence job count | `result.summary.sequenceJobs` |
| parallel job count | `result.summary.parallelJobs` |
| mappings list | `result.items` |
| mapping source name | `source.name` |
| mapping source type | `source.type` |
| mapping target name | `target.name` |
| mapping target type | `target.type` |
| mapping status | `status` |

### Default status-word mapping

| UI state | Your API value |
|---|---|
| queued | `queued` |
| running | `running` |
| complete | `succeeded` |
| failed | `failed` |
| cancelled | `cancelled` |

---

## Points that matter most

- **Errors** use `application/problem+json` (RFC 9457). The `detail` field
  is shown verbatim to users — keep it safe and human-readable.
- **Files** can be added, removed or reconfigured only while the migration
  is in `draft`. Reject attempts in other states with `409`.
- **`GET /migrations/{id}`** returns `result` only when `status` is
  `succeeded`, and `error` only when it is `failed`. Omit both otherwise.
- **Idempotency-Key** is supported on `POST /migrations` and
  `POST /migrations/{id}/start`. Repeat the same key within 24 hours to
  get the original response back.
- **`Retry-After`** (seconds) should be present in the response header
  while the migration is active. The gateway respects it for polling.
- **`ETag`** on `GET /migrations/{id}` lets the gateway send
  `If-None-Match` to receive `304 Not Modified` and skip unnecessary
  response parsing.

---

## Running the mock gateway to verify your implementation

```bash
cd server
pip install -r requirements.txt
python app.py          # starts on http://127.0.0.1:5000 in mock mode
```

Open the Settings dialog (gear icon in the header), disable **Mock mode**,
enter your base URL and auth, and hit **Save and test connection**.

If you have `httpx` or `curl` available, you can also hit the gateway's
stable routes directly and inspect what it sends upstream by enabling
`app.config["DEBUG"] = True` temporarily.

---

## Running the contract tests against your API

With your API running:

```bash
pip install schemathesis
# Edit base_url in tests/contract/test_openapi.py to point at your API
pytest tests/contract/ -v
```

Schemathesis generates ~200 test cases from `openapi.yaml` covering every
endpoint, method and documented status code.
