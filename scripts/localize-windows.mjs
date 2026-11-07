// Generate a Windows-only overlay; never rewrite the upstream frontend.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'token2-piv-gui/ui');
const output = path.join(root, 'token2-piv-gui/ui-windows');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'locales/zh-CN.json'), 'utf8'));
const used = new Set();
const tr = (text) => {
  if (!Object.hasOwn(catalog.text, text)) return text;
  used.add(text);
  return catalog.text[text];
};
function html(text) {
  return text.replace(/>([^<>]+)</g, (whole, value) => {
    const trimmed = value.trim();
    return '>' + value.replace(trimmed, tr(trimmed)) + '<';
  }).replace(/\b(title|aria-label|placeholder)="([^"]*)"/g,
    (_, attr, value) => `${attr}="${tr(value)}"`);
}
function walk(node, visit) {
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) if (child?.type) walk(child, visit);
    } else if (value?.type) walk(value, visit);
  }
}
const originalJs = fs.readFileSync(path.join(source, 'app.js'), 'utf8');
const patches = JSON.parse(fs.readFileSync(path.join(root, 'locales/windows-patches.json'), 'utf8'));
const patchKeys = Object.keys(patches).sort((a, b) => b.length - a.length);
for (const key of patchKeys) if (!originalJs.includes(key)) throw new Error(`Stale Windows patch: ${key}`);
const patchPattern = new RegExp(patchKeys.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const js = originalJs.replace(patchPattern, (s) => patches[s]);
const edits = [];
walk(parse(js, { ecmaVersion: 'latest' }), (node) => {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    const translated = html(tr(node.value));
    if (translated !== node.value) edits.push([node.start, node.end, JSON.stringify(translated)]);
  }
  if (node.type === 'TemplateElement') {
    const raw = node.value.raw;
    const translated = html(tr(raw));
    if (translated !== raw) {
      if (translated.includes('`') || translated.includes('${')) throw new Error('Unsafe template translation');
      edits.push([node.start, node.end, translated]);
    }
  }
});
let localizedJs = js;
for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) {
  localizedJs = localizedJs.slice(0, start) + text + localizedJs.slice(end);
}
parse(localizedJs, { ecmaVersion: 'latest' });
const localizedHtml = html(fs.readFileSync(path.join(source, 'index.html'), 'utf8'))
  .replace('<html lang="en">', '<html lang="zh-CN">')
  .replace('<script src="app.js">', '<script src="zh-display.js"></script>\n<script src="app.js">');
const stale = Object.keys(catalog.text).filter((key) => !used.has(key));
if (stale.length) throw new Error('Upstream text changed; review unused translations:\n' + stale.join('\n'));

// Detect upstream changes that have not yet been reviewed. Updating this baseline
// is a deliberate step after inspecting new UI text, not an automatic build step.
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'locales/upstream-ui.json'), 'utf8'));
const { createHash } = await import('node:crypto');
for (const filename of ['index.html', 'app.js', 'style.css']) {
  const hash = createHash('sha256').update(fs.readFileSync(path.join(source, filename), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
  if (baseline[filename] !== hash) throw new Error(`Upstream ${filename} changed: review the diff and update locales/upstream-ui.json`);
}
if (!process.argv.includes('--check')) {
  fs.mkdirSync(output, { recursive: true });
  fs.cpSync(source, output, { recursive: true });
  fs.writeFileSync(path.join(output, 'index.html'), localizedHtml);
  fs.writeFileSync(path.join(output, 'app.js'), localizedJs);
  const display = fs.readFileSync(path.join(root, 'locales/display-zh-CN.json'), 'utf8');
  fs.writeFileSync(path.join(output, 'zh-display.js'), `// Translate only display values; backend responses stay untouched.\nwindow.zhDisplay = (value) => {\n  const text = String(value ?? '');\n  const messages = ${display};\n  if (Object.hasOwn(messages, text)) return messages[text];\n  for (const [en, zh] of Object.entries(messages).sort((a,b) => b[0].length-a[0].length)) {\n    if (en.length > 16 && text.includes(en)) return text.replace(en, zh);\n  }\n  return text;\n};\n`);
  fs.appendFileSync(path.join(output, 'style.css'), '\n/* Windows simplified Chinese typography. */\n:root { font-family: "Inter", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif; }\nh2 { letter-spacing: 0; }\n');
}
console.log(`Windows zh-CN: ${used.size} translations, ${edits.length} JavaScript edits; upstream sources preserved.`);
