import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BridgeError, generateFinding, getCopilotStatus } from "./copilot-bridge.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".jpg": "image/jpeg",
};

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function safePath(url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!/^\/(index\.html|app\.js|styles\.css|theme\.css|journal\.css|assets\/lucide\.min\.js|assets\/[a-z0-9-]+\.jpg)$/.test(pathname)) return null;
  return pathname;
}

export function createServer({ generate = generateFinding, status = getCopilotStatus } = {}) {
let analyzing = false;
return http.createServer(async (request, response) => {
  const host = request.headers.host;
  if (!host || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return sendJson(response, 403, { error: "仅允许本机访问" });
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    const origin = request.headers.origin;
    if ((origin && origin !== `http://${host}`) || request.headers["sec-fetch-site"] === "cross-site") {
      return sendJson(response, 403, { error: "不允许跨站访问" });
    }
    if (request.method === "GET" && url.pathname === "/api/copilot/status") {
      try { return sendJson(response, 200, await status()); }
      catch { return sendJson(response, 503, { installed: false, error: "未能启动本机 Copilot，请确认安装与权限。" }); }
    }
    if (request.method !== "POST" || url.pathname !== "/api/copilot/findings") return sendJson(response, 404, { error: "接口不存在" });
    if (!request.headers["content-type"]?.startsWith("application/json") || request.headers["x-seeking-light"] !== "1") {
      return sendJson(response, 415, { error: "仅接受日记页面的 JSON 请求" });
    }
    if (analyzing) return sendJson(response, 429, { error: "已有一条分析正在进行，请稍后再试。" });
    const controller = new AbortController();
    response.on("close", () => { if (!response.writableEnded) controller.abort(); });
    try {
      analyzing = true;
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 128000) throw new BridgeError("记录太多，请缩小分析范围。", 413);
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString()); }
      catch { throw new BridgeError("请求内容格式不正确。", 400); }
      const result = await generate(input, { signal: controller.signal });
      if (!response.destroyed) sendJson(response, 200, result);
    } catch (error) {
      if (!response.destroyed) sendJson(response, error instanceof BridgeError ? error.status : 500,
        { error: error instanceof BridgeError ? error.message : "本次分析未完成，请稍后重试。" });
    } finally { analyzing = false; }
    return;
  }
  if (request.method !== "GET") return sendJson(response, 405, { error: "不支持此请求" });
  const pathname = safePath(url);
  if (!pathname) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    const file = await fs.readFile(path.join(root, pathname));
    response.writeHead(200, {
      "Content-Type": `${types[path.extname(pathname)]}; charset=utf-8`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
}

const server = createServer();

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, "127.0.0.1", () => {
    console.log(`寻光日记：http://127.0.0.1:${port}`);
  });
}

export { safePath, server };
