/**
 * Streets of Angels - Vehicle Test Harness Dev Server
 * Serves with COOP/COEP headers required for SharedArrayBuffer.
 * Run: bun server.js [port]
 */

import { readFile } from 'fs/promises';
import { extname, join, resolve } from 'path';

const PORT = parseInt(process.argv[2] ?? '8080');
const ROOT = resolve(import.meta.dir);

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
};

const SECURITY_HEADERS = {
  // Required for SharedArrayBuffer across threads
  'Cross-Origin-Opener-Policy':   'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  // Allow CDN assets (BabylonJS, Havok WASM)
  'Access-Control-Allow-Origin':  '*',
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url    = new URL(req.url);
    let pathname = url.pathname === '/' ? '/index.html' : url.pathname;

    // Security: prevent path traversal
    const filePath = join(ROOT, pathname);
    if (!filePath.startsWith(ROOT)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const data = await readFile(filePath);
      const ext  = extname(filePath);
      const ct   = MIME[ext] ?? 'application/octet-stream';

      return new Response(data, {
        headers: {
          'Content-Type': ct,
          ...SECURITY_HEADERS,
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  },
});

console.log(`[Harness Server] http://localhost:${PORT}`);
console.log(`[Harness Server] COOP/COEP headers active - SharedArrayBuffer enabled`);
console.log(`[Harness Server] Ctrl+C to stop`);