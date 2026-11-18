// Static server for the demo and browser tests. Binds to 127.0.0.1 only and
// serves files from an allow-list of project folders.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowed = ["src", "demo", "test/browser", "node_modules/ag-grid-community/dist", "node_modules/xlsx/dist", "node_modules/ag-charts-community/dist/umd"].map((p) => join(root, p) + sep);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".map": "application/json" };
const port = Number(process.env.PORT ?? 5180);

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const target = normalize(join(root, pathname === "/" ? "demo/index.html" : pathname));
  if (!allowed.some((dir) => target.startsWith(dir))) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, { "content-type": `${types[extname(target)] ?? "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => console.log(`dex-grid demo on http://localhost:${port}`));
