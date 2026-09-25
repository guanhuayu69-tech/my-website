import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';

const env = {
  DEEPSEEK_API_KEY: 'test-only-key',
  DEEPSEEK_MODEL: 'deepseek-flash',
  CHAT_SESSION_SECRET: 'test-only-session-secret-with-enough-length',
  ASSETS: {
    fetch: async () => new Response('<!doctype html><title>普健堂</title>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
};

let upstreamCalls = 0;
let finalInstructionSeen = false;
let personaInstructionSeen = false;
let upstreamMode = 'success';
globalThis.fetch = async (url, options) => {
  assert.equal(String(url), 'https://api.deepseek.com/chat/completions');
  assert.match(options.headers.Authorization, /^Bearer /);
  const body = JSON.parse(options.body);
  assert.equal(body.model, 'deepseek-flash');
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.reasoning_effort, 'none');
  assert.equal(typeof options.signal?.aborted, 'boolean');
  upstreamCalls += 1;
  finalInstructionSeen ||= body.messages[0].content.includes('第 8 次回复强制要求');
  personaInstructionSeen ||= body.messages[0].content.includes('默认只问 1 个最有价值的问题')
    && body.messages[0].content.includes('发现矛盾要具体指出并核实')
    && body.messages[0].content.includes('问题否定');
  if (upstreamMode === 'timeout') {
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  }
  if (upstreamMode === 'slow-body') {
    return {
      ok: true,
      json: () => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      })
    };
  }
  return Response.json({ choices: [{ message: { content: finalInstructionSeen ? '阶段性总结测试回复' : '测试回复' } }] });
};

async function chat(message, cookie = '', origin = 'https://example.com', ip = '203.0.113.10') {
  const headers = { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip };
  if (cookie) headers.Cookie = cookie;
  const response = await worker.fetch(new Request('https://example.com/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, history: [] })
  }), env);
  const data = await response.json();
  const setCookie = response.headers.get('Set-Cookie');
  return { response, data, cookie: setCookie?.split(';')[0] || cookie };
}

let cookie = '';
for (let turn = 1; turn <= 8; turn += 1) {
  const result = await chat(`第 ${turn} 条测试消息`, cookie);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.turn, turn);
  assert.equal(result.data.remaining, 8 - turn);
  assert.equal(result.data.limitReached, turn === 8);
  cookie = result.cookie;
}
assert.equal(upstreamCalls, 8);
assert.equal(finalInstructionSeen, true);
assert.equal(personaInstructionSeen, true);

const ninth = await chat('第九条消息', cookie);
assert.equal(ninth.response.status, 429);
assert.equal(ninth.data.limitReached, true);
assert.match(ninth.data.reply, /dannyyuguanhua/);
assert.equal(upstreamCalls, 8);

const emergency = await chat('我现在胸痛而且呼吸困难');
assert.equal(emergency.response.status, 200);
assert.equal(emergency.data.emergency, true);
assert.match(emergency.data.reply, /120/);
assert.equal(upstreamCalls, 8);

const address = await chat('普健堂地址在哪里，怎么预约？');
assert.equal(address.response.status, 200);
assert.equal(address.data.direct, true);
assert.match(address.data.reply, /碧桂园华府东区 114 号/);
assert.match(address.data.reply, /不视为预约成功/);
assert.equal(upstreamCalls, 8);

const pricing = await chat('你们收费多少钱？');
assert.equal(pricing.response.status, 200);
assert.equal(pricing.data.direct, true);
assert.match(pricing.data.reply, /没有已核实的公开价格/);
assert.equal(upstreamCalls, 8);

const doctorSchedule = await chat('哪位医生出诊，有排班吗？');
assert.equal(doctorSchedule.response.status, 200);
assert.equal(doctorSchedule.data.direct, true);
assert.match(doctorSchedule.data.reply, /演示占位/);
assert.equal(upstreamCalls, 8);

const foreignOrigin = await chat('普通咨询', '', 'https://attacker.example');
assert.equal(foreignOrigin.response.status, 403);

upstreamMode = 'timeout';
env.DEEPSEEK_TIMEOUT_MS = '20';
const timedOut = await chat('最近总觉得睡不沉', '', 'https://example.com', '203.0.113.20');
assert.equal(timedOut.response.status, 504);
assert.match(timedOut.data.error, /等待超时/);
assert.equal(timedOut.response.headers.get('Set-Cookie'), null);
upstreamMode = 'success';
delete env.DEEPSEEK_TIMEOUT_MS;
const retryAfterTimeout = await chat('最近总觉得睡不沉', '', 'https://example.com', '203.0.113.20');
assert.equal(retryAfterTimeout.response.status, 200);
assert.equal(retryAfterTimeout.data.turn, 1);

upstreamMode = 'slow-body';
env.DEEPSEEK_TIMEOUT_MS = '20';
const slowBody = await chat('最近容易疲倦', '', 'https://example.com', '203.0.113.21');
assert.equal(slowBody.response.status, 504);
assert.equal(slowBody.response.headers.get('Set-Cookie'), null);
upstreamMode = 'success';
delete env.DEEPSEEK_TIMEOUT_MS;

for (let attempt = 1; attempt <= 12; attempt += 1) {
  const accepted = await chat('地址在哪里？', '', 'https://example.com', '198.51.100.23');
  assert.equal(accepted.response.status, 200);
}
const throttled = await chat('地址在哪里？', '', 'https://example.com', '198.51.100.23');
assert.equal(throttled.response.status, 429);
assert.match(throttled.data.error, /发送得太快/);
assert.ok(Number(throttled.response.headers.get('Retry-After')) >= 1);
assert.equal(throttled.response.headers.get('Set-Cookie'), null);

const page = await worker.fetch(new Request('https://example.com/'), env);
assert.equal(page.status, 200);
assert.match(page.headers.get('Content-Security-Policy'), /connect-src 'self'/);

console.log('Worker tests passed: personality, direct answers, 8-turn limit, timeout, IP rate limit, emergency, origin and security rules.');
