# Adding a new platform adapter

This guide explains how to extend FlowShift to support a new source or
target data integration platform — for example, Informatica PowerCenter →
IBM DataStage, or Pentaho → Apache Spark.

Open an [adapter request issue](.github/ISSUE_TEMPLATE/adapter.yml) first so
the work can be tracked and sample files can be shared before coding starts.

---

## 1. Define the new file kinds

In `migration-app/app.js`, extend the `KINDS` map with the new file
extension(s):

```js
// Example: adding Informatica PowerCenter workflow files
informatica_wf: {
  title: 'Workflows',
  ext: ['.xml'],
  multi: true,
  tag: '.xml · Required',
  accept: '.xml',
  desc: 'Upload every PowerCenter workflow XML file.',
  dz: 'Drag and drop .xml workflow files here',
  err: 'Upload a PowerCenter workflow file with the .xml extension.',
  summary: 'Workflows (.xml)',
},
```

If the new kind replaces an existing one rather than adding alongside it,
update the `KINDS` object accordingly.

---

## 2. Update the OpenAPI contract

Add or extend schemas in `server/openapi.yaml`:

- New `FileKind` enum values.
- New fields in `Settings` if the target platform needs them.
- New `ResultItem` target types if the output differs.

Label the PR **breaking-change** if existing fields change.

---

## 3. Update the gateway

In `server/app.py`:

- Add a new endpoint route if the upstream API has a different shape for
  the new platform.
- Extend `normalize_status()` if the new platform returns a different
  result structure.
- Add a mock branch in `mock_api()` that returns plausible fake data for
  the new file kinds.

---

## 4. Update `config.default.json` and the Settings dialog

If the upstream API for the new platform uses different paths or field
names, add them to `server/config.default.json` and expose them in the
Settings dialog (`migration-app/settings.js`).

---

## 5. Update `mock-api.js`

Mirror every new behaviour in `migration-app/mock-api.js` so that
offline development and browser-level testing still works without a real
backend.

---

## 6. Add tests

| Layer | What to add |
|---|---|
| `tests/gateway/test_config.py` | Cases for any new `normalize_status` branches |
| `tests/gateway/test_mock.py` | Happy path through the new mock |
| `tests/ui/fixtures/` | Minimal valid files for the new extensions |
| `tests/ui/upload.spec.ts` | File-type acceptance / rejection for the new kinds |
| `tests/ui/lifecycle.spec.ts` | Full upload → start → complete flow for the new platform |

---

## 7. Update documentation

- Update `docs/architecture.md` if the source tree changes.
- Update `docs/api-contract.md` if the OpenAPI contract changes.
- Update `README.md` if the quick-start or usage instructions change.
