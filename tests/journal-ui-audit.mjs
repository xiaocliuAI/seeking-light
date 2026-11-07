import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// A deliberately small DOM double tests behavior, not browser layout or rendering.
class Element {
  constructor(tag = "div", attrs = {}) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.style = { setProperty() {} };
    this.value = "";
    this.textContent = "";
    this.className = "";
    this.hidden = this.checked = this.disabled = this.open = false;
    this.classList = {
      contains: (name) => this.className.split(" ").includes(name),
      add: (name) => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
      remove: (name) => { this.className = this.className.split(" ").filter((part) => part !== name).join(" "); },
      toggle: (name, force = !this.classList.contains(name)) => { this.classList[force ? "add" : "remove"](name); },
    };
    Object.entries(attrs).forEach(([name, value]) => this.setAttribute(name, value));
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    else if (["hidden", "disabled", "checked"].includes(name)) this[name] = true;
    else if (name === "class") this.className = value;
    else this[name] = value;
  }
  append(...children) { children.forEach((child) => { child.parent = this; this.children.push(child); }); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  fire(name, event = {}) { for (const listener of this.listeners[name] || []) listener({ target: this, preventDefault() {}, ...event }); }
  contains(child) { return child === this || this.children.some((node) => node.contains(child)); }
  closest(selector) { return matches(this, selector) ? this : this.parent?.closest(selector) || null; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  reset() { controls.forEach((control) => { control.checked = false; }); }
}
function matches(node, selector) {
  const tag = selector.match(/^[a-z]+/);
  if (tag && node.tagName !== tag[0]) return false;
  if (selector.includes(":checked") && !node.checked) return false;
  for (const [, name] of selector.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(name)) return false;
  for (const [, name, value] of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
    const actual = name.startsWith("data-") ? node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : node[name];
    if (actual === undefined || actual === false || (value !== undefined && String(actual) !== value)) return false;
  }
  return true;
}
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const nodes = [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)].map(([, tag, attributes]) => new Element(tag,
  Object.fromEntries([...attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? ""]))));
