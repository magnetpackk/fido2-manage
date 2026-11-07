import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'acorn';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const original = read('token2-piv-gui/ui/app.js');
const localized = read('token2-piv-gui/ui-windows/app.js');
const sourceHtml = read('token2-piv-gui/ui/index.html');
const zhHtml = read('token2-piv-gui/ui-windows/index.html');
const stable = (node) => JSON.stringify(node, (key, value) => ['start', 'end', 'raw'].includes(key) ? undefined : value);
const protectedCalls = new Set(['invoke', '$', '$$', 'getElementById', 'querySelector', 'querySelectorAll', 'addEventListener', 'setAttribute', 'getAttribute']);
function calls(code) {
  const values = [];
  function walk(node) {
    if (node.type === 'CallExpression') {
      const name = node.callee.name || node.callee.property?.name;
      if (protectedCalls.has(name)) values.push([name, (name === 'addEventListener' ? node.arguments.slice(0, 1) : node.arguments).map(stable)]);
    }
    if (node.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(node.operator)) {
      values.push(['comparison', [stable(node)]]);
    }
    if (node.type === 'SwitchCase') values.push(['switch', [stable(node.test)]]);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) walk(child); }
      else if (value?.type) walk(value);
    }
  }
  walk(parse(code, { ecmaVersion: 'latest' }));
  return values;
}
const actualCalls = calls(localized), expectedCalls = calls(original);
assert.equal(actualCalls.length, expectedCalls.length);
for (let i = 0; i < actualCalls.length; i++) {
  assert.ok(JSON.stringify(actualCalls[i]) === JSON.stringify(expectedCalls[i]), `Protected call ${i} changed: ${expectedCalls[i][0]}`);
}
function tags(html) {
  return html.replace('<script src="zh-display.js"></script>\n', '').match(/<[^>]+>/g)
    .map((tag) => tag.replace(/\b(title|aria-label|placeholder|lang)="[^"]*"/g, '$1="DISPLAY"'));
}
assert.deepEqual(tags(zhHtml), tags(sourceHtml), 'Forms, values, IDs and non-display attributes must stay unchanged');
assert.match(zhHtml, /lang="zh-CN"/);
assert.match(zhHtml, /全部通行密钥、指纹和 PIN 将被清除/);

const dom = new JSDOM(zhHtml, { runScripts: 'outside-only', url: 'https://local.test/' });
const w = dom.window;
const invoked = [];
const failures = [];
const replies = {
  app_version: '0.2.2', fido_environment: { os: 'windows', elevated: false, privileged: false },
  list_readers: [], oath_list_readers: [], fido_list_devices: [], otp_hid_detect: [],
  presence: { readers: [], fido_devices: 0 }, cards_present: 0,
  capabilities: { piv: false, fido: false, token2_otp: false, oath: false, openpgp: false },
  pcsc_health: { available: false, message: 'The PC/SC smart-card service isn\'t responding. Reconnect the key or restart the app.' },
  pcsc_status: { ok: false, readers: 0, message: 'The PC/SC smart-card service isn\'t responding. Reconnect the key or restart the app.' }
};
w.__TAURI__ = { core: { invoke: async (command) => {
  invoked.push(command);
  if (!(command in replies)) throw new Error(`Unexpected command during no-device smoke test: ${command}`);
  return replies[command];
} } };
w.setInterval = () => 0;
w.setTimeout = () => 0;
w.console.warn = () => {};
w.addEventListener('error', (e) => failures.push(String(e.error)));
w.eval(read('token2-piv-gui/ui-windows/zh-display.js'));
w.eval(localized);
await new Promise((resolve) => setTimeout(resolve, 100));
assert.deepEqual(failures, []);
assert.equal(w.document.documentElement.lang, 'zh-CN');
assert.equal(w.document.getElementById('home-board').hidden, false);
assert.equal(w.document.getElementById('home-title').textContent, '未检测到密钥');
assert.match(w.document.getElementById('home-sub').textContent, /请插入安全密钥/);
assert.match(w.document.getElementById('about-version').textContent, /版本 0.2.2/);
assert.equal(w.document.getElementById('pcsc-warn').hidden, false);
assert.match(w.document.getElementById('pcsc-warn-text').textContent, /智能卡服务无响应/);
assert.equal(w.zhDisplay('wrong PIN'), 'PIN 错误');
assert.equal(w.zhDisplay('unknown vendor error 0x42'), 'unknown vendor error 0x42');
assert.equal(w.zhDisplay('Too high — move your finger down'), '位置过高，请将手指向下移动');
assert.ok(invoked.includes('presence'));
assert.ok(invoked.every((command) => command in replies));
w.close();
console.log('PASS: command/form compatibility, no-device startup, Chinese home/version/service warning and fingerprint feedback.');
