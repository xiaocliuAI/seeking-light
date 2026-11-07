import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('./journal.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./journal.css', import.meta.url), 'utf8');
for (const match of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
  assert(Number(match[1]) >= 14, 'Explicit text sizes must be at least 14px, including mobile');
}
assert.match(css, /body \{[^}]*font:16px/);
assert.match(css, /\.annotation \{[^}]*font-size:16px/);
assert.match(html, /<details class="sample-banner"><summary>体验稿 · 仅本机保存 · 发现为示例<\/summary>/);
assert.match(html, /不分析新输入/);
assert.match(html, /不会跨设备同步/);
assert(!html.includes('class="edition"'), 'No redundant design label in the header');
assert(!html.includes('class="page-footer"'), 'No repeated explanatory footer');
new vm.Script(js);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'IDs are unique');
for (const match of js.matchAll(/\$\('#([^']+)'\)/g)) assert(ids.includes(match[1]), `Missing element: ${match[1]}`);
assert(js.includes("'seeking-light-layout-prototype-v1'"));
assert(!js.includes('seeking-light-journal-v5'), 'Prototype must not access formal diary storage');
assert(!/\b(fetch|XMLHttpRequest|WebSocket)\b/.test(js), 'No record transmission or model calls');
assert(!/\.innerHTML\s*=/.test(js), 'User text must not become HTML');
const samples = vm.runInNewContext(`(${js.match(/const samples = ([\s\S]*?);\n  const findings/)[1]})`);
const findings = vm.runInNewContext(`(${js.match(/const findings = ([\s\S]*?);\n  let saved/)[1]})`);
assert.equal(samples.length, 7);
assert.equal(new Set(samples.map(note => note.id)).size, 7);
for (const finding of Object.values(findings)) {
  assert.equal(finding.evidence.length, 3);
  for (const [id, quote] of finding.evidence) assert(samples.find(note => note.id === id)?.text.includes(quote), `Quote not in original: ${id}`);
}
function luminance(hex) {
  return hex.match(/[a-f\d]{2}/gi).map(part => parseInt(part, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}
for (const [foreground, background] of [['283638','ffffff'],['56656a','ffffff'],['175f65','ffffff'],['92344c','ffffff'],['283638','f5d883']]) {
  const [dark, light] = [luminance(foreground), luminance(background)].sort((a,b) => a-b);
  assert((light + 0.05) / (dark + 0.05) >= 4.5, `Insufficient contrast: ${foreground}/${background}`);
}
console.log('Passed: syntax, element IDs, isolated storage, no model calls, text safety, six exact quotes, five text contrast pairs.');
