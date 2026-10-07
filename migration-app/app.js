import { api } from './api.js';
import { config } from './config.js';
import { initSettings } from './settings.js';

// ---------- constants ----------
const KINDS = {
  ktr: { title: 'Transformations', ext: ['.ktr'], multi: true, tag: '.ktr · Required', accept: '.ktr',
    desc: 'Upload every .ktr file the job calls. You can add several at once.',
    dz: 'Drag and drop .ktr files here', err: 'Upload a Pentaho transformation file with the .ktr extension.', summary: 'Transformations (.ktr)' },
  kjb: { title: 'Jobs', ext: ['.kjb'], multi: true, tag: '.kjb · Required', accept: '.kjb',
    desc: 'Upload every .kjb file that orchestrates the transformations. You can add several at once. Each job becomes a DataStage sequence job.',
    dz: 'Drag and drop .kjb files here', err: 'Upload a Pentaho job file with the .kjb extension.', summary: 'Jobs (.kjb)' },
  doc: { title: 'Functional document', ext: ['.pdf', '.docx', '.doc', '.md', '.txt'], multi: false, tag: '.pdf, .docx, .md · Required', accept: '.pdf,.docx,.doc,.md,.txt',
    desc: 'Upload the document that describes the flows and the job. We use it to name stages, add annotations and resolve business rules.',
    dz: 'Drag and drop a document here', err: 'Upload a .pdf, .docx, .doc, .md or .txt document.', summary: 'Functional document' },
};
const STEPS = ['Read the job definitions', 'Parse transformations', 'Analyze the functional document', 'Map Pentaho steps to DataStage stages', 'Generate the .dsx export'];

// ---------- state ----------
const state = {
  migrationId: null,
  phase: 'upload', // upload | translating | complete
  files: { ktr: [], kjb: [], doc: [] },
  step: 0,
  result: null, // { output, mappings }
  settings: { targetVersion: 'IBM DataStage 11.7', projectName: '', useFunctionalDoc: true },
  downloading: false,
  starting: false,
};
let nid = 0, pollTimer = null;

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmt = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const extOf = (n) => { const i = n.lastIndexOf('.'); return i >= 0 ? n.slice(i).toLowerCase() : ''; };
const bad = (k) => state.files[k].some((f) => f.state === 'bad');
const pending = () => Object.values(state.files).some((l) => l.some((f) => f.state === 'uploading'));
const good = (k) => state.files[k].length > 0 && state.files[k].every((f) => f.state === 'ok');
const isReady = () => Object.keys(KINDS).every(good) && !pending();

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 6000);
}

