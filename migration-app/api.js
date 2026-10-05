// The only file that talks to the backend. The UI calls these five functions
// and nothing else, so wiring your API means editing this file (or config.js).
//
// Assumed contract (change paths / field names here to match your services):
//
//   POST   {BASE}/migrations                      -> { id }
//   POST   {BASE}/migrations/:id/files            multipart: kind=ktr|kjb|doc, file=<File> (one per request)
//                                                 -> { fileId }          (4xx + {code,message} if rejected)
//   DELETE {BASE}/migrations/:id/files/:fileId    -> 204
//   POST   {BASE}/migrations/:id/start            JSON {targetVersion, projectName, useFunctionalDoc} -> 202
//   POST   {BASE}/migrations/:id/cancel           -> 204   (migration returns to draft; /start may be called again)
//   GET    {BASE}/migrations/:id                  -> MigrationStatus (below)
//   GET    {BASE}/migrations/:id/download         -> .dsx file (binary)
//
// MigrationStatus = {
//   status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled',
//   step:   0..5,                       // number of finished pipeline steps
//   error?: string,
//   output?: { fileName, sequenceJobs, parallelJobs },
//   mappings?: [{ source, pentahoType: 'Job'|'Transformation', dsName, dsType, status }]
// }
import { config } from './config.js';
import * as mock from './mock-api.js';

async function http(path, opts = {}) {
  const res = await fetch(config.BASE_URL + path, {
    ...opts,
    headers: { ...config.getAuthHeaders(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch (_) { /* non-JSON error */ }
    const err = new Error(body.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body.code;
    throw err;
  }
  return res;
}

const real = {
  async createMigration() {
    const res = await http('/migrations', { method: 'POST' });
    return res.json(); // { id }
  },

  async uploadFile(migrationId, kind, file) {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file, file.name);
    const res = await http(`/migrations/${migrationId}/files`, { method: 'POST', body: form });
    return res.json(); // { fileId }
  },

  async removeFile(migrationId, fileId) {
    await http(`/migrations/${migrationId}/files/${fileId}`, { method: 'DELETE' });
  },

  async start(migrationId, settings) {
    await http(`/migrations/${migrationId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  },

  async cancel(migrationId) {
    await http(`/migrations/${migrationId}/cancel`, { method: 'POST' });
  },

  async getStatus(migrationId) {
    const res = await http(`/migrations/${migrationId}`);
    return res.json(); // MigrationStatus
  },

  async download(migrationId, fileName) {
    const res = await http(`/migrations/${migrationId}/download`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const api = config.USE_MOCK ? mock.api : real;
