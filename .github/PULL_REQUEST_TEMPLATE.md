## What does this PR do?

<!-- One-sentence summary. Reference the issue it closes. -->

Closes #

---

## How to test locally

```bash
# 1. Start the gateway
cd server && python app.py

# 2. Open http://127.0.0.1:5000 and verify the change manually
#    (describe the specific steps for this PR)

# 3. Run the automated tests
pytest tests/gateway/ -v
npx playwright test
```

---

## Checklist

- [ ] The change is minimal — no unrelated refactoring included
- [ ] Tests added or updated to cover the change
- [ ] `config.default.json` updated if new config keys were added
- [ ] `server/openapi.yaml` updated if gateway routes changed
- [ ] `mock_api()` (gateway) and `mock-api.js` (browser) updated if a new endpoint was added
- [ ] `docs/` updated if the architecture or extension guide changed

## Config changes

<!-- List any new or changed keys in config.default.json, or write "none". -->

none

## OpenAPI changes

<!-- Does this PR change server/openapi.yaml? yes / no
     If yes, tag @<backend-team-handle> for review. -->

no
