import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const prompt = await readFile(path.join(root, 'src', 'pujiantang-system-prompt.txt'), 'utf8');
const template = await readFile(path.join(root, 'src', 'worker-template.js'), 'utf8');

if (!template.includes('__SYSTEM_PROMPT_JSON__')) {
  throw new Error('Worker template is missing the system prompt placeholder.');
}

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'client'), { recursive: true });
await mkdir(path.join(dist, 'server'), { recursive: true });
await cp(path.join(root, 'site'), path.join(dist, 'client'), { recursive: true });
await writeFile(
  path.join(dist, 'server', 'index.js'),
  template.replace('__SYSTEM_PROMPT_JSON__', JSON.stringify(prompt)),
  'utf8'
);

console.log('Built client assets and server worker in dist/.');
