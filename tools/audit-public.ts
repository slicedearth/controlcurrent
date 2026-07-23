import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicRoot = resolve(root, "dist");
const MAX_FILE_BYTES = 2 * 1_024 * 1_024;
const MAX_TOTAL_BYTES = 25 * 1_024 * 1_024;
const textExtensions = new Set([".css", ".csv", ".html", ".js", ".json", ".svg", ".txt", ".xml"]);
const linkBearingExtensions = new Set([".csv", ".html", ".json", ".txt"]);
const deployingToPages = process.env.GITHUB_ACTIONS === "true";
const projectBase = "/controlcurrent/";
const prohibitedPatterns = [
  /(?:api|access|auth|secret)[_-]?key["']?\s*[:=]\s*["'][^"']{8,}/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_]{20,}\b/u,
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/iu
];
const requiredNoticeMarkers = [
  "Apache License",
  "Zod",
  "parse5",
  "entities",
  "MDN Browser Compatibility Data",
  "Web Platform Features"
];
const requiredPolicyMarkers = [
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "style-src-attr 'none'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "base-uri 'self'",
  "form-action 'none'"
];

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const files = await listFiles(publicRoot);
let total = 0;
for (const file of files) {
  const metadata = await stat(file);
  const publicPath = relative(publicRoot, file);
  total += metadata.size;
  if (metadata.size > MAX_FILE_BYTES) {
    throw new Error(`${relative(root, file)} exceeds ${String(MAX_FILE_BYTES)} bytes.`);
  }
  if (extname(file) === ".map") {
    throw new Error(`${relative(root, file)} exposes a production source map.`);
  }
  if (textExtensions.has(extname(file))) {
    const contents = await readFile(file, "utf8");
    for (const pattern of prohibitedPatterns) {
      if (pattern.test(contents)) {
        throw new Error(`${relative(root, file)} matches prohibited public content.`);
      }
    }
    if (
      linkBearingExtensions.has(extname(file)) &&
      contents.includes("http://") &&
      publicPath !== "third-party-notices.txt"
    ) {
      throw new Error(`${relative(root, file)} contains an insecure HTTP URL.`);
    }
    if (extname(file) === ".html") {
      const policyMatch =
        /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/iu.exec(contents);
      if (!policyMatch?.[1]) {
        throw new Error(`${relative(root, file)} has no static Content Security Policy.`);
      }
      const policy = policyMatch[1];
      if (/\b(?:href|src|action)\s*=\s*["']\s*(?:javascript:|data:text\/html)/iu.test(contents)) {
        throw new Error(`${relative(root, file)} contains an executable URL scheme.`);
      }
      if (/\son[a-z]+\s*=/iu.test(contents)) {
        throw new Error(`${relative(root, file)} contains an inline event handler.`);
      }
      if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/iu.test(contents)) {
        throw new Error(`${relative(root, file)} contains an inline script.`);
      }
      if (/<(?:script|img|iframe)\b[^>]*\bsrc\s*=\s*["']https?:/iu.test(contents)) {
        throw new Error(`${relative(root, file)} loads an external active resource.`);
      }
      if (
        /<(?:script|img|iframe)\b[^>]*\bsrc\s*=\s*["']\/\//iu.test(contents) ||
        /<link\b(?=[^>]*\brel\s*=\s*["']stylesheet["'])(?=[^>]*\bhref\s*=\s*["'](?:https?:|\/\/))/iu.test(
          contents
        )
      ) {
        throw new Error(
          `${relative(root, file)} loads an external stylesheet or protocol-relative active resource.`
        );
      }
      for (const marker of requiredPolicyMarkers) {
        if (!policy.includes(marker)) {
          throw new Error(`${relative(root, file)} is missing the ${marker} policy.`);
        }
      }
      if (policy.includes("'unsafe-inline'") || policy.includes("'unsafe-eval'")) {
        throw new Error(`${relative(root, file)} weakens executable-content policy.`);
      }
      if (policy.includes("frame-ancestors")) {
        throw new Error(
          `${relative(root, file)} incorrectly declares frame-ancestors through a meta policy.`
        );
      }
    }
    if (
      extname(file) === ".js" &&
      /\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\s*\(|EventSource\s*\(|sendBeacon\s*\()/u.test(
        contents
      )
    ) {
      throw new Error(`${relative(root, file)} contains a runtime network API.`);
    }
    if (
      deployingToPages &&
      extname(file) === ".html" &&
      /\b(?:href|src)="\/(?!controlcurrent(?:\/|"))/u.test(contents)
    ) {
      throw new Error(
        `${relative(root, file)} contains a root-relative URL outside ${projectBase}.`
      );
    }
  }
}
if (total > MAX_TOTAL_BYTES) {
  throw new Error(`Public build exceeds ${String(MAX_TOTAL_BYTES)} bytes.`);
}
const noticePath = resolve(publicRoot, "third-party-notices.txt");
const notice = await readFile(noticePath, "utf8");
for (const marker of requiredNoticeMarkers) {
  if (!notice.includes(marker)) {
    throw new Error(`dist/third-party-notices.txt is missing the ${marker} notice.`);
  }
}
if (deployingToPages) {
  const index = await readFile(resolve(publicRoot, "index.html"), "utf8");
  if (
    !index.includes('<link rel="canonical" href="https://slicedearth.github.io/controlcurrent/"')
  ) {
    throw new Error("The Pages build does not contain the expected project canonical URL.");
  }
  if (!index.includes('href="/controlcurrent/')) {
    throw new Error("The Pages build does not use the expected project base path.");
  }
}
console.log(
  `Audited ${String(files.length)} public files (${String(total)} bytes); no prohibited content found, third-party notices are present${deployingToPages ? ", and Pages URLs use /controlcurrent/" : ""}.`
);
