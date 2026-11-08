import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const port = Number(process.env.PORT || 4173);
createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname.replace(/^\/jupas-programmes(?:\/|$)/, "/");
  const path = resolve(root, `.${relative.endsWith("/") ? `${relative}index.html` : relative}`);
  if (!path.startsWith(root + sep)) { response.writeHead(403).end("Forbidden"); return; }
  try {
    const content = await readFile(path);
    response.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") response.writeHead(404).end("Not found");
    else { console.error(error); response.writeHead(500).end("Server error"); }
  }
}).listen(port, "127.0.0.1", () => console.log(`Preview: http://127.0.0.1:${port}/jupas-programmes/`));
