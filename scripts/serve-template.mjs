import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4180);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};
const voicePath = "/api/admin-voice";
const maximumVoiceRequestBytes = 11 * 1024 * 1024;

function sendText(response, status, message) {
  response.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

async function proxyVoiceRequest(request, response) {
  if (request.method !== "POST") { sendText(response, 405, "Method not allowed"); return; }
  const workerUrl = process.env.OPENSLOT_VOICE_WORKER_URL;
  const workerToken = process.env.OPENSLOT_VOICE_WORKER_TOKEN;
  if (!workerUrl || !workerToken) {
    response.writeHead(503, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: { code: "VOICE_PROXY_NOT_CONFIGURED", message: "本地语音代理尚未配置。" } }));
    return;
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > maximumVoiceRequestBytes) { sendText(response, 413, "Request too large"); return; }
    chunks.push(chunk);
  }
  try {
    const upstream = await fetch(workerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerToken}`,
        "Content-Type": request.headers["content-type"] || "application/octet-stream",
      },
      body: Buffer.concat(chunks),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, {
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    });
    response.end(body);
  } catch {
    response.writeHead(502, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: { code: "NETWORK_ERROR", message: "无法连接语音服务。" } }));
  }
}

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", `http://${host}`).pathname);
    if (pathname === voicePath) { await proxyVoiceRequest(request, response); return; }
    let file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error("Invalid path");
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[path.extname(file).toLowerCase()] || "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
  }
}).listen(port, host, () => {
  console.log(`OpenSlot Template: http://${host}:${port}/template/`);
});
