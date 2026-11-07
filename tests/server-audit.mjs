import assert from "node:assert/strict";
import { safePath } from "../server.mjs";

assert.equal(safePath(new URL("http://127.0.0.1/")), "/index.html");
assert.equal(safePath(new URL("http://127.0.0.1/app.js")), "/app.js");
assert.equal(safePath(new URL("http://127.0.0.1/journal.css")), "/journal.css");
assert.equal(safePath(new URL("http://127.0.0.1/assets/lucide.min.js")), "/assets/lucide.min.js");
assert.equal(safePath(new URL("http://127.0.0.1/assets/private.js")), null);
assert.equal(safePath(new URL("http://127.0.0.1/assets/life-design.jpg")), "/assets/life-design.jpg");
assert.equal(safePath(new URL("http://127.0.0.1/../secret")), null);
assert.equal(safePath(new URL("http://127.0.0.1/assets/file.svg")), null);

console.log("Server audit: static allowlist and path safety passed.");
