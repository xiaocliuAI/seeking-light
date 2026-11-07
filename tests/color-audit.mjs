import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../journal.css", import.meta.url), "utf8");
const tokens = new Map([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{3,6})\s*;/gi)].map(([, name, value]) => [name, value]));
function luminance(hex) {
  const value = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1);
  const [r, g, b] = value.match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
function contrast(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const color = (name) => { assert.ok(tokens.has(name), `Missing token: ${name}`); return tokens.get(name); };
const checks = [
  ["body", "ink", "canvas", 4.5],
  ["note text", "ink", "paper", 4.5],
  ["secondary text", "muted", "paper", 4.5],
  ["secondary canvas text", "muted", "canvas", 4.5],
  ["composer text", "ink", "coral-soft", 4.5],
  ["composer placeholder and status", "muted", "coral-soft", 4.5],
  ["sidebar text", "frame-muted", "frame", 4.5],
  ["brand text", "paper", "frame", 4.5],
  ["green action text", "green", "paper", 4.5],
  ["selected navigation", "green", "green-soft", 4.5],
  ["selected period", "paper", "green", 4.5],
  ["date on canvas", "coral", "canvas", 4.5],
  ["save button", "paper", "coral", 4.5],
  ["input boundary", "control-line", "paper", 3],
  ["composer boundary", "composer-line", "coral-soft", 3],
  ...[0, 1, 2].map((level) => [`calendar level ${level}`, "ink", `heat-${level}`, 4.5]),
  ...[3, 4].map((level) => [`calendar level ${level}`, "paper", `heat-${level}`, 4.5]),
];
for (const [label, foreground, background, minimum] of checks) {
  const ratio = contrast(color(foreground), color(background));
  assert.ok(ratio >= minimum, `${label}: ${ratio.toFixed(2)} is below the project's ${minimum} target`);
}
for (let level = 1; level <= 4; level += 1) {
  assert.ok(luminance(color(`heat-${level}`)) < luminance(color(`heat-${level - 1}`)), "Higher counts must be darker");
}
assert.match(css, /textarea::placeholder\s*\{[^}]*color:\s*var\(--muted\);[^}]*opacity:\s*1/);
assert.match(css, /\.primary-button:disabled\s*\{[^}]*opacity:\s*1/);
assert.ok(contrast("#654958", "#eadde2") >= 4.5, "Disabled save label remains readable");
console.log(`Color audit passed: ${checks.length} foreground/background targets, heatmap ordering, placeholder and disabled-save readability. Text contrast: ${contrast(color("ink"), color("paper")).toFixed(1)}; secondary: ${contrast(color("muted"), color("paper")).toFixed(1)}. Token checks only, not a browser accessibility audit.`);
