import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { records, inputCases } from './web-fixtures.mjs';

const html = fs.readFileSync(new URL('../output/seeking-light/index.html', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../output/seeking-light/journal.js', import.meta.url), 'utf8');
const storageKey = 'seeking-light-layout-prototype-v1';
let idSequence = 0;

// A flat inventory of static controls and small dynamic subtrees, not an HTML/browser engine.
class Element {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.className = this.value = this._text = '';
    this.hidden = this.disabled = this.open = false;
    this.scrollHeight = 112; // Synthetic; no claim about actual layout or font metrics.
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force ?? !names.has(name)) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
      },
    };
    for (const [name, value] of Object.entries(attrs)) this.setAttribute(name, value);
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  set innerHTML(_) { throw new Error('This test does not support user HTML injection'); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    else if (name === 'hidden' || name === 'disabled') this[name] = true;
    else if (name === 'class') this.className = String(value);
    else if (name === 'id') this.id = String(value);
  }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = [...children]; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  fire(name) {
    assert.ok(this.listeners[name]?.length, `No ${name} handler on ${this.id || this.tagName}`);
    for (const listener of this.listeners[name]) listener({ target: this, preventDefault() {} });
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => matches(node, selector));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  scrollIntoView() { this.scrolled = true; }
}

function matches(node, selector) {
  if (selector === '*') return true;
  if (/^#[\w-]+$/.test(selector)) return node.id === selector.slice(1);
  if (/^\.[\w-]+$/.test(selector)) return node.classList.contains(selector.slice(1));
  const attribute = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (attribute) {
    const [, name, value] = attribute;
    const actual = name.startsWith('data-')
      ? node.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]
      : node.attributes[name];
    return actual !== undefined && (value === undefined || actual === value);
  }
  if (/^[a-z]+$/.test(selector)) return node.tagName === selector;
  throw new Error(`Unsupported selector in deliberately small DOM double: ${selector}`);
}

function makeStorage() {
  const values = new Map();
  return {
    failWrite: false,
    getItem(key) { assert.equal(key, storageKey); return values.get(key) ?? null; },
    setItem(key, value) {
      assert.equal(key, storageKey);
      if (this.failWrite) throw new Error('Fictional storage failure');
      values.set(key, value);
    },
    snapshot() { return JSON.parse(values.get(storageKey) || '{"notes":[],"draft":"","feedback":{},"attempts":{}}'); },
    serialized() { return values.get(storageKey); },
  };
}

