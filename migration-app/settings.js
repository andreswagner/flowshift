// Settings dialog: edits the Flask gateway's config via /admin/config.
// Secrets are masked by the server; leaving a masked value untouched keeps the stored one.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, p, v) => { const ks = p.split('.'); ks.slice(0, -1).reduce((a, k) => (a[k] ??= {}), o)[ks.at(-1)] = v; };

const OPS = [
  ['create', 'Create migration'], ['upload', 'Upload file'], ['removeFile', 'Remove file'],
  ['start', 'Start translation'], ['cancel', 'Cancel translation'], ['status', 'Get status'], ['download', 'Download .dsx'],
];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const text = (path, label, extra = {}) => ({ path, label, type: 'text', ...extra });
const MAP_FIELDS = [
  text('responseMap.id', 'Migration id', { hint: 'in the create response' }),
  text('responseMap.fileId', 'File id', { hint: 'in the upload response' }),
  text('responseMap.status', 'Status'), text('responseMap.step', 'Step / progress'),
  text('responseMap.error', 'Error text'), text('responseMap.errorMessage', 'Error message (4xx/5xx bodies)'),
  text('responseMap.output.path', 'Output object'), text('responseMap.output.fileName', '… file name'),
  text('responseMap.output.sequenceJobs', '… sequence jobs'), text('responseMap.output.parallelJobs', '… parallel jobs'),
  text('responseMap.mappings.path', 'Mappings list'), text('responseMap.mappings.source', '… source'),
  text('responseMap.mappings.pentahoType', '… Pentaho type'), text('responseMap.mappings.dsName', '… DataStage name'),
  text('responseMap.mappings.dsType', '… DataStage type'), text('responseMap.mappings.status', '… status'),
];
const STATUS_FIELDS = ['queued', 'running', 'complete', 'failed', 'cancelled'].map((k) => text(`responseMap.statusValues.${k}`, `Upstream value for “${k}”`));

const field = (f, cfg) => `<div class="field"><label for="cfg-${f.path}">${f.label}</label>
  <input class="fld" id="cfg-${f.path}" data-path="${f.path}" type="${f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'}" value="${esc(get(cfg, f.path))}" ${f.hint ? `placeholder="${esc(f.hint)}"` : ''} autocomplete="off"></div>`;
const check = (path, label, cfg) => `<label class="cbx"><input type="checkbox" data-path="${path}" ${get(cfg, path) ? 'checked' : ''}><span>${label}</span></label>`;

