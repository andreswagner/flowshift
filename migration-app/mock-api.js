// In-browser stand-in for the backend, same shape as api.js. Delete when the real API is live.
const jobs = new Map();
let seq = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const api = {
  async createMigration() {
    await wait(150);
    const id = 'mock-' + ++seq;
    jobs.set(id, { files: [], t0: 0, cancelled: false });
    return { id };
  },
  async uploadFile(id, kind, file) {
    await wait(250);
    if (file.size === 0) {
      const e = new Error('This file has no content. Export it again from Pentaho.');
      e.code = 'EMPTY_FILE';
      throw e;
    }
    const fileId = 'f' + ++seq;
    jobs.get(id).files.push({ fileId, kind, name: file.name });
    return { fileId };
  },
  async removeFile(id, fileId) {
    const j = jobs.get(id);
    j.files = j.files.filter((f) => f.fileId !== fileId);
  },
  async start(id) { const j = jobs.get(id); j.t0 = Date.now(); j.cancelled = false; },
  async cancel(id) { jobs.get(id).cancelled = true; },
  async getStatus(id) {
    const j = jobs.get(id);
    if (j.cancelled) return { status: 'cancelled', step: 0 };
    const step = Math.min(5, Math.floor((Date.now() - j.t0) / 1200));
    if (step < 5) return { status: 'running', step };
    const stem = (n, re) => n.replace(re, '');
    const kjb = j.files.filter((f) => f.kind === 'kjb');
    const ktr = j.files.filter((f) => f.kind === 'ktr');
    return {
      status: 'complete', step: 5,
      output: {
        fileName: (kjb.length === 1 ? stem(kjb[0].name, /\.kjb$/i) : 'pentaho_migration') + '.dsx',
        sequenceJobs: kjb.length, parallelJobs: ktr.length,
      },
      mappings: [
        ...kjb.map((f) => ({ source: f.name, pentahoType: 'Job', dsName: stem(f.name, /\.kjb$/i), dsType: 'Sequence job', status: 'Ready for review' })),
        ...ktr.map((f) => ({ source: f.name, pentahoType: 'Transformation', dsName: stem(f.name, /\.ktr$/i), dsType: 'Parallel job', status: 'Ready for review' })),
      ],
    };
  },
  async download(id, fileName) {
    const blob = new Blob(['// mock .dsx export\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  },
};
