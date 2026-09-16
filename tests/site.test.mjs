import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = fileURLToPath(new URL('../site/', import.meta.url));
const html = await readFile(path.join(siteDir, 'index.html'), 'utf8');
const css = await readFile(new URL('../site/styles.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../site/site.js', import.meta.url), 'utf8');

for (const required of [
  'id="main-content"',
  'class="quick-route"',
  'id="consult-card"',
  'id="privacy-consent"',
  'data-copy-wechat',
  'class="mobile-dock"',
  'application/ld+json',
  '18022742282',
  'dannyyuguanhua'
]) {
  assert.ok(html.includes(required), `Missing required site marker: ${required}`);
}

assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /focus-visible/);
assert.match(js, /IntersectionObserver/);
assert.match(js, /data-consult-prefill/);
assert.match(js, /1200/);
assert.match(js, /queryPrefills/);
assert.match(js, /consult-visible/);
assert.match(css, /body\.consult-visible \.mobile-dock/);

const sectionOrder = ['id="paths"', 'id="services"', 'id="doctor"', 'id="cases"', 'id="consult"', 'id="contact"'];
for (let index = 1; index < sectionOrder.length; index += 1) {
  assert.ok(html.indexOf(sectionOrder[index - 1]) < html.indexOf(sectionOrder[index]), `Wrong homepage order near ${sectionOrder[index]}`);
}

const navHrefIds = [...html.matchAll(/<a[^>]+href="#([a-z-]+)"/g)].map((match) => match[1]);
for (const id of new Set(navHrefIds)) {
  assert.ok(html.includes(`id="${id}"`), `Hash link points to missing id: ${id}`);
}

const htmlFiles = (await readdir(siteDir)).filter((name) => name.endsWith('.html'));
for (const filename of htmlFiles) {
  const page = await readFile(path.join(siteDir, filename), 'utf8');
  for (const match of page.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|tel:|mailto:|data:|#)/.test(target)) continue;
    const clean = target.split(/[?#]/)[0];
    if (!clean) continue;
    await access(path.resolve(siteDir, clean));
  }
}

const directions = await readFile(path.join(siteDir, 'directions.html'), 'utf8');
const doctors = await readFile(path.join(siteDir, 'doctors.html'), 'utf8');
const notes = await readFile(path.join(siteDir, 'notes.html'), 'utf8');
const appointment = await readFile(path.join(siteDir, 'appointment.html'), 'utf8');
const privacy = await readFile(path.join(siteDir, 'privacy.html'), 'utf8');
const serviceNotice = await readFile(path.join(siteDir, 'service-notice.html'), 'utf8');
const enterprise = await readFile(path.join(siteDir, 'enterprise.html'), 'utf8');

for (const id of ['sleep', 'fatigue', 'digestion', 'stress', 'family', 'seasonal']) {
  assert.ok(directions.includes(`id="${id}"`), `Direction detail is missing: ${id}`);
}
for (const id of ['demo-1', 'demo-2', 'demo-3']) {
  assert.ok(doctors.includes(`id="${id}"`), `Demo doctor profile is missing: ${id}`);
}
assert.match(doctors, /示例人物 · 待替换/);
assert.match(doctors, /不代表普健堂真实员工或排班/);
assert.match(notes, /阅读全文|健康笔记/);
assert.match(appointment, /未收到门诊人工确认前，不视为预约成功/);
assert.match(privacy, /DeepSeek 模型/);
assert.match(serviceNotice, /失败的请求不扣次数/);
assert.match(enterprise, /不构成现有服务或价格承诺/);

console.log(`Site tests passed: ${htmlFiles.length} linked pages, homepage order, details, placeholders, consultation, accessibility and SEO.`);
