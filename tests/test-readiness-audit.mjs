import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../output/seeking-light/server.mjs';
import { fixtureVersion, fixtureMarker, records, inputCases, crossDay } from './web-fixtures.mjs';

assert.equal(fixtureVersion, 'seeking-light-web-fiction-v1');
assert.equal(fixtureMarker, 'TEST_ONLY_FICTION');
for (const entry of [...records, ...inputCases, crossDay]) {
  assert.equal(entry.fictional, true);
  assert.equal(entry.fixtureMarker, fixtureMarker);
}
assert.equal(new Set([...records, ...inputCases].map(entry => entry.id)).size, records.length + inputCases.length);
for (const entry of records) {
  assert.match(entry.id, /^test-/);
  assert.match(entry.date, /^2026-11-\d{2}$/);
  assert.match(entry.time, /^\d{2}:\d{2}$/);
  if (entry.scenario !== 'single-character') assert.match(entry.text, /虚构测试/);
}
assert.equal(records.find(entry => entry.scenario === 'single-character').text, '光');
assert.match(records.find(entry => entry.scenario === 'multiline').text, /\n\n/);
assert.ok(records.find(entry => entry.scenario === 'long-text').text.length > 2000);
assert.match(records.find(entry => entry.scenario === 'fatigue-without-improvement').text, /没有好转/);
assert.match(records.find(entry => entry.scenario === 'insufficient-evidence').text, /不能据此推断/);
assert.ok(new Set(records.map(entry => entry.date)).size > 1);
for (const input of inputCases) assert.equal(Boolean(input.text.trim()), input.shouldSave);
assert.equal(inputCases.find(entry => entry.submitted === false).submitted, false);
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: crossDay.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
assert.deepEqual([crossDay.before, crossDay.after].map(value => {
  const parts = formatter.formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}), crossDay.expectedDates);
assert.deepEqual(crossDay.recordIds.map(id => records.find(entry => entry.id === id).date), crossDay.expectedDates);

const fontHref = 'href="https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css"';
const defaultHtml = (await readFile(new URL('../output/seeking-light/index.html', import.meta.url), 'utf8'))
  .replace('../../assets/lucide.min.js', '/assets/lucide.min.js');
assert.equal(defaultHtml.split(fontHref).length - 1, 1, 'Failure mode targets one fixed, known font stylesheet');
for (const args of [['--unknown-test-flag'], ['--font-failure', '--unknown-test-flag'], ['--font-failure', '--font-failure']]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/test-preview.mjs', import.meta.url)), ...args], { encoding: 'utf8', timeout: 2000 });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '', 'Unknown arguments must not start a server');
  assert.match(result.stderr, /未知测试参数/);
}
const staticBodies = new Map();
for (const fontFailure of [false, true]) {
  const server = fontFailure ? createServer({ fontFailure: true }) : createServer();
  function request(path, { method = 'GET', host } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method, setHost: host === undefined,
        headers: host === undefined ? {} : { Host: host } }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
        response.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
  }

  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    assert.equal(server.address().address, '127.0.0.1');
    for (const [path, type] of [['/', 'text/html'], ['/journal.css', 'text/css'], ['/journal.js', 'text/javascript'], ['/flomo-import.js', 'text/javascript'], ['/assets/lucide.min.js', 'text/javascript']]) {
      const result = await request(path);
      assert.equal(result.status, 200, path);
      assert.equal(result.headers['content-type'], `${type}; charset=utf-8`);
      assert.equal(result.headers['x-content-type-options'], 'nosniff');
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.ok(result.body.length > 0);
      if (!fontFailure) staticBodies.set(path, result.body);
      else if (path !== '/') assert.equal(result.body, staticBodies.get(path), 'Font mode must not change JS or CSS');
    }
    const servedHtml = (await request('/')).body;
    assert.match(servedHtml, /src="\/assets\/lucide\.min\.js"/);
    assert.equal(servedHtml, fontFailure ? defaultHtml.replace(fontHref, 'href="/test-font-unavailable.css"') : defaultHtml,
      'Only the fixed font href may differ from default served HTML');
    if (fontFailure) assert.ok(!servedHtml.includes(fontHref));
    else assert.ok(servedHtml.includes(fontHref));
    assert.equal((await request('/?test=1')).status, 200);
    for (const path of ['/test-font-unavailable.css', '/test-font-unavailable.css?retry=1', '/index.html', '/server.mjs', '/journal.js.map', '/README.md', '/.git/config', '/.env', '/tests/web-fixtures.mjs', '/scripts/test-preview.mjs', '/copilot-bridge.mjs', '/api/copilot/status', '/api/copilot/findings', '/assets/../server.mjs', '/%2e%2e/server.mjs', '/../../server.mjs', '/assets/%2e%2e/server.mjs', '/assets/lucide.min.js/extra']) {
      const result = await request(path);
      assert.equal(result.status, 404, path);
      assert.equal(result.body, '');
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      assert.equal((await request('/', { method })).status, 404, method);
    }
    for (const host of ['attacker.example', '127.0.0.1.attacker.example', 'localhost.attacker.example', '0.0.0.0', '[::1]', 'localhost:invalid', '']) {
      assert.equal((await request('/', { host })).status, 403, `Host=${JSON.stringify(host)}`);
    }
    assert.equal((await request('/', { host: `localhost:${server.address().port}` })).status, 200);
    assert.equal((await request('http://[')).status, 404);
    assert.equal((await request('/')).status, 200, 'Malformed URL must not stop the server');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
console.log('Readiness audit passed: normal/font-failure HTML, missing font 404, unchanged static whitelist, methods, Host, source-file exclusion, unknown CLI flags and marked fictional fixtures. No browser, diary storage or Copilot accessed; fallback rendering requires browser verification.');
