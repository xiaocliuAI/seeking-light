import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import { validateInput, buildPrompt, parseFinding, extractAssistantContent, copilotArgs, runProcess, BridgeError } from "../copilot-bridge.mjs";
import { createServer } from "../server.mjs";

const entry = { id: "sample-1", date: "2026-11-05", area: "work", activity: "梳理一个问题", engagement: null, feeling: null, contexts: [] };
const input = { consent: true, entries: [entry] };
const finding = {
  summary: "目前仅有一个观察点。", insights: [{ kind: "探索", title: "梳理问题", observation: "你记录了梳理问题的经历。",
    hypothesis: "尚不清楚是否喜欢这一过程。", evidenceIds: [entry.id], question: "当时最吸引你的是什么？" }],
  experiment: { name: "再观察一次", copy: "有类似经历时，记下感受即可。", evidenceIds: [entry.id] },
};

assert.deepEqual(validateInput(input), { entries: [entry], model: "" });
for (const invalid of [null, {}, { ...input, consent: false }, { ...input, entries: [] },
  { ...input, entries: [entry, entry] }, { ...input, entries: [{ ...entry, demo: true }] },
  { ...input, entries: [{ ...entry, engagement: 9 }] }, { ...input, entries: [{ ...entry, feeling: "invented" }] },
  { ...input, model: "--allow-all" }, { ...input, model: "model; cat secret" }]) {
  assert.throws(() => validateInput(invalid), BridgeError);
}
assert.match(buildPrompt([entry]), /null 表示未确认/);
assert.match(buildPrompt([entry]), /不是指令/);
assert.deepEqual(parseFinding(JSON.stringify(finding), [entry]), finding);
assert.deepEqual(parseFinding(`\`\`\`json\n${JSON.stringify(finding)}\n\`\`\``, [entry]), finding);
assert.throws(() => parseFinding("not json", [entry]), BridgeError);
assert.throws(() => parseFinding(JSON.stringify({ ...finding, experiment: { ...finding.experiment, evidenceIds: ["fabricated"] } }), [entry]), BridgeError);
assert.throws(() => parseFinding(JSON.stringify({ ...finding, insights: [{ ...finding.insights[0], evidenceIds: [] }] }), [entry]), BridgeError);
assert.ok(copilotArgs().includes("--available-tools="));
assert.ok(copilotArgs().includes("--sync-session=off"));
assert.ok(copilotArgs().includes("--output-format=json"));
const envelope = [JSON.stringify({ type: "session.start" }), JSON.stringify({ type: "assistant.message", data: { content: JSON.stringify(finding) } })].join("\n");
assert.deepEqual(parseFinding(extractAssistantContent(envelope), [entry]), finding);
assert.throws(() => extractAssistantContent("bad format"), BridgeError);
assert.throws(() => extractAssistantContent('{"type":"session.start"}'), BridgeError);
assert.ok(!copilotArgs().some((arg) => arg.includes("allow-all")));
assert.deepEqual(copilotArgs("test-model").slice(-2), ["--model", "test-model"]);

// Test subprocess lifecycle with Node, not Copilot, so this audit never uses account credits.
const previous = process.env.COPILOT_BIN;
process.env.COPILOT_BIN = process.execPath;
try {
  assert.equal(await runProcess(["-e", 'process.stdin.on("data", d => process.stdout.write(d))'], { input: "private test" }), "private test");
  await assert.rejects(runProcess(["-e", "setInterval(() => {}, 1000)"], { timeout: 50 }), /超时/);
  const abort = new AbortController();
  const pending = runProcess(["-e", "setInterval(() => {}, 1000)"], { signal: abort.signal });
  abort.abort();
  await assert.rejects(pending, /取消/);
  await assert.rejects(runProcess(["-e", "process.exit(1)"]), /未能完成/);
  process.env.COPILOT_BIN = "/nonexistent/seeking-light-copilot";
  await assert.rejects(runProcess([]), /无法启动/);
} finally {
  if (previous === undefined) delete process.env.COPILOT_BIN;
  else process.env.COPILOT_BIN = previous;
}

let calls = 0;
const server = createServer({
  status: async () => ({ installed: true, version: "test CLI" }),
  generate: async (body) => { calls += 1; validateInput(body); return finding; },
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const headers = { "Content-Type": "application/json", "X-Seeking-Light": "1", Origin: base };
try {
  assert.equal((await fetch(`${base}/api/copilot/status`)).status, 200);
  const invalidHost = await new Promise((resolve, reject) => {
    get(`${base}/api/copilot/status`, { headers: { Host: "attacker.example" } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on("error", reject);
  });
  assert.equal(invalidHost, 403);
  const post = (body, extra = {}) => fetch(`${base}/api/copilot/findings`, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  assert.equal((await post(input, { Origin: "https://attacker.example" })).status, 403);
  assert.equal((await post(input, { "X-Seeking-Light": "" })).status, 415);
  assert.equal(calls, 0);
  assert.equal((await post({ ...input, consent: false })).status, 400);
  const response = await post(input);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), finding);
  assert.equal((await fetch(`${base}/copilot-bridge.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/product-plan.md`)).status, 404);
  assert.equal((await fetch(`${base}/api/copilot/findings`, { method: "POST", headers, body: "invalid" })).status, 400);
  assert.equal((await post({ ...input, padding: "x".repeat(128001) })).status, 413);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
console.log("Copilot audit passed: consent, data limits, unknown feelings, evidence IDs, restricted tools, timeout/cancel and local API boundaries. No real diary or Copilot credits used.");