function boot(storage = makeStorage()) {
  const navStart = html.indexOf('<nav '), navEnd = html.indexOf('</nav>');
  const nodes = [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)].map(match => {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? '']));
    const node = new Element(match[1], attrs);
    node.inNav = match.index > navStart && match.index < navEnd;
    return node;
  });
  const queryAll = selector => selector === 'nav [data-view]'
    ? nodes.filter(node => node.inNav && matches(node, '[data-view]'))
    : nodes.filter(node => matches(node, selector));
  const document = {
    getElementById: id => queryAll(`#${id}`)[0] || null,
    querySelector: selector => queryAll(selector)[0] || null,
    querySelectorAll: queryAll,
    createElement: tag => new Element(tag),
    createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; },
  };
  class TestDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(2026, 10, 7, 22, 0); }
  }
  const math = Object.create(Math);
  math.random = () => ++idSequence / 10000;
  const context = vm.createContext({ document, localStorage: storage, Date: TestDate, Math: math,
    window: { addEventListener() {}, scrollTo() {} },
    fetch() { throw new Error('Network/model calls are forbidden in this regression'); },
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(source, context, { timeout: 2000 });
  const node = selector => { const found = document.querySelector(selector); assert.ok(found, selector); return found; };
  return {
    storage, node,
    click(selector) { node(selector).fire('click'); },
    input(selector, text) { const target = node(selector); target.value = text; target.fire('input'); },
    save(text) { this.input('#capture', text); node('#capture-form').fire('submit'); },
  };
}

const textFor = scenario => records.find(record => record.scenario === scenario).text;
const noteArticle = (app, id) => app.node('#history-stream').querySelector(`[data-note-id="${id}"]`);
const prose = article => article.querySelector('.entry-text').children[0].textContent;
const storage = makeStorage();
let app = boot(storage);
assert.equal(app.node('#save').disabled, true);
assert.equal(app.node('[data-count="today"]').textContent, '3', 'Initial count includes three marked examples');
for (const input of inputCases.filter(input => !input.shouldSave)) {
  app.input('#capture', input.text);
  assert.equal(app.node('#save').disabled, true);
  app.node('#capture-form').fire('submit');
  assert.equal(storage.snapshot().notes.length, 0, 'Blank submit must not insert a record');
}
for (const scenario of ['multiline', 'single-character', 'long-text', 'fatigue-without-improvement', 'insufficient-evidence']) {
  const text = textFor(scenario);
  const before = storage.snapshot().notes.length;
  app.save(text);
  const saved = storage.snapshot();
  assert.equal(saved.notes.length, before + 1);
  assert.equal(saved.notes[0].text, text, 'Whole original input is preserved, including blank lines');
  assert.equal(prose(noteArticle(app, saved.notes[0].id)), text);
  assert.equal(app.node('#capture').value, '');
  assert.match(app.node('#save-status').textContent, /^已记下/);
}
app.node('#capture-form').fire('submit');
assert.equal(storage.snapshot().notes.length, 5, 'Empty resubmit must not duplicate');

const draft = inputCases.find(input => input.submitted === false).text;
app.input('#capture', draft);
assert.equal(storage.snapshot().draft, draft);
assert.equal(storage.snapshot().notes.length, 5, 'Draft does not count as a note');
app = boot(storage);
assert.equal(app.node('#capture').value, draft, 'New VM reload restores persisted draft');
assert.equal(app.node('[data-count="today"]').textContent, '8');
const beforeFailure = storage.serialized();
storage.failWrite = true;
app.node('#capture-form').fire('submit');
assert.equal(app.node('#capture').value, draft);
assert.equal(storage.serialized(), beforeFailure);
assert.match(app.node('#save-status').textContent, /^无法保存/);
const failedDraft = '【虚构测试】存储失败时输入不能消失。';
app.input('#capture', failedDraft);
assert.equal(app.node('#capture').value, failedDraft);
assert.match(app.node('#save-status').textContent, /^无法保存草稿/);
assert.equal(storage.serialized(), beforeFailure);
storage.failWrite = false;
app.node('#capture-form').fire('submit');
assert.equal(storage.snapshot().notes.length, 6, 'Retry creates exactly one record');
assert.equal(storage.snapshot().notes[0].text, failedDraft);

app.click('[data-view="findings"]');
assert.equal(app.node('#finding-result').hidden, true);
app.click('#show-consent');
assert.equal(app.node('#consent-dialog').open, true);
app.click('#cancel-example');
assert.equal(app.node('#finding-result').hidden, true);
app.click('#show-consent');
app.click('#confirm-example');
assert.equal(app.node('#finding-result').hidden, false);

// Reconstruct displayed source prose and navigate via actual registered source handlers.
const evidenceIds = new Set();
for (const finding of ['restore', 'interest']) {
  app.click(`[data-finding="${finding}"]`);
  const articles = [...app.node('#evidence-stream').children];
  assert.equal(articles.length, 3);
  for (const article of articles) {
    evidenceIds.add(article.dataset.noteId);
    const marks = article.querySelectorAll('mark');
    assert.equal(marks.length, 1);
    assert.ok(marks[0].textContent.length > 0);
    const original = prose(article);
    assert.ok(original.includes(marks[0].textContent));
    article.querySelector('.source-link').fire('click');
    const full = noteArticle(app, article.dataset.noteId);
    assert.ok(full.scrolled);
    assert.equal(prose(full), original, 'Highlight assembly must equal complete unmodified source');
    assert.match(full.textContent, /示例/);
    assert.equal(full.querySelectorAll('mark').length, 0, 'Full source must not substitute highlighted text');
    assert.equal(app.node('[data-panel="history"]').hidden, false);
    app.click('#back-to-finding');
    assert.equal(app.node('[data-panel="findings"]').hidden, false);
  }
}
assert.equal(evidenceIds.size, 6);
assert.equal(storage.snapshot().notes.length, 6, 'Viewing examples never analyzes/inserts user notes');

app.click('[data-finding="restore"]');
app.click('[data-feedback="no"]');
app.click('#keep-attempt');
app.click('[data-finding="interest"]');
assert.equal(app.node('[data-feedback="no"]').attributes['aria-pressed'], 'false');
assert.equal(app.node('#reflect-attempt').hidden, true);
app.click('[data-feedback="yes"]');
app.click('#defer-attempt');
const beforeMetadataFailure = storage.serialized();
storage.failWrite = true;
app.click('[data-feedback="no"]');
assert.match(app.node('#feedback-status').textContent, /未保存/);
app.click('#keep-attempt');
assert.match(app.node('#attempt-status').textContent, /未保存/);
assert.equal(storage.serialized(), beforeMetadataFailure);
storage.failWrite = false;
app = boot(storage);
app.click('[data-finding="restore"]');
assert.equal(app.node('[data-feedback="no"]').attributes['aria-pressed'], 'true');
assert.equal(app.node('#keep-attempt').attributes['aria-pressed'], 'true');
assert.equal(app.node('#reflect-attempt').hidden, false);
app.click('[data-finding="interest"]');
assert.equal(app.node('[data-feedback="yes"]').attributes['aria-pressed'], 'true');
assert.equal(app.node('#keep-attempt').attributes['aria-pressed'], 'false');
assert.equal(app.node('#reflect-attempt').hidden, true);
assert.deepEqual(storage.snapshot().feedback, { restore: 'no', interest: 'yes' });
assert.deepEqual(storage.snapshot().attempts, { restore: { state: 'keep' }, interest: { state: 'later' } });

app.click('[data-finding="restore"]');
app.click('#reflect-attempt');
assert.equal(app.node('#reflection-dialog').open, true);
app.input('#reflection', ' \n ');
assert.equal(app.node('#save-reflection').disabled, true);
app.node('#reflection-form').fire('submit');
assert.equal(storage.snapshot().notes.length, 6);
const reflection = '【虚构测试回访】坐了一会儿。\n还是疲惫，没有变化。<script>仅为原文</script>';
app.input('#reflection', reflection);
const beforeReflectionFailure = storage.serialized();
storage.failWrite = true;
app.node('#reflection-form').fire('submit');
assert.equal(app.node('#reflection').value, reflection);
assert.equal(app.node('#reflection-dialog').open, true);
assert.match(app.node('#reflection-status').textContent, /没有保存成功/);
assert.equal(storage.serialized(), beforeReflectionFailure);
storage.failWrite = false;
app.node('#reflection-form').fire('submit');
const result = storage.snapshot().notes[0];
assert.equal(result.text, reflection);
assert.equal(result.attempt, 'restore');
assert.equal(storage.snapshot().attempts.restore.resultId, result.id);
assert.equal(storage.snapshot().notes.length, 7);
assert.equal(new Set(storage.snapshot().notes.map(note => note.id)).size, 7);
assert.equal(app.node('#reflection-dialog').open, false);
assert.equal(app.node('#reflection').value, '');
assert.equal(prose(noteArticle(app, result.id)), reflection, 'Reflection returns to timeline without interpreting or injecting HTML');
assert.equal(noteArticle(app, result.id).querySelectorAll('script').length, 0);
assert.match(app.node('#attempt-result').textContent, /还是疲惫，没有变化/);
app = boot(storage);
assert.equal(prose(noteArticle(app, result.id)), reflection);
assert.equal(app.node('#attempt-result').hidden, false);
assert.equal(app.node('#attempt-result').textContent, `你后来记下了：\n${reflection}`);
assert.equal(app.node('[data-count="today"]').textContent, '10');
app.click('[data-finding="interest"]');
assert.equal(app.node('#attempt-result').hidden, true, 'One finding must not display another finding reflection');
assert.equal(storage.snapshot().feedback.restore, 'no', 'Reflection does not rewrite independent feedback');

console.log('Prototype regression passed: whole-note/blank capture, draft reload, storage failure/retry, six exact source references, independent feedback/attempt reload and reflection timeline. DOM double only, not a browser test; no real storage, network or model accessed.');