const I = {
  check: '<path d="M16,2A14,14,0,1,0,30,16,14,14,0,0,0,16,2ZM14,21.5908l-5-5L10.5906,15,14,18.4092,21.41,11l1.5957,1.5859Z"/>',
  checkOut: '<path d="M14 21.414L9 16.413 10.413 15 14 18.586 21.585 11 23 12.415 14 21.414z"/><path d="M16,2A14,14,0,1,0,30,16,14,14,0,0,0,16,2Zm0,26A12,12,0,1,1,28,16,12,12,0,0,1,16,28Z"/>',
  dot: '<path d="M16,2A14,14,0,1,0,30,16,14,14,0,0,0,16,2Zm0,26A12,12,0,1,1,28,16,12,12,0,0,1,16,28Z"/><circle cx="16" cy="16" r="7"/>',
  ring: '<path d="M16,2A14,14,0,1,0,30,16,14,14,0,0,0,16,2Zm0,26A12,12,0,1,1,28,16,12,12,0,0,1,16,28Z"/>',
  err: '<path d="M16,2C8.3,2,2,8.3,2,16s6.3,14,14,14s14-6.3,14-14S23.7,2,16,2z M21.4,23L16,17.6L10.6,23L9,21.4l5.4-5.4L9,10.6L10.6,9l5.4,5.4L21.4,9l1.6,1.6L17.6,16l5.4,5.4L21.4,23z"/>',
  close: '<path d="M17.4141 16L24 9.4141 22.5859 8 16 14.5859 9.4143 8 8 9.4141 14.5859 16 8 22.5859 9.4143 24 16 17.4141 22.5859 24 24 22.5859 17.4141 16z"/>',
  file: '<path d="M25.7,9.3l-7-7A.9087.9087,0,0,0,18,2H8A2.0058,2.0058,0,0,0,6,4V28a2.0058,2.0058,0,0,0,2,2H24a2.0058,2.0058,0,0,0,2-2V10A.9092.9092,0,0,0,25.7,9.3ZM18,4.4,23.6,10H18ZM24,28H8V4h8v6a2.0058,2.0058,0,0,0,2,2h6Z"/>',
  upload: '<path d="M6 18L7.41 19.41 15 11.83 15 30 17 30 17 11.83 24.59 19.41 26 18 16 8 6 18z"/><path d="M6 8V4H26V8H28V4a2 2 0 00-2-2H6A2 2 0 004 4V8z"/>',
  arrow: '<path d="M18 6L16.57 7.393 24.15 15 4 15 4 17 24.15 17 16.57 24.573 18 26 28 16 18 6z"/>',
  download: '<path d="M26 15L24.59 13.59 17 21.17 17 2 15 2 15 21.17 7.41 13.59 6 15 16 25 26 15z"/><path d="M26 24v4H6V24H4v4a2 2 0 002 2H26a2 2 0 002-2V24z"/>',
  plus: '<path d="M17 15L17 8 15 8 15 15 8 15 8 17 15 17 15 24 17 24 17 17 24 17 24 15z"/>',
};
const svg = (p, size, color, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="${color}" ${extra}>${p}</svg>`;
const spinner = '<svg class="spin" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="#e0e0e0" stroke-width="2"/><circle cx="10" cy="10" r="8" fill="none" stroke="#0f62fe" stroke-width="2" stroke-dasharray="20 60"/></svg>';

// ---------- file handling ----------
async function ensureMigration() {
  if (!state.migrationId) {
    const { id } = await api.createMigration();
    state.migrationId = id;
  }
  return state.migrationId;
}

async function addFiles(kind, list) {
  if (!list.length || state.phase !== 'upload') return;
  const def = KINDS[kind];
  const incoming = def.multi ? list : [list[list.length - 1]];

  // single-file kinds replace what was there; multi-file kinds replace same-named files
  const replaced = state.files[kind].filter((f) => (def.multi ? incoming.some((i) => i.name === f.name) : true));
  replaced.forEach(dropRemote);
  state.files[kind] = state.files[kind].filter((f) => !replaced.includes(f));

  const items = incoming.map((file) => {
    const typeOk = def.ext.includes(extOf(file.name));
    const empty = file.size === 0;
    const item = { id: ++nid, name: file.name, size: file.size, file,
      state: typeOk && !empty ? 'uploading' : 'bad',
      errTitle: !typeOk ? 'Invalid file type' : empty ? 'File is empty' : '',
      errText: !typeOk ? def.err : empty ? 'This file has no content. Export it again from Pentaho.' : '' };
    return item;
  });
  state.files[kind].push(...items);
  render();

  const toUpload = items.filter((i) => i.state === 'uploading');
  if (!toUpload.length) return;
  let migrationId;
  try { migrationId = await ensureMigration(); }
  catch (e) { toUpload.forEach((i) => fail(i, 'Upload failed', e.message)); toast(e.message); render(); return; }

  await Promise.all(toUpload.map(async (item) => {
    try {
      const { fileId } = await api.uploadFile(migrationId, kind, item.file);
      if (!state.files[kind].includes(item)) { api.removeFile(migrationId, fileId).catch(() => {}); return; } // removed while uploading
      item.remoteId = fileId; item.state = 'ok';
    } catch (e) {
      fail(item, e.status === 400 || e.status === 422 || e.code ? 'File rejected' : 'Upload failed', e.message);
    }
    item.file = null;
    render();
  }));
}

function fail(item, title, text) { item.state = 'bad'; item.errTitle = title; item.errText = text; item.file = null; }
function dropRemote(f) { if (f.remoteId && state.migrationId) api.removeFile(state.migrationId, f.remoteId).catch(() => {}); }

function removeFile(kind, id) {
  const f = state.files[kind].find((x) => x.id === id);
  if (!f) return;
  dropRemote(f);
  state.files[kind] = state.files[kind].filter((x) => x !== f);
  render();
}

// ---------- translation lifecycle ----------
async function start() {
  if (!isReady() || state.starting) return;
  state.starting = true; render();
  try {
    await api.start(state.migrationId, { ...state.settings });
    state.phase = 'translating'; state.step = 0; state.result = null;
    poll();
  } catch (e) { toast(e.message); }
  state.starting = false; render();
}

function poll() {
  clearInterval(pollTimer);
  const tick = async () => {
    try {
      const s = await api.getStatus(state.migrationId);
      if (state.phase !== 'translating') return;
      state.step = s.step || 0;
      if (s.status === 'complete') { stopPoll(); state.phase = 'complete'; state.step = 5; state.result = s; }
      else if (s.status === 'failed') { stopPoll(); state.phase = 'upload'; toast(s.error || 'The translation failed.'); }
      else if (s.status === 'cancelled') { stopPoll(); state.phase = 'upload'; }
      render();
    } catch (e) { /* transient error: keep polling */ }
  };
  pollTimer = setInterval(tick, config.POLL_INTERVAL_MS);
  tick();
}
function stopPoll() { clearInterval(pollTimer); pollTimer = null; }

async function cancel() {
  stopPoll();
  try { await api.cancel(state.migrationId); } catch (e) { toast(e.message); }
  state.phase = 'upload'; state.step = 0; render();
}

function reset() {
  stopPoll();
  Object.assign(state, { migrationId: null, phase: 'upload', step: 0, result: null,
    files: { ktr: [], kjb: [], doc: [] }, downloading: false });
  render();
}

async function download() {
  state.downloading = true; render();
  try { await api.download(state.migrationId, state.result.output.fileName); }
  catch (e) { toast(e.message); }
  state.downloading = false; render();
}

// ---------- views ----------
function viewProgress() {
  const idx = state.phase === 'upload' ? 0 : state.phase === 'translating' ? 1 : 2;
  const defs = [['Upload files', 'Transformations, job and document'], ['Translate', 'Pentaho to DataStage'], ['Download', 'DataStage .dsx export']];
  return `<ol class="prog" aria-label="Migration progress">${defs.map(([l, s], i) => {
    const complete = state.phase === 'complete' && i === 2;
    const done = i < idx || complete, cur = i === idx && !complete, todo = i > idx;
    const icon = done ? svg(I.checkOut, 16, '#0f62fe') : cur ? svg(I.dot, 16, '#0f62fe') : svg(I.ring, 16, '#161616');
    return `<li class="${todo ? 'todo' : ''} ${cur ? 'cur' : ''}"><div class="line"></div><div class="row">${icon}<div class="t"><span class="l">${l}</span><small>${s}</small></div></div></li>`;
  }).join('')}</ol>`;
}

function viewFileList(kind) {
  const list = state.files[kind];
  if (!list.length) return '';
  return `<ul class="files">${list.map((f) => {
    const status = f.state === 'ok' ? svg(I.check, 16, '#0f62fe', 'class="st" aria-label="Uploaded"')
      : f.state === 'bad' ? svg(I.err, 16, '#da1e28', 'class="st" aria-label="Invalid file"')
      : `<span class="st" aria-label="Uploading">${spinner.replace('width="20" height="20"', 'width="16" height="16"')}</span>`;
    return `<li class="file ${f.state === 'bad' ? 'bad' : ''}">
      <div class="file-row">${svg(I.file, 16, '#525252', 'style="flex-shrink:0"')}
        <span class="file-name">${esc(f.name)}</span><span class="file-size">${fmt(f.size)}</span>${status}
        <button class="icon-btn" aria-label="Remove file" data-act="remove" data-kind="${kind}" data-id="${f.id}">${svg(I.close, 16, 'currentColor')}</button></div>
      ${f.state === 'bad' ? `<div class="file-err"><b>${esc(f.errTitle)}</b><span>${esc(f.errText)}</span></div>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

function viewFlowSummary() {
  const okKjb = state.files.kjb.filter((f) => f.state === 'ok');
  const okKtr = state.files.ktr.filter((f) => f.state === 'ok');
  if (!okKjb.length && !okKtr.length) return '';

  const rows = (files, label) => files.map((f) =>
    `<li class="flow-sum-row">
       ${svg(I.file, 14, '#525252', 'style="flex-shrink:0"')}
       <span class="flow-sum-name">${esc(f.name)}</span>
       <span class="flow-sum-size">${fmt(f.size)}</span>
       <span class="tag">${label}</span>
     </li>`).join('');

  const outShape = okKjb.length && okKtr.length
    ? ` · will produce ${plural(okKjb.length, 'sequence job')} and ${plural(okKtr.length, 'parallel job')}`
    : '';

  return `<section class="panel flow-sum" aria-labelledby="sec-flowsum">
    <h2 id="sec-flowsum">Flow summary</h2>
    <p class="sub">${plural(okKjb.length, 'job')} · ${plural(okKtr.length, 'transformation')}${outShape}</p>
    <ul class="flow-sum-list">
      ${rows(okKjb, '.kjb')}
      ${rows(okKtr, '.ktr')}
    </ul>
  </section>`;
}

function viewUpload() {
  return Object.entries(KINDS).map(([k, d]) => `
    <section class="panel" aria-labelledby="sec-${k}">
      <div class="panel-head"><div><h2 id="sec-${k}">${d.title}</h2><p>${d.desc}</p></div><span class="tag">${d.tag}</span></div>
      <label class="dz" data-kind="${k}">
        <input class="vh" type="file" accept="${d.accept}" ${d.multi ? 'multiple' : ''} data-kind="${k}">
        ${svg(I.upload, 20, '#0f62fe')}
        <span><span class="hl">${d.dz}</span> or click to upload</span>
      </label>
      ${viewFileList(k)}
    </section>`).join('') + viewFlowSummary();
}

function viewTranslating() {
  const pct = Math.round((Math.min(state.step, 5) / 5) * 100);
  const okOf = (k) => state.files[k].filter((f) => f.state === 'ok');
  const details = [plural(okOf('kjb').length, '.kjb file'), plural(okOf('ktr').length, '.ktr file'), state.files.doc[0]?.name || '',
    `${plural(okOf('ktr').length, 'parallel job')} · ${plural(okOf('kjb').length, 'sequence job')}`, 'DataStage .dsx file'];
  return `<section class="panel" aria-labelledby="sec-run" aria-live="polite" style="gap:24px">
    <div><h2 class="lg" id="sec-run">Translating your flow</h2><p class="sub">You can leave this page. We notify you when the .dsx file is ready.</p></div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <div class="run-top"><span>${STEPS[Math.min(state.step, 4)]}</span><span style="color:#525252">${pct}%</span></div>
      <div class="bar-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Translation progress"><div class="bar" style="width:${pct}%"></div></div>
    </div>
    <ol class="steps">${STEPS.map((label, i) => {
      const done = i < state.step, active = i === state.step;
      const icon = done ? svg(I.check, 20, '#24a148', 'style="flex-shrink:0"') : active ? spinner : svg(I.ring, 20, '#8d8d8d', 'style="flex-shrink:0"');
      return `<li>${icon}<div class="t"><span class="${active ? 'active' : done ? '' : 'pending'}">${label}</span><small>${esc(details[i])}</small></div></li>`;
    }).join('')}</ol>
  </section>`;
}

function viewComplete() {
  const { output, mappings = [] } = state.result;
  return `<div class="note ok" role="status">${svg(I.check, 20, '#24a148', 'style="flex-shrink:0"')}
      <p><strong style="font-weight:600">Translation complete.</strong> Review the generated jobs in DataStage Designer before you run them in production.</p></div>
    <section class="panel" aria-labelledby="sec-out">
      <h2 class="lg" id="sec-out">DataStage export</h2>
      <div class="dl">${svg(I.file, 32, '#0f62fe', 'style="flex-shrink:0"')}
        <div class="t"><b>${esc(output.fileName)}</b><small>${plural(output.sequenceJobs, 'sequence job')} · ${plural(output.parallelJobs, 'parallel job')} · DataStage export format</small></div>
        <button class="btn btn-primary" data-act="download" ${state.downloading ? 'disabled' : ''}><span>${state.downloading ? 'Downloading…' : 'Download .dsx'}</span>${svg(I.download, 16, 'currentColor')}</button></div>
      <div class="tbl-wrap"><table class="tbl"><caption>What we translated</caption>
        <thead><tr><th scope="col">Pentaho source</th><th scope="col">Pentaho type</th><th scope="col">DataStage asset</th><th scope="col">Status</th></tr></thead>
        <tbody>${mappings.map((r) => `<tr><td class="mono">${esc(r.source)}</td><td>${esc(r.pentahoType)}</td>
          <td><span style="color:#161616">${esc(r.dsName)}</span><span style="color:#6f6f6f"> · ${esc(r.dsType)}</span></td>
          <td><span class="tag blue">${esc(r.status || 'Ready for review')}</span></td></tr>`).join('')}</tbody></table></div>
    </section>`;
}

function viewChecklist() {
  return Object.entries(KINDS).map(([k, d]) => {
    const list = state.files[k], nBad = list.filter((f) => f.state === 'bad').length;
    const detail = !list.length ? 'Not uploaded'
      : k === 'doc' ? list[0].name
      : plural(list.length, 'file') + (nBad ? ' · ' + plural(nBad, 'invalid file') : '');
    const icon = good(k) ? svg(I.check, 16, '#24a148', 'aria-label="Complete"') : bad(k) ? svg(I.err, 16, '#da1e28', 'aria-label="Needs attention"') : svg(I.ring, 16, '#8d8d8d', 'aria-label="Missing"');
    return `<li>${icon}<div class="t"><b>${d.summary}</b><small>${esc(detail)}</small></div></li>`;
  }).join('');
}

function viewActions() {
  if (state.phase === 'upload') {
    const anyBad = Object.keys(KINDS).some(bad), ready = isReady();
    const msg = anyBad ? 'Remove the invalid files to continue.' : pending() ? 'Uploading files…' : ready ? 'All inputs are ready.' : 'Upload all three inputs to start the translation.';
    return `<p class="gate ${anyBad ? 'bad' : ready ? 'good' : ''}">${msg}</p>
      <button class="btn btn-primary" data-act="start" ${ready && !state.starting ? '' : 'disabled'}><span>${state.starting ? 'Starting…' : 'Start translation'}</span>${svg(I.arrow, 16, 'currentColor')}</button>`;
  }
  if (state.phase === 'translating') return `<button class="btn btn-secondary" data-act="cancel"><span>Cancel translation</span>${svg(I.close, 16, 'currentColor')}</button>`;
  return `<button class="btn btn-tertiary" data-act="reset"><span>Start a new migration</span>${svg(I.plus, 16, 'currentColor')}</button>`;
}

// ---------- render ----------
function buildAside() {
  $('#aside').innerHTML = `<div class="in">
    <h2 id="sum-title">Migration summary</h2>
    <ul class="check" id="checklist"></ul>
    <div class="field"><label for="ds-version">Target DataStage version</label>
      <select id="ds-version" class="fld"><option>IBM DataStage 11.7</option><option>IBM DataStage on Cloud Pak for Data</option><option>IBM DataStage as a Service</option></select></div>
    <div class="field"><label for="ds-project">Target project</label>
      <input id="ds-project" class="fld" type="text" placeholder="For example, SALES_DWH" autocomplete="off"></div>
    <label class="cbx"><input id="ds-doc" type="checkbox" checked><span>Use the functional document to name stages and add job annotations</span></label>
  </div><div class="actions" id="actions"></div>`;
  $('#ds-version').onchange = (e) => (state.settings.targetVersion = e.target.value);
  $('#ds-project').oninput = (e) => (state.settings.projectName = e.target.value.trim());
  $('#ds-doc').onchange = (e) => (state.settings.useFunctionalDoc = e.target.checked);
}

function render() {
  $('#progress').innerHTML = viewProgress();
  $('#main').innerHTML = state.phase === 'upload' ? viewUpload() : state.phase === 'translating' ? viewTranslating() : viewComplete();
  $('#checklist').innerHTML = viewChecklist();
  $('#actions').innerHTML = viewActions();
  const locked = state.phase !== 'upload';
  ['#ds-version', '#ds-project', '#ds-doc'].forEach((s) => ($(s).disabled = locked));
}

// ---------- events (delegated, so re-rendering never loses handlers) ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'remove') removeFile(b.dataset.kind, +b.dataset.id);
  else if (act === 'start') start();
  else if (act === 'cancel') cancel();
  else if (act === 'reset') reset();
  else if (act === 'download') download();
});
document.addEventListener('change', (e) => {
  const input = e.target.closest('input[type=file]');
  if (!input) return;
  addFiles(input.dataset.kind, Array.from(input.files));
  input.value = '';
});
document.addEventListener('dragover', (e) => {
  const z = e.target.closest?.('.dz');
  if (!z) return;
  e.preventDefault(); z.classList.add('drag');
});
document.addEventListener('dragleave', (e) => e.target.closest?.('.dz')?.classList.remove('drag'));
document.addEventListener('drop', (e) => {
  const z = e.target.closest?.('.dz');
  if (!z) return;
  e.preventDefault(); z.classList.remove('drag');
  addFiles(z.dataset.kind, Array.from(e.dataTransfer.files));
});
// stop the browser opening a file dropped outside a zone
['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => { if (!e.target.closest?.('.dz')) e.preventDefault(); }));

buildAside();
render();
initSettings({ toast });
