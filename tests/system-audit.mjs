import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "journal.css"), "utf8");

const requiredIds = [
  "todayView", "findingsView", "historyView", "footprintGrid", "footprintMonthGrid",
  "entryDialog", "entryForm", "energyCompass", "calendarGrid", "reminderDialog",
  "freewriteInput", "captureMomentsButton", "momentStream", "focusComposerButton",
];

for (const id of requiredIds) assert.match(html, new RegExp(`id="${id}"`));
assert.match(html, /个人工作/);
assert.match(html, /生活/);
assert.match(html, /投入度怎么样/);
assert.match(html, /感受如何/);
const homepage = html.slice(html.indexOf('id="todayView"'), html.indexOf('id="findingsView"'));
assert.doesNotMatch(homepage, /投入度|感受如何|光值|连续打卡|workEntries|lifeEntries/);
assert.match(html, /lxgw-wenkai-webfont@1\.7\.0/);
assert.match(html, /journal\.css/);
assert.match(script, /localStorage\.setItem/);
assert.match(script, /Notification\.requestPermission/);
assert.match(script, /buildExperiment/);
assert.match(script, /renderCalendar/);
assert.doesNotMatch(script, /splitFreewrite|renderDaylight|calculateStreak/);
assert.match(script, /inferArea/);
assert.match(script, /freewriteDraft/);
assert.match(script, /textContent/);
assert.doesNotMatch(script, /innerHTML\s*=/);
assert.match(css, /@media \(max-width: 820px\)/);
assert.match(css, /\.mobile-nav/);
assert.match(css, /\.freewrite-canvas/);
assert.match(css, /body\.composer-focus/);
assert.match(css, /prefers-reduced-motion/);
assert.ok(fs.existsSync(path.join(root, "assets/lucide.min.js")));
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML IDs must be unique");
for (const [, id] of script.matchAll(/\$\("#([\w-]+)(?:[\s".])/g)) {
  assert.ok(ids.includes(id), `Missing referenced DOM ID: ${id}`);
}

console.log("System audit: journal fields, findings, reminder, history, text safety and responsive structure passed.");
