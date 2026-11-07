import assert from "node:assert/strict";
import { generateFinding } from "../copilot-bridge.mjs";

if (!process.argv.includes("--live")) {
  console.log("Live Copilot test skipped. Pass --live to use account credits with two fictional records.");
} else {
  const entries = [
    { id: "fictional-a", date: "2026-11-04", area: "work", activity: "虚构连接测试：把一个模糊问题画成流程，投入而愉快。", engagement: 4, feeling: "satisfied", contexts: ["解决问题"] },
    { id: "fictional-b", date: "2026-11-05", area: "life", activity: "虚构连接测试：散步时想清楚一个读书问题，但还不确定感受。", engagement: null, feeling: null, contexts: [] },
  ];
  let raw = "";
  let result;
  try {
    result = await generateFinding({ consent: true, entries }, { onOutput: (output) => { raw = output; } });
  } catch (error) {
    console.error("Fictional-test output only:", raw.slice(0, 10000));
    throw error;
  }
  assert.equal(result.entryCount, 2);
  assert.ok(result.insights.length >= 1);
  console.log(JSON.stringify({ provider: result.provider, model: result.model, entryCount: result.entryCount,
    insightCount: result.insights.length, evidenceValidated: true, summary: result.summary }, null, 2));
}
