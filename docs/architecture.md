# Architecture

This document is the living companion to the architecture plan produced at
project inception. Update it whenever a structural decision is made.

## Runtime layers

```
Browser (migration-app/)
    │  stable /api/* and /admin/* routes
    ▼
Flask gateway (server/app.py)
    │  configurable upstream mapping, secret storage, mock mode
    ▼
Migration API (server/openapi.yaml — implemented by the backend team)
```

## Key invariants

1. **Configuration firewall.** The browser only sees stable `/api/*` routes.
   Every upstream difference — path, method, auth, field name, status word —
   is expressed through `server/config.json`, not code.

2. **Two seam files.** `migration-app/api.js` and `server/app.py` are the
   only files with seams to the outside world. Changes that touch the
   network surface belong in exactly one of them.

3. **Single-state render loop.** `migration-app/app.js` holds one `state`
   object. `render()` rewrites DOM sections from it. No framework.

4. **Dual mocks.** `migration-app/mock-api.js` (browser) and the mock
   branch in `server/app.py` let every layer be developed and tested
   without a real upstream API.

## Source tree

```
flowshift/
├── migration-app/          # Browser UI — no build step
│   ├── index.html
│   ├── app.js              # State machine + render loop
│   ├── api.js              # All fetch() calls (the only network seam)
│   ├── settings.js         # Gateway settings dialog
│   ├── mock-api.js         # In-browser stand-in for api.js
│   ├── config.js           # BASE_URL, POLL_INTERVAL_MS
│   ├── styles.css
│   └── ds/
│       └── colors_and_type.css   # Carbon v11 tokens + type scale
│
├── server/                 # Flask gateway
│   ├── app.py              # Routes, proxy, mock mode, admin
│   ├── config.default.json # Shipped defaults (committed, no secrets)
│   ├── config.json         # Runtime config  ← gitignored
│   ├── openapi.yaml        # Upstream API contract (OpenAPI 3.1)
│   └── requirements.txt
│
├── tests/
│   ├── gateway/            # pytest — config helpers + mock integration
│   │   ├── test_config.py
│   │   └── test_mock.py
│   ├── contract/           # Schemathesis — OpenAPI fuzz against mock gateway
│   │   └── test_openapi.py
│   └── ui/                 # Playwright E2E — browser tests
│       ├── upload.spec.ts
│       ├── lifecycle.spec.ts
│       ├── settings.spec.ts
│       ├── global-setup.ts
│       └── fixtures/       # Minimal valid .ktr, .kjb, .pdf
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml          # Lint + tests on every push / PR
│   │   └── release.yml     # Tag-triggered OCI image build
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.yml
│   │   ├── feature.yml
│   │   └── adapter.yml
│   └── PULL_REQUEST_TEMPLATE.md
│
├── docs/
│   ├── architecture.md     # This file
│   ├── extending.md        # How to add a new platform adapter
│   └── api-contract.md     # Backend team reference
│
├── playwright.config.ts
├── package.json
├── tsconfig.json
├── .gitignore
├── LICENSE
└── README.md
```

## Migration lifecycle

```
draft → queued → running → succeeded | failed | cancelled
```

`cancelled` returns to `draft` with files and settings intact.

## UI phase state machine

```
upload  ──[start]──►  translating  ──[complete]──►  complete
  ▲                        │
  └──[cancel / failed]─────┘        reset ──► upload (new migrationId)
```

## Adding a new endpoint

1. Add a method to `migration-app/api.js`.
2. Add the corresponding route to `server/app.py`.
3. Add a mock branch in the `mock_api()` function (`server/app.py`) and a
   matching method in `migration-app/mock-api.js`.
4. Add the endpoint to `server/config.default.json` and to the Settings
   dialog in `migration-app/settings.js` if it needs to be user-configurable.
5. Add or update tests in `tests/gateway/` and `tests/ui/`.

## Security baseline

- Gateway binds to `127.0.0.1` by default. Change `HOST` only when behind
  an authenticating proxy.
- Secrets are masked before the browser sees them. `server/config.json` is
  gitignored.
- Set `ADMIN_TOKEN` before sharing beyond localhost.
- Production: gunicorn + TLS terminator. Never the Flask dev server.
- Container base: `registry.access.redhat.com/ubi9/python-3.11-minimal`, non-root user.