function form(cfg) {
  const a = cfg.upstream.auth;
  return `
  <fieldset class="grp"><legend>Mode</legend>
    ${check('mock', 'Mock mode: the gateway simulates the backend and makes no upstream calls', cfg)}
  </fieldset>
  <fieldset class="grp"><legend>Upstream API</legend>
    ${field(text('upstream.baseUrl', 'Base URL', { hint: 'https://host/api' }), cfg)}
    <div class="two">${field(text('upstream.timeoutSec', 'Timeout (seconds)', { type: 'number' }), cfg)}${field(text('upstream.healthPath', 'Health check path', { hint: '/health (optional)' }), cfg)}</div>
    ${check('upstream.verifyTls', 'Verify TLS certificates', cfg)}
  </fieldset>
  <fieldset class="grp"><legend>Authentication</legend>
    <div class="field"><label for="cfg-auth">Type</label>
      <select class="fld" id="cfg-auth" data-path="upstream.auth.type">${['none', 'bearer', 'header', 'basic'].map((t) => `<option value="${t}" ${a.type === t ? 'selected' : ''}>${{ none: 'None', bearer: 'Bearer token', header: 'API key header', basic: 'Basic (username and password)' }[t]}</option>`).join('')}</select></div>
    <div data-auth="header">${field(text('upstream.auth.headerName', 'Header name'), cfg)}</div>
    <div data-auth="bearer header">${field({ path: 'upstream.auth.token', label: 'Token / key', type: 'password' }, cfg)}</div>
    <div data-auth="basic" class="two">${field(text('upstream.auth.username', 'Username'), cfg)}${field({ path: 'upstream.auth.password', label: 'Password', type: 'password' }, cfg)}</div>
    <div class="field"><label for="cfg-hdrs">Extra headers (JSON)</label>
      <textarea class="fld area" id="cfg-hdrs" data-json="upstream.extraHeaders" rows="3" spellcheck="false">${esc(JSON.stringify(cfg.upstream.extraHeaders || {}, null, 2))}</textarea></div>
  </fieldset>
  <fieldset class="grp"><legend>Endpoints</legend>
    <p class="sub">Use <code>{id}</code> for the migration id and <code>{fileId}</code> for a file id.</p>
    ${OPS.map(([k, label]) => `<div class="ep"><span class="ep-l">${label}</span>
      <select class="fld ep-m" aria-label="${label} method" data-path="endpoints.${k}.method">${METHODS.map((m) => `<option ${cfg.endpoints[k].method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <input class="fld ep-p" aria-label="${label} path" data-path="endpoints.${k}.path" value="${esc(cfg.endpoints[k].path)}" spellcheck="false"></div>`).join('')}
    <div class="two">${field(text('endpoints.upload.fileField', 'Upload: file field name'), cfg)}${field(text('endpoints.upload.kindField', 'Upload: file kind field name', { hint: 'blank to omit' }), cfg)}</div>
  </fieldset>
  <fieldset class="grp"><legend>Response mapping</legend>
    <p class="sub">Dotted paths into the upstream JSON, for example <code>data.job.status</code> or <code>items.0.name</code>.</p>
    <div class="two">${MAP_FIELDS.map((f) => field(f, cfg)).join('')}</div>
    ${check('responseMap.stepIsPercent', 'Step / progress is a percentage (0–100)', cfg)}
    <div class="two">${STATUS_FIELDS.map((f) => field(f, cfg)).join('')}</div>
  </fieldset>`;
}

function collect(root, base) {
  const cfg = structuredClone(base);
  root.querySelectorAll('[data-path]').forEach((el) => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') v = Number(v) || 0;
    set(cfg, el.dataset.path, v);
  });
  root.querySelectorAll('[data-json]').forEach((el) => {
    try { set(cfg, el.dataset.json, JSON.parse(el.value || '{}')); }
    catch { throw new Error('Extra headers must be valid JSON.'); }
  });
  return cfg;
}

export function initSettings({ toast }) {
  const dlg = $('#settings'); let current = null;
  const hdr = () => {
    const t = sessionStorage.getItem('adminToken');
    return t ? { 'X-Admin-Token': t } : {};
  };
  async function admin(path, opts = {}) {
    let res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...hdr(), ...(opts.headers || {}) } });
    if (res.status === 401) {
      const t = prompt('Admin token');
      if (!t) throw new Error('Admin token required.');
      sessionStorage.setItem('adminToken', t);
      res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...hdr() } });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
    return body;
  }
  const showAuth = () => {
    const t = $('[data-path="upstream.auth.type"]', dlg).value;
    dlg.querySelectorAll('[data-auth]').forEach((d) => (d.hidden = !d.dataset.auth.split(' ').includes(t)));
  };
  const msg = (t, ok) => { const m = $('#cfg-msg'); m.textContent = t; m.className = 'gate ' + (ok ? 'good' : 'bad'); };

  async function open() {
    try { current = await admin('/admin/config'); } catch (e) { toast(e.message); return; }
    $('#cfg-body').innerHTML = form(current);
    $('[data-path="upstream.auth.type"]', dlg).onchange = showAuth;
    showAuth(); msg('', true);
    dlg.showModal();
  }
  async function save() {
    try {
      current = await admin('/admin/config', { method: 'PUT', body: JSON.stringify(collect(dlg, current)) });
      msg('Saved. New requests use these settings.', true);
      $('#cfg-body').innerHTML = form(current); $('[data-path="upstream.auth.type"]', dlg).onchange = showAuth; showAuth();
    } catch (e) { msg(e.message, false); }
  }
  async function test() {
    try {
      await save();
      const r = await admin('/admin/test', { method: 'POST' });
      msg((r.ok ? 'Connection OK: ' : 'Connection failed: ') + r.message, r.ok);
    } catch (e) { msg(e.message, false); }
  }

  $('#open-settings').addEventListener('click', open);
  $('#cfg-save').addEventListener('click', save);
  $('#cfg-test').addEventListener('click', test);
  $('#cfg-close').addEventListener('click', () => dlg.close());
}
