import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../dist/server/index.js';

const MAX_REQUEST_BYTES = 30_000;
const DEFAULT_ASSET_ROOT = fileURLToPath(new URL('../dist/client/', import.meta.url));

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function safePublicOrigin(value) {
  const origin = new URL(value);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('PUBLIC_ORIGIN must be a bare http(s) origin.');
  }
  return origin.origin;
}

function plainError(status, message) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function readRequestBody(incoming) {
  const declared = Number(incoming.headers['content-length'] || 0);
  if (declared > MAX_REQUEST_BYTES) return null;
  const chunks = [];
  let total = 0;
  for await (const chunk of incoming) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function assetResponse(request, root, resolvedRoot) {
  const url = new URL(request.url);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return plainError(400, 'Invalid asset path.');
  }
  if (pathname.includes('\0') || pathname.split('/').some((part) => part.startsWith('.'))) {
    return plainError(404, 'Not found.');
  }
  const relativeName = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(root, relativeName);
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return plainError(404, 'Not found.');
  try {
    const resolved = await realpath(candidate);
    const realRelative = path.relative(resolvedRoot, resolved);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) return plainError(404, 'Not found.');
    const details = await stat(resolved);
    if (!details.isFile()) return plainError(404, 'Not found.');
    return new Response(await readFile(resolved), {
      status: 200,
      headers: {
        'Content-Type': mimeTypes.get(path.extname(resolved).toLowerCase()) || 'application/octet-stream',
        'Cache-Control': path.extname(resolved).toLowerCase() === '.html' ? 'no-cache' : 'public, max-age=3600'
      }
    });
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return plainError(404, 'Not found.');
    throw error;
  }
}

async function sendResponse(outgoing, response, headOnly) {
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);
  if (headOnly) {
    outgoing.end();
    return;
  }
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

function clientIpForWorker(incoming) {
  const realIp = Array.isArray(incoming.headers['x-real-ip'])
    ? incoming.headers['x-real-ip'][0]
    : incoming.headers['x-real-ip'];
  const forwarded = Array.isArray(incoming.headers['x-forwarded-for'])
    ? incoming.headers['x-forwarded-for'][0]
    : incoming.headers['x-forwarded-for'];
  const candidates = [realIp, forwarded?.split(',')[0], incoming.socket.remoteAddress];
  for (const value of candidates) {
    let candidate = value?.trim();
    if (candidate?.startsWith('::ffff:') && isIP(candidate.slice(7)) === 4) candidate = candidate.slice(7);
    if (candidate && isIP(candidate)) return candidate;
  }
  return 'unknown';
}

export function createSiteServer({ publicOrigin, env, assetRoot = DEFAULT_ASSET_ROOT }) {
  const origin = safePublicOrigin(publicOrigin);
  const root = path.resolve(assetRoot);
  const assets = {
    fetch: async (request) => assetResponse(request, root, await realpath(root))
  };
  const workerEnv = { ...env, ASSETS: assets };

  return createServer(async (incoming, outgoing) => {
    try {
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
        await sendResponse(outgoing, plainError(400, 'Invalid request URL.'), false);
        return;
      }
      const url = new URL(`${origin}${incoming.url}`);
      if (url.pathname !== '/api/chat' && !['GET', 'HEAD'].includes(incoming.method)) {
        await sendResponse(outgoing, plainError(405, 'Method not allowed.'), false);
        return;
      }
      const body = ['POST', 'PUT', 'PATCH'].includes(incoming.method) ? await readRequestBody(incoming) : undefined;
      if (body === null) {
        await sendResponse(outgoing, plainError(413, 'Request body is too large.'), false);
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
        else if (value !== undefined) headers.set(name, value);
      }
      headers.delete('host');
      headers.delete('content-length');
      headers.delete('cf-connecting-ip');
      headers.delete('x-client-ip');
      headers.set('x-client-ip', clientIpForWorker(incoming));
      const request = new Request(url, {
        method: incoming.method,
        headers,
        body
      });
      const response = await worker.fetch(request, workerEnv);
      await sendResponse(outgoing, response, incoming.method === 'HEAD');
    } catch (error) {
      console.error('Request failed:', error?.message || error);
      if (!outgoing.headersSent) await sendResponse(outgoing, plainError(500, 'Service unavailable.'), false);
      else outgoing.end();
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  if (!process.env.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN is required.');
  const server = createSiteServer({ publicOrigin: process.env.PUBLIC_ORIGIN, env: process.env });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Pujiantang site listening on 127.0.0.1:${port}`);
  });
}