const ids = new Map(nodes.filter((node) => node.id).map((node) => [node.id, node]));
const controls = nodes.filter((node) => node.tagName === "input");
const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);
function queryAll(selector) {
  if (selector === "#entryDialog details") return nodes.filter((node) => node.classList.contains("reflection-details"));
  if (selector === "#findingsView .eyebrow") return [nodes.find((node) => node.classList.contains("eyebrow"))];
  const scoped = selector.match(/^#([\w-]+) (.+)$/);
  if (scoped) return descendants(ids.get(scoped[1])).filter((node) => matches(node, scoped[2]));
  if (/^#[\w-]+$/.test(selector)) return ids.has(selector.slice(1)) ? [ids.get(selector.slice(1))] : [];
  return nodes.filter((node) => matches(node, selector));
}
const document = new Element("document");
document.body = new Element("body");
document.querySelector = (selector) => queryAll(selector)[0] || null;
document.querySelectorAll = queryAll;
document.createElement = (tag) => new Element(tag);
let failStorage = false;
let persisted = "";
let timerId = 0;
const intervals = [];
const window = { setTimeout: () => ++timerId, clearTimeout() {}, setInterval: (fn) => intervals.push(fn),
  addEventListener() {}, scrollTo() {}, confirm: () => true };
const context = vm.createContext({ console, Date, Intl, JSON, Set, Map, AbortController, document, window,
  localStorage: { getItem: () => null, setItem: (key, value) => { assert.equal(key, "seeking-light-journal-v5"); if (failStorage) throw Error("storage unavailable"); persisted = value; } },
});
const run = (code) => vm.runInContext(code, context);
const json = (code) => JSON.parse(run(`JSON.stringify(${code})`));
const node = (id) => ids.get(id);
const input = node("freewriteInput");
function capture(text) { input.value = text; input.fire("input"); run("captureFreewrite()"); }
run(source);
assert.equal(node("captureMomentsButton").disabled, true, "blank composer starts disabled");
assert.equal(node("footprintToday").textContent, "0");
assert.equal(input.style.height, "96px", "empty composer is a compact note, not a full page");
input.scrollHeight = 180;
run("resizeComposer()");
assert.equal(input.style.height, "180px", "composer grows with content");
input.scrollHeight = 430;
run("resizeComposer()");
assert.equal(input.style.height, "280px", "long content has a bounded inline editor");
assert.equal(input.style.overflowY, "auto");
run("toggleComposerFocus(true)");
assert.equal(input.style.height, "auto", "focus view is not constrained by inline note height");
delete input.scrollHeight;
run("toggleComposerFocus(false)");
assert.equal(input.style.height, "96px");
assert.equal(node("footprintPeriodCount").hidden, true, "current-year count is not duplicated");

capture("今天做了设计。很累，但是也很开心。\n晚饭后散步。");
assert.equal(run("savedEntries().length"), 1, "multiline prose is one note");
assert.equal(json("savedEntries()[0]").activity, "今天做了设计。很累，但是也很开心。\n晚饭后散步。");
assert.equal(json("savedEntries()[0]").engagement, null);
assert.equal(json("savedEntries()[0]").feeling, null);
assert.equal(node("footprintToday").textContent, "1");
assert.equal(input.value, "");
capture("光");
assert.equal(run("savedEntries().length"), 2, "single character is accepted");
run("captureFreewrite()");
assert.equal(run("savedEntries().length"), 2, "double submit on empty input does not duplicate");
assert.equal(JSON.parse(persisted).freewriteDraft, "");

input.value = "尚未提交的草稿";
input.fire("input");
assert.equal(run("savedEntries().length"), 2, "composer draft never counts");
const beforeFailure = run("JSON.stringify(state.days)");
failStorage = true;
run("captureFreewrite()");
assert.equal(input.value, "尚未提交的草稿", "failed save keeps original input");
assert.equal(run("JSON.stringify(state.days)"), beforeFailure, "failed save rolls back record insertion");
assert.match(node("saveStatus").textContent, /无法保存/);
failStorage = false;
run("captureFreewrite()");
assert.equal(run("savedEntries().length"), 3, "retry creates one note");

run(`state.days[localDateKey(offsetDate(-1))] = { entries: [
  {id:'old', area:'life', activity:'昨天的原文', engagement:3, feeling:'neutral', draft:true, createdAt:1},
  {id:'demo', area:'work', activity:'示例', engagement:5, feeling:'energized', demo:true, createdAt:2}
] };
state.days[localDateKey(offsetDate(1))] = {entries:[{id:'future',activity:'未来',createdAt:3}]}; renderAll();`);
assert.equal(run("savedEntries().length"), 4, "saved legacy unreflected note counts; demo and future do not");
assert.equal(run("getAllEntries().length"), 6, "old data is not removed");
run("openEntryDialog('life','old')");
assert.equal(node("activityInput").value, "昨天的原文");
assert.equal(controls.filter((node) => ["engagement", "feeling"].includes(node.name) && node.checked).length, 0, "legacy default scores are not confirmed");
node("activityInput").value = "昨天的修改\n保留换行";
run("submitEntry({preventDefault(){}})");
assert.equal(run("findEntry('old').date"), run("localDateKey(offsetDate(-1))"), "editing keeps original date");
assert.equal(json("findEntry('old')").engagement, null);
assert.equal(run("savedEntries().length"), 4, "editing never increments count");

run("openEntryDialog('life','old')");
const engagement4 = controls.find((node) => node.name === "engagement" && node.value === "4");
engagement4.checked = true;
run("submitEntry({preventDefault(){}}); openEntryDialog('life','old')");
assert.equal(engagement4.checked, true, "optional partial reflection survives reopening");
assert.equal(json("copilotPayloadEntry(findEntry('old'))").feeling, null);
node("activityInput").value = "不应在失败时覆盖原文";
failStorage = true;
run("submitEntry({preventDefault(){}})");
assert.equal(run("findEntry('old').activity"), "昨天的修改\n保留换行");
assert.equal(node("entryDialog").open, true);
run("deleteEntry('old')");
assert.ok(run("findEntry('old')"), "failed delete is rolled back");
failStorage = false;
run("deleteEntry('old')");
assert.equal(run("findEntry('old')"), undefined, "can delete an older note");

input.value = "跨日草稿";
input.fire("input");
run("state.freewriteDraftDate=localDateKey(offsetDate(-1)); renderedDate='2000-01-01'");
intervals[0]();
assert.equal(input.value, "跨日草稿");
assert.match(node("saveStatus").textContent, /草稿已保留/);
run("captureFreewrite()");
assert.equal(run("savedEntries().find(e=>e.activity==='跨日草稿').date"), run("localDateKey(offsetDate(-1))"));

assert.deepEqual(json("[0,1,2,3,4,6,7,30].map(heatLevel)"), [0,1,2,2,3,3,4,4]);
for (const [year, expectedDays] of [[2024,366],[2025,365],[2026,365],[2028,366],[2032,366]]) {
  assert.equal(run(`yearDates(${year}).dates.filter(d=>d.getFullYear()===${year}).length`), expectedDays);
  assert.equal(run(`yearDates(${year}).dates[0].getDay()`), 1, "annual grid starts Monday");
}
run("footprintPeriod='month'; renderFootprint()");
assert.equal(node("footprintPeriodCount").hidden, false, "selected month retains its contextual count");
assert.equal(node("annualFootprint").hidden, true);
assert.equal(node("monthlyFootprint").hidden, false);
assert.ok(node("footprintMonthGrid").children.some((node) => node.disabled), "future dates are disabled");
node("streamDate").value = run("localDateKey(offsetDate(-1))");
node("streamDate").fire("change");
assert.equal(node("momentStream").children.length, 2, "day filter includes one real note and marked demo");
node("clearStreamDate").fire("click");
assert.equal(run("streamDate"), "");

run(`for(let i=0;i<30;i++) getDay().entries.push({id:'extra-'+i, activity:'原文 '+i, createdAt:i, draft:true}); renderToday()`);
assert.equal(node("momentStream").children.length, 20);
assert.equal(node("loadMoreNotes").hidden, false);
node("loadMoreNotes").fire("click");
assert.equal(node("momentStream").children.length, 35);
assert.equal(node("loadMoreNotes").hidden, true);
run("copilotFinding={entries:[copilotPayloadEntry(savedEntries()[0])],insights:[{title:'有依据的线索'}]}; renderHomeFinding()");
assert.equal(node("homeFinding").hidden, false);
run("getDay().entries[0].activity+='修改'; renderHomeFinding()");
assert.equal(node("homeFinding").hidden, true, "changed evidence hides stale homepage findings");
run("switchView('history'); switchView('findings'); toggleComposerFocus(); toggleComposerFocus(false)");
assert.equal(document.body.classList.contains("composer-focus"), false);
assert.equal(node("focusComposerButton").attributes["aria-pressed"], "false");
assert.doesNotMatch(source.slice(source.indexOf("function captureFreewrite"), source.indexOf("function toggleComposerFocus")), /fetch\(|requestCopilot|analyze\(/, "saving never triggers analysis");
console.log("Journal behavior audit passed: initialization, bounded auto-growing composer and focus, whole-note capture, legacy data, counts, storage rollback, older-date edit/delete, partial reflection, midnight drafts, leap years, filtering, pagination and stale findings. DOM double only; no browser layout verification.");
