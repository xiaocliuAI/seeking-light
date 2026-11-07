import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const nodes = new Map();
function node(selector) {
  if (!nodes.has(selector)) nodes.set(selector, { textContent: "", value: "", hidden: false, disabled: false });
  return nodes.get(selector);
}
const context = vm.createContext({ console, Date, Intl, JSON, Set, Map, AbortController,
  localStorage: { getItem: () => null }, window: {},
  document: { querySelector: node, querySelectorAll: () => [] },
});
vm.runInContext(source.replace("\ninitialize();\n", "\n"), context);
vm.runInContext(`
  state.days = {
    [localDateKey()]: { entries: [
      { id: "own", area: "work", activity: "personal note", engagement: 4, feeling: "calm", contexts: [], createdAt: 1 },
      { id: "draft", area: "life", activity: "unknown feeling", engagement: 3, feeling: "neutral", draft: true, createdAt: 2 },
      { id: "demo", area: "work", activity: "example", engagement: 5, feeling: "energized", demo: true, createdAt: 3 }
    ] },
    [localDateKey(offsetDate(1))]: { entries: [{ id: "future", createdAt: 4 }] },
    [localDateKey(offsetDate(-10))]: { entries: [{ id: "old", createdAt: 5 }] }
  };
`, context);
assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(copilotEntries().map(e => e.id))", context)), ["draft", "own"]);
const draft = JSON.parse(vm.runInContext("JSON.stringify(copilotPayloadEntry(copilotEntries()[0]))", context));
assert.equal(draft.engagement, null);
assert.equal(draft.feeling, null);
assert.equal(draft.demo, undefined);
assert.equal(draft.createdAt, undefined);
assert.equal(vm.runInContext('activePeriod="all"; copilotEntries().length', context), 3);
vm.runInContext("renderCopilotAvailability()", context);
assert.equal(node("#generateCopilotButton").disabled, false);
vm.runInContext("state.days={}; renderCopilotAvailability()", context);
assert.equal(node("#generateCopilotButton").disabled, true);
assert.match(node("#copilotMessage").textContent, /不会发送/);
for (const id of ["copilotConsentDialog", "copilotConsentCheck", "copilotPreview", "copilotResult", "generateCopilotButton", "cancelCopilotButton"]) {
  assert.ok(html.includes(`id="${id}"`));
}
assert.doesNotMatch(source, /innerHTML\s*=/);
assert.match(source, /consent: true/);
assert.match(source, /response\.ok/);
console.log("Copilot UI data audit passed: real-only scope, future exclusion, unknown feelings, allowlisted fields and empty-state controls.");
