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
  constructor(tag = 'div', attrs = {}, effects = []) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.effects = effects;
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
    const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const listener of this.listeners[name]) listener(event);
    return event;
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => matches(node, selector));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  // Record explicit application calls; do not invent native focus/Tab/Esc behavior.
  focus() { this.effects.push({ method: 'focus', id: this.id }); }
  showModal() { this.effects.push({ method: 'showModal', id: this.id }); this.open = true; }
  close() { this.effects.push({ method: 'close', id: this.id }); this.open = false; }
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
  const effects = [];
  const windowListeners = new Map();
  const navStart = html.indexOf('<nav '), navEnd = html.indexOf('</nav>');
  const nodes = [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)].map(match => {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? '']));
    const node = new Element(match[1], attrs, effects);
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
    createElement: tag => new Element(tag, {}, effects),
    createTextNode: text => { const node = new Element('#text', {}, effects); node.textContent = text; return node; },
  };
  class TestDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(2026, 10, 7, 22, 0); }
  }
  const math = Object.create(Math);
  math.random = () => ++idSequence / 10000;
  const context = vm.createContext({ document, localStorage: storage, Date: TestDate, Math: math,
    window: {
      addEventListener(type, listener) { const callbacks = windowListeners.get(type) || []; callbacks.push(listener); windowListeners.set(type, callbacks); },
      scrollTo() {},
    },
    fetch() { throw new Error('Network/model calls are forbidden in this regression'); },
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(source, context, { timeout: 2000 });
  const node = selector => { const found = document.querySelector(selector); assert.ok(found, selector); return found; };
  return {
    storage, node, effects,
    resize() {
      assert.ok(windowListeners.get('resize')?.length, 'Application must register its resize handler');
      windowListeners.get('resize').forEach(listener => listener());
    },
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

// Separate fixture: test application callbacks, not keyboard activation or native focus trapping.
const focusApp = boot();
const focusDraft = '【虚构焦点测试】切换专注与回看时，这句草稿仍在。';
focusApp.input('#capture', focusDraft);
const beforeFocus = focusApp.storage.serialized();
focusApp.effects.length = 0;
focusApp.click('#focus');
assert.deepEqual(focusApp.effects, [{ method: 'focus', id: 'capture' }]);
assert.equal(focusApp.node('#journal').classList.contains('is-focus'), true);
assert.equal(focusApp.node('#focus').attributes['aria-pressed'], 'true');
assert.equal(focusApp.node('#focus').attributes['aria-label'], '退出专注书写');
assert.equal(focusApp.node('#capture').style.height, '360px', 'Synthetic height exercises focused minimum, not real layout');
focusApp.node('#capture').scrollHeight = 245;
focusApp.resize();
assert.equal(focusApp.node('#capture').style.height, '360px');
focusApp.effects.length = 0;
focusApp.click('#focus');
assert.deepEqual(focusApp.effects, [{ method: 'focus', id: 'capture' }]);
assert.equal(focusApp.node('#journal').classList.contains('is-focus'), false);
assert.equal(focusApp.node('#focus').attributes['aria-pressed'], 'false');
assert.equal(focusApp.node('#focus').attributes['aria-label'], '专注书写');
assert.equal(focusApp.node('#capture').style.height, '245px');
focusApp.click('#focus');
focusApp.click('[data-view="history"]');
assert.equal(focusApp.node('#journal').classList.contains('is-focus'), false, 'Navigation exits focused mode');
assert.equal(focusApp.node('#focus').attributes['aria-pressed'], 'false');
focusApp.click('.brand');
assert.equal(focusApp.node('[data-panel="notes"]').hidden, false);
assert.equal(focusApp.node('#capture').value, focusDraft);
assert.equal(focusApp.storage.serialized(), beforeFocus, 'Focus/navigation never writes or discards the draft');

focusApp.click('[data-view="findings"]');
focusApp.effects.length = 0;
focusApp.click('#show-consent');
assert.deepEqual(focusApp.effects, [{ method: 'showModal', id: 'consent-dialog' }]);
focusApp.click('#cancel-example');
assert.equal(focusApp.node('#consent-dialog').open, false);
assert.equal(focusApp.node('#finding-result').hidden, true, 'Cancel never confirms the example');
assert.deepEqual(focusApp.effects.at(-1), { method: 'close', id: 'consent-dialog' });
assert.equal(focusApp.storage.serialized(), beforeFocus);
focusApp.click('#show-consent');
focusApp.click('#confirm-example');
assert.equal(focusApp.node('#consent-dialog').open, false);
assert.equal(focusApp.node('#finding-result').hidden, false);
focusApp.click('#keep-attempt');
focusApp.effects.length = 0;
focusApp.click('#reflect-attempt');
assert.deepEqual(focusApp.effects, [
  { method: 'showModal', id: 'reflection-dialog' },
  { method: 'focus', id: 'reflection' },
], 'Application explicitly focuses the reflection input after opening');
const pendingReflection = '【虚构弹窗测试】暂时不提交的回访。';
focusApp.input('#reflection', pendingReflection);
const beforeCancel = focusApp.storage.serialized();
focusApp.click('#cancel-reflection');
assert.equal(focusApp.node('#reflection-dialog').open, false);
assert.deepEqual(focusApp.effects.at(-1), { method: 'close', id: 'reflection-dialog' });
assert.equal(focusApp.storage.serialized(), beforeCancel, 'Cancel is not submit');
focusApp.click('#reflect-attempt');
assert.equal(focusApp.node('#reflection').value, pendingReflection, 'Same-page cancellation retains unsent input');
focusApp.effects.length = 0;
focusApp.storage.failWrite = true;
const failedSubmit = focusApp.node('#reflection-form').fire('submit');
assert.equal(failedSubmit.defaultPrevented, true, 'Application prevents native form navigation even when storage fails');
assert.equal(focusApp.node('#reflection-dialog').open, true);
assert.equal(focusApp.node('#reflection').value, pendingReflection);
assert.deepEqual(focusApp.effects, [], 'Failed save must not close the modal or move focus explicitly');
assert.match(focusApp.node('#reflection-status').textContent, /没有保存成功/);
assert.equal(focusApp.storage.serialized(), beforeCancel);
focusApp.storage.failWrite = false;
focusApp.click('#cancel-reflection');
focusApp.click('#reflect-attempt');
assert.equal(focusApp.node('#reflection-status').textContent, '', 'Reopening clears stale failure status');
focusApp.effects.length = 0;
const submitted = focusApp.node('#reflection-form').fire('submit');
assert.equal(submitted.defaultPrevented, true);
assert.deepEqual(focusApp.effects, [{ method: 'close', id: 'reflection-dialog' }]);
assert.equal(focusApp.node('#reflection-dialog').open, false);
assert.equal(focusApp.storage.snapshot().notes[0].text, pendingReflection);
assert.equal(focusApp.storage.snapshot().notes[0].attempt, 'restore');

// Two unsent drafts must survive cancel/reopen without migrating into the other finding.
const draftStorage = makeStorage();
const existingRecord = { id: 'test-existing-reflection', date: '2026-11-06', time: '12:00', text: '【虚构已提交记录】保留原文。', attempt: 'restore' };
draftStorage.setItem(storageKey, JSON.stringify({ notes: [existingRecord], draft: '', feedback: { restore: 'no' },
  attempts: { restore: { state: 'keep', resultId: existingRecord.id }, interest: { state: 'keep' } } }));
const draftApp = boot(draftStorage);
draftApp.click('[data-view="findings"]');
draftApp.click('#show-consent');
draftApp.click('#confirm-example');
const restoreDraft = '【虚构恢复草稿】坐了一会儿。\n依然疲惫。';
const interestDraft = '【虚构兴趣草稿】画了两笔。\n暂时没有想继续。';
const beforeDrafts = draftStorage.serialized();
draftApp.click('#reflect-attempt');
draftApp.input('#reflection', restoreDraft);
draftApp.click('#cancel-reflection');
draftApp.click('[data-finding="interest"]');
draftApp.click('#reflect-attempt');
assert.equal(draftApp.node('#reflection').value, '', 'First interest reflection must not contain restore draft');
assert.equal(draftApp.node('#save-reflection').disabled, true, 'Switching to blank draft disables submit immediately');
draftApp.input('#reflection', interestDraft);
draftApp.click('#cancel-reflection');
draftApp.click('[data-finding="restore"]');
draftApp.click('#reflect-attempt');
assert.equal(draftApp.node('#reflection').value, restoreDraft);
assert.equal(draftApp.node('#save-reflection').disabled, false);
assert.equal(draftStorage.serialized(), beforeDrafts, 'Unsubmitted drafts do not change persisted schema or existing data');
draftStorage.failWrite = true;
draftApp.node('#reflection-form').fire('submit');
assert.equal(draftApp.node('#reflection-dialog').open, true);
assert.equal(draftApp.node('#reflection').value, restoreDraft);
assert.match(draftApp.node('#reflection-status').textContent, /没有保存成功/);
assert.equal(draftStorage.serialized(), beforeDrafts);
draftApp.click('#cancel-reflection');
draftApp.click('[data-finding="interest"]');
draftApp.click('#reflect-attempt');
assert.equal(draftApp.node('#reflection').value, interestDraft, 'Failed restore save cannot contaminate interest draft');
draftStorage.failWrite = false;
draftApp.node('#reflection-form').fire('submit');
const interestResult = draftStorage.snapshot().notes[0];
assert.equal(interestResult.text, interestDraft);
assert.equal(interestResult.attempt, 'interest');
assert.equal(draftStorage.snapshot().attempts.interest.resultId, interestResult.id);
assert.equal(draftStorage.snapshot().attempts.restore.resultId, existingRecord.id);
draftApp.click('#reflect-attempt');
assert.equal(draftApp.node('#reflection').value, '', 'Successful save clears only its own draft');
assert.equal(draftApp.node('#save-reflection').disabled, true);
draftApp.click('#cancel-reflection');
draftApp.click('[data-finding="restore"]');
draftApp.click('#reflect-attempt');
assert.equal(draftApp.node('#reflection').value, restoreDraft, 'Interest success must not clear failed restore draft');
draftApp.node('#reflection-form').fire('submit');
const restoreResult = draftStorage.snapshot().notes[0];
assert.equal(restoreResult.text, restoreDraft);
assert.equal(restoreResult.attempt, 'restore');
assert.equal(draftStorage.snapshot().attempts.restore.resultId, restoreResult.id);
assert.equal(draftStorage.snapshot().attempts.interest.resultId, interestResult.id);
assert.deepEqual(draftStorage.snapshot().notes.find(note => note.id === existingRecord.id), existingRecord);
assert.deepEqual(draftStorage.snapshot().feedback, { restore: 'no' });
assert.deepEqual(Object.keys(draftStorage.snapshot()).sort(), ['attempts', 'draft', 'feedback', 'notes']);
draftApp.click('#reflect-attempt');
assert.equal(draftApp.node('#reflection').value, '');
assert.equal(draftApp.node('#save-reflection').disabled, true);

console.log('Prototype regression passed: capture/storage/evidence/feedback/reflection, isolated per-finding reflection drafts, cancel/reopen/failure/success cleanup and explicit focus/modal callbacks. DOM double only: no native keyboard activation, Tab/Esc, focus trapping/restoration or browser layout tested; no real storage, network or model accessed.');
