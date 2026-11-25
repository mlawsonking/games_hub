#!/usr/bin/env node
// Local preview that behaves like the Vercel deployment: serves public/, applies every header
// rule in vercel.json, redirects to trailing slashes, and answers unknown paths with 404.html.
//   node tools/serve.mjs [port]
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
const OUT = join(ROOT, vercel.outputDirectory || "public");
const PORT = Number(process.argv[2] || 4173);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".json": "application/json" };
// Vercel "source" patterns used here are path-to-regexp style: "/(.*)" and "/fonts/(.*)".
const rules = vercel.headers.map((r) => ({ re: new RegExp("^" + r.source.replace(/\(\.\*\)/g, "(.*)") + "$"), headers: r.headers }));

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const r of rules) if (r.re.test(path)) for (const h of r.headers) res.setHeader(h.key, h.value);
  let file = normalize(join(OUT, path));
  if (!file.startsWith(OUT)) { res.writeHead(400); return res.end(); }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (vercel.trailingSlash && !path.endsWith("/")) { res.writeHead(308, { Location: path + "/" }); return res.end(); }
    file = join(file, "index.html");
  }
  let status = 200;
  if (!existsSync(file)) { status = 404; file = join(OUT, "404.html"); }
  res.writeHead(status, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(req.method === "HEAD" ? undefined : readFileSync(file));
}).listen(PORT, () => console.log(`serving ${OUT} on http://localhost:${PORT}`));
