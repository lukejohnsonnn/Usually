// Runs the fetch handler on Node's http server, with static files from
// public/ and an app-shell fallback — the local-dev twin of the Worker.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

export const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

/** Static files from public/, falling back to index.html (the app shell). */
export async function serveStatic(req) {
  const url = new URL(req.url);
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  else if (!path.extname(rel) && fs.existsSync(path.join(PUBLIC_DIR, rel + ".html"))) rel += ".html"; // /privacy → privacy.html, like Cloudflare
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  const inside = file.startsWith(PUBLIC_DIR + path.sep);
  const target = inside && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(PUBLIC_DIR, "index.html");
  const ext = path.extname(target);
  return new Response(fs.readFileSync(target), {
    headers: {
      "content-type": TYPES[ext] || "application/octet-stream",
      "cache-control": /\.(html|webmanifest|js|css)$/.test(target) ? "no-cache" : "public, max-age=3600",
    },
  });
}

/** Start an http server around a fetch handler. Resolves to the listening server. */
export function listen(handle, port) {
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || "localhost";
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const request = new Request(`http://${host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: hasBody ? Readable.toWeb(req) : undefined,
        duplex: hasBody ? "half" : undefined,
      });
      const response = await handle(request, { ip: req.socket.remoteAddress || "unknown" });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error("[node] request failed:", err);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Something went wrong on our side. Please try again." }));
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
