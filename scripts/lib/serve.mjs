// A tiny static server for the export in out/ — the same lookup order as the
// host (Cloudflare Pages): /x → x.html first (the export also writes an x/
// folder of data files), then x/index.html. Byte ranges for video. Extra
// routes can be mounted (e.g. a page that grabs a video frame).
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".woff2": "font/woff2",
  ".glb": "model/gltf-binary", ".fbx": "application/octet-stream", ".txt": "text/plain", ".xml": "application/xml", ".json": "application/json", ".wasm": "application/wasm",
};

/** Serve `dir`. `routes` maps an exact path to a handler(req, res).
 *  Returns { base, close }. */
export async function serve(dir, routes = {}) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (routes[p]) return routes[p](req, res);
    let f = resolve(join(root, p));
    if (!f.startsWith(root)) return res.writeHead(403).end();
    if (existsSync(f + ".html")) f += ".html";
    else if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    if (!existsSync(f)) {
      res.writeHead(404, { "content-type": "text/html" });
      return res.end(existsSync(join(root, "404.html")) ? readFileSync(join(root, "404.html")) : "not found");
    }
    const body = readFileSync(f);
    const type = TYPES[extname(f).toLowerCase()] ?? "application/octet-stream";
    const range = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
    if (range) {
      const a = +range[1], b = range[2] ? +range[2] : body.length - 1;
      res.writeHead(206, { "content-type": type, "content-range": `bytes ${a}-${b}/${body.length}`, "accept-ranges": "bytes", "content-length": b - a + 1 });
      return res.end(body.subarray(a, b + 1));
    }
    res.writeHead(200, { "content-type": type, "accept-ranges": "bytes" });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
