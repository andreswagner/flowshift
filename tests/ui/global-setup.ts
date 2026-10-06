/**
 * Playwright global setup — starts the Flask gateway in mock mode before any
 * test runs, and tears it down afterwards.
 *
 * The server is started as a child process on port 5000 (the default).
 * Set the PORT env var to override.
 */
import { spawn, ChildProcess } from 'child_process';
import { FullConfig } from '@playwright/test';

let server: ChildProcess | null = null;

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs} ms`);
}

export default async function globalSetup(_config: FullConfig) {
  const port = process.env.PORT ?? '5000';
  server = spawn('python', ['server/app.py'], {
    env: { ...process.env, PORT: port },
    stdio: 'pipe',
  });
  server.stderr?.on('data', (d) => process.stderr.write(d));
  await waitForServer(`http://127.0.0.1:${port}/`);
  (globalThis as any).__pw_server__ = server;
}

export async function globalTeardown() {
  const s = (globalThis as any).__pw_server__;
  if (s) s.kill();
}
