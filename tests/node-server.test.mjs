import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createSiteServer } from '../scripts/serve-node.mjs';

const env = {
  DEEPSEEK_API_KEY: 'test-only-key',
  CHAT_SESSION_SECRET: 'test-only-session-secret-with-enough-length'
};
const server = createSiteServer({ publicOrigin: 'http://127.0.0.1:3000', env });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(home.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.match(await home.text(), /普健堂/);

  const stylesheet = await fetch(`${base}/styles.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /text\/css/);

  const missing = await fetch(`${base}/.env`);
  assert.equal(missing.status, 404);

  const badOrigin = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '你们的地址在哪里？' })
  });
  assert.equal(badOrigin.status, 403);

  const direct = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '你们的地址在哪里？' })
  });
  assert.equal(direct.status, 200);
  assert.match(direct.headers.get('set-cookie'), /HttpOnly/);
  assert.match(direct.headers.get('set-cookie'), /Secure/);
  const answer = await direct.json();
  assert.equal(answer.turn, 1);
  assert.match(answer.reply, /碧桂园华府东区 114 号/);

  const large = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'a'.repeat(30_100) })
  });
  assert.equal(large.status, 413);

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const accepted = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        'Content-Type': 'application/json',
        'X-Real-IP': '198.51.100.88',
        'X-Client-IP': `203.0.113.${attempt}`
      },
      body: JSON.stringify({ message: '地址在哪里？' })
    });
    assert.equal(accepted.status, 200);
  }
  const throttled = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: {
      Origin: 'http://127.0.0.1:3000',
      'Content-Type': 'application/json',
      'X-Real-IP': '198.51.100.88',
      'X-Client-IP': '203.0.113.250'
    },
    body: JSON.stringify({ message: '地址在哪里？' })
  });
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get('retry-after')) >= 1);

  console.log('Node server tests passed: static assets, security headers, hidden files, chat, origin, input and trusted-IP limits.');
} finally {
  server.close();
  await once(server, 'close');
}
