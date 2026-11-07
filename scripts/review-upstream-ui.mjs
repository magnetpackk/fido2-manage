// Run after merging upstream. --accept is an explicit human-review checkpoint.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const base = JSON.parse(load('locales/upstream-ui.json'));
const catalog = JSON.parse(load('locales/zh-CN.json')).text;
const patches = JSON.parse(load('locales/windows-patches.json'));
const sources = Object.fromEntries(['index.html', 'app.js', 'style.css'].map((f) => [f, load('token2-piv-gui/ui/' + f)]));
const hashes = Object.fromEntries(Object.entries(sources).map(([f, text]) => [f, createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')]));
const candidates = new Set();
const translated = new Set(Object.keys(catalog).map((key) => key.trim()));
function candidate(text) {
  const value = text.trim();
  // Suggestions only: protocol names, log messages and identifiers still need review.
  if (/^[#.[]/.test(value) || value.includes('data-') || value.includes('input[') || value.includes('button[')) return;
  if (/[a-z]/i.test(value) && /\s/.test(value) && !translated.has(value) && !/[\u4e00-\u9fff]/.test(value) && !value.includes('<')) candidates.add(value);
}
for (const match of sources['index.html'].matchAll(/>([^<>]+)</g)) candidate(match[1]);
for (const match of sources['index.html'].matchAll(/\b(?:title|aria-label|placeholder)="([^"]*)"/g)) candidate(match[1]);
function walk(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') candidate(node.value);
  if (node.type === 'TemplateElement') candidate(node.value.raw);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const child of value) if (child?.type) walk(child); }
    else if (value?.type) walk(value);
  }
}
walk(parse(sources['app.js'], { ecmaVersion: 'latest' }));
const report = {
  changedFiles: Object.keys(hashes).filter((f) => hashes[f] !== base[f]),
  stalePatches: Object.keys(patches).filter((key) => !sources['app.js'].includes(key)),
  untranslatedCandidates: [...candidates].sort()
};
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts/localization-review.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Changed files: ${report.changedFiles.join(', ') || 'none'}; stale patches: ${report.stalePatches.length}; candidate phrases: ${candidates.size}.`);
console.log('Review artifacts/localization-review.json and git diff before accepting a new baseline.');
if (process.argv.includes('--accept')) {
  if (report.stalePatches.length) throw new Error('Resolve stale context patches before accepting');
  fs.writeFileSync(path.join(root, 'locales/upstream-ui.json'), JSON.stringify(hashes, null, 2) + '\n');
  console.log('Updated reviewed UI hashes. Run npm run check:localization, then build and inspect affected pages.');
}
