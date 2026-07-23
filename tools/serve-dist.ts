import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..", "dist");
const host = "127.0.0.1";
const port = 4389;
const types: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8"
};

function candidatePath(url: URL): string | undefined {
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }
  const relativePath = pathname.replace(/^\/+/u, "");
  const candidate = resolve(root, relativePath || "index.html");
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return undefined;
  return candidate;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${host}:${String(port)}`);
  const candidate = candidatePath(url);
  if (!candidate || !["GET", "HEAD"].includes(request.method ?? "")) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  let file = candidate;
  try {
    const metadata = await stat(file);
    if (metadata.isDirectory()) file = resolve(file, "index.html");
    const fileMetadata = await stat(file);
    if (!fileMetadata.isFile()) throw new Error("Not a file");
  } catch {
    file = resolve(root, "404.html");
    response.statusCode = 404;
  }

  response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    response.end("Internal server error");
  });
});

server.listen(port, host, () => {
  console.log(`Serving the built site at http://${host}:${String(port)}`);
});
